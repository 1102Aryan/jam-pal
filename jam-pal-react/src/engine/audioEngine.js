import {
  BASELINE_RATE, ONSET_FACTOR, REFRACTORY, RMS_GATE, ONSET_GATE_DUR,
  ENERGY_ATTACK, ENERGY_RELEASE, LOCKED_FOLLOW_SCALE, BASS_SAMPLE_MIDI, DRUM_KIT,
  DEFAULT_OUTPUT_LATENCY, INPUT_LATENCY_EST, FEEDBACK_GUARD, BAND_HIT_TTL,
  CHORD_HOLD_SEC, CHORD_HOLD_MIN, NOTE_NAMES,
  TIMING_REFRACTORY, TIMING_WINDOW, TIMING_TIGHT_SEC, TIMING_ONBEAT_FRAC,
  TEMPO_LOOKAHEAD_BEATS,
} from './config.js';
import {
  computeSpectralFlux, updateChroma, detectKey, detectChord, updateTempo,
  wobbleToFollowRate, energyLevel,
} from './analysis.js';
import { createBeatPredictor } from './beatPredictor.js';
import { createChordPredictor } from './chordPredictor.js';
// import { channel } from 'diagnostics_channel';

const pcToBassFreq = (pc) => 440 * Math.pow(2, (36 + pc - 69) / 12); // C2..B2

// Flatten an array of Float32 chunks into one contiguous buffer.
function concatFloat32(chunks) {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Float32Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

// Encode interleaved 16-bit PCM channels into a WAV Blob (no dependencies).
// Plays everywhere — QuickTime, VLC, DAWs, phones — and is lossless.
function encodeWav(channels, sampleRate) {
  const numCh = channels.length;
  const len   = channels[0].length;
  const buffer = new ArrayBuffer(44 + len * numCh * 2);
  const view   = new DataView(buffer);
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + len * numCh * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);            // fmt chunk size
  view.setUint16(20, 1, true);             // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numCh * 2, true); // byte rate
  view.setUint16(32, numCh * 2, true);     // block align
  view.setUint16(34, 16, true);            // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, len * numCh * 2, true);

  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}

// Exponentially decaying noise burst — a cheap, convincing room impulse
// response for the band's reverb send.
function makeRoomImpulse(ctx, seconds, decay) {
  const rate = ctx.sampleRate;
  const len  = Math.floor(rate * seconds);
  const buf  = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

// Factory that owns the AudioContext, mic, and the 60fps analysis loop.
// callbacks: { onRms, onBpm, onKey, onOnset, onEnergy, onStatus, onListeningChange }
export function createAudioEngine(callbacks = {}) {
  let audioCtx    = null;
  let analyser    = null;
  let micStream   = null;
  let noiseBuffer = null;
  let listening   = false;
  let rafId       = null;

  // mutable analysis state (not React state — updated every frame)
  const fluxState = { freqBuf: null, prevMag: null };
  let timeBuf          = null;
  let fluxBaseline     = 0;
  let lastOnsetTime    = -1;
  const onsetTimes     = [];
  let detectedBPM      = null;
  let lastDisplayedBPM = null;
  let smoothedWobble   = 0;
  const beatPredictor  = createBeatPredictor(); // anticipatory tempo model
  const chromaProfile  = new Float32Array(12).fill(0);
  let detectedRoot     = null;
  let detectedMode     = null;
  let bassRootFreq     = 65.41; // C2 — tracks the current chord root
  let keyRootFreq      = 65.41; // tonic fallback when no chord is detected yet
  let onsetGateExpiry  = 0;
  let keyFrameCount    = 0;
  let chordFrameCount  = 0;
  // current committed chord (forgiving): root pitch class + quality
  let chordRootPc      = null;
  let chordQuality     = 'maj';
  let lastChordLabel   = null;
  let chordLocked      = false; // when true the looper drives the chord, not the mic
  const chordPredictor = createChordPredictor(); // anticipates the next chord
  // candidate awaiting confirmation (hysteresis)
  let candRootPc       = null;
  let candQuality      = 'maj';
  let candSince        = 0;
  let smoothedEnergy   = 0;
  let smoothedBPM      = 100;
  let bpmLocked        = false;   // when true, the band tempo is pinned (manual)
  let bandPlaying      = false;
  let bandBus          = null;
  let drumBus          = null;
  let bassBus          = null;
  let drumVolume       = 0.85;
  let bassVolume       = 1.0;

  // Metronome — runs on its own AudioContext + timer (separate from the main
  // audioCtx). Armed by the button; clicks only while the session is playing.
  let metroCtx         = null;
  let metroBus         = null;
  let metroTimer       = null;
  let metroVolume      = 0.5;
  let isMetronomeOn    = false;
  let nextClickTime    = 0;
  let metronomeBeat    = 0;

  let recorderNode     = null;  // taps band + mic, accumulates PCM while recording
  let recording        = false;
  let recLeft          = [];    // Float32 chunks per channel
  let recRight         = [];
  const samples        = {};
  const bandHits       = [];   // audible times of recent/upcoming band hits
  const beatTimes      = [];   // times the player *hears* each quarter beat
  const timingOffsets  = [];   // recent signed player-vs-beat offsets (seconds)
  let lastTimingOnset  = -1;

  // fire onChord only when the displayed chord actually changes
  function emitChord() {
    if (chordRootPc === null) return;
    const label = NOTE_NAMES[chordRootPc] + (chordQuality === 'min' ? 'm' : '');
    if (label === lastChordLabel) return;
    lastChordLabel = label;
    callbacks.onChord?.(label, chordRootPc, chordQuality);
  }

  // Grade a player onset against the nearest beat the player heard. Accounts
  // for the round trip (output + input latency) so a perfectly-timed hit reads
  // ~0. Negative = early (rushing), positive = late (dragging). Onsets far from
  // any beat are treated as deliberate off-beat playing and skipped.
  function measureTiming(now) {
    if (beatTimes.length === 0) return;
    const play = now - INPUT_LATENCY_EST;

    let nearest = beatTimes[0], bestAbs = Math.abs(play - beatTimes[0]);
    for (let i = 1; i < beatTimes.length; i++) {
      const d = Math.abs(play - beatTimes[i]);
      if (d < bestAbs) { bestAbs = d; nearest = beatTimes[i]; }
    }

    const beatInterval = 60 / smoothedBPM;
    const offset = play - nearest;
    if (Math.abs(offset) > beatInterval * TIMING_ONBEAT_FRAC) return;

    timingOffsets.push(offset);
    if (timingOffsets.length > TIMING_WINDOW) timingOffsets.shift();

    const avg   = timingOffsets.reduce((a, b) => a + b, 0) / timingOffsets.length;
    const tight = timingOffsets.filter(o => Math.abs(o) <= TIMING_TIGHT_SEC).length / timingOffsets.length;
    callbacks.onTiming?.({ offsetMs: offset * 1000, avgMs: avg * 1000, tightness: tight });
  }

  // True when `now` falls inside the window where a band hit bleeds into the
  // mic — used to reject the band's own drums from onset/chroma detection.
  function bandHitNear(now) {
    const cutoff = now - BAND_HIT_TTL;
    for (let i = bandHits.length - 1; i >= 0; i--) {
      if (bandHits[i] < cutoff) break;
      const heard = bandHits[i] + INPUT_LATENCY_EST;
      if (now >= heard - FEEDBACK_GUARD && now <= heard + FEEDBACK_GUARD) return true;
    }
    return false;
  }

  // ---- public getters used by the scheduler ----
  const api = {
    getAudioCtx:     () => audioCtx,
    getNoiseBuffer:  () => noiseBuffer,
    getSmoothedBPM:  () => smoothedBPM,
    getBassRootFreq: () => bassRootFreq,
    getChordQuality: () => chordQuality,

    // ---- looper hooks: drive the chord from a recorded progression ----
    getChord: () => chordRootPc === null ? null : { rootPc: chordRootPc, quality: chordQuality },
    setChord(rootPc, quality) {
      chordRootPc  = rootPc;
      chordQuality = quality;
      bassRootFreq = pcToBassFreq(rootPc);
      emitChord();
    },
    lockChord(v) { chordLocked = v; },
    getEnergyLevel:  () => energyLevel(smoothedEnergy),
    getDetectedBPM:  () => detectedBPM,
    getSmoothedWobble: () => smoothedWobble,
    isBandPlaying:   () => bandPlaying,
    setBandPlaying:  (v) => { bandPlaying = v; },
    getSamples:      () => samples,
    getBandBus:      () => bandBus,
    getDrumBus:      () => drumBus,
    getBassBus:      () => bassBus,

    setDrumVolume(v) { drumVolume = v; if (drumBus) drumBus.gain.value = v; },
    setBassVolume(v) { bassVolume = v; if (bassBus) bassBus.gain.value = v; },
    getDrumVolume:   () => drumVolume,
    getBassVolume:   () => bassVolume,

    // ---- metronome controls ----
    // The button *arms* the metronome (stays lit), but it only clicks while the
    // session is playing — it goes silent on pause and resumes on play.
    toggleMetronome() {
      isMetronomeOn = !isMetronomeOn;
      if (isMetronomeOn && listening) startMetronome();
      else if (!isMetronomeOn)        stopMetronome();
      return isMetronomeOn;
    },
    setMetronomeVolume(v) {
      metroVolume = v;
      if (metroBus) metroBus.gain.value = v;
    },

    // ---- tempo lock ----
    // Pin the band tempo to whatever it is right now so it stops auto-following
    // the player; the displayed BPM freezes too. Toggling off resumes following.
    toggleLock() {
      bpmLocked = !bpmLocked;
      if (bpmLocked) {
        const locked = Math.round(smoothedBPM);
        lastDisplayedBPM = locked;
        callbacks.onBpm?.(locked);
      }
      return bpmLocked;
    },

    // ---- recording: capture the jam ----
    isRecording: () => recording,

    startRecording() {
      if (!audioCtx || !recorderNode || recording) return false;
      recLeft = [];
      recRight = [];
      recording = true;
      callbacks.onRecordingChange?.(true);
      return true;
    },

    stopRecording() {
      if (!recording) return;
      recording = false;
      callbacks.onRecordingChange?.(false);

      if (recLeft.length) {
        const left  = concatFloat32(recLeft);
        const right = concatFloat32(recRight);
        const blob  = encodeWav([left, right], audioCtx.sampleRate);
        const url   = URL.createObjectURL(blob);
        const a     = document.createElement('a');
        a.href = url;
        a.download = `jam-pal-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.wav`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
      recLeft = [];
      recRight = [];
    },

    // seconds between a scheduled sample and it actually leaving the speakers
    getOutputLatency: () =>
      audioCtx ? (audioCtx.outputLatency || audioCtx.baseLatency || DEFAULT_OUTPUT_LATENCY)
               : DEFAULT_OUTPUT_LATENCY,

    // scheduler reports each band hit's audible time so we can reject it from
    // the mic analysis (feedback rejection)
    registerBandHit(audibleTime) {
      bandHits.push(audibleTime);
      const cutoff = (audioCtx?.currentTime ?? 0) - BAND_HIT_TTL;
      while (bandHits.length && bandHits[0] < cutoff) bandHits.shift();
    },

    // scheduler reports when the player *hears* each quarter beat, so timing
    // feedback can grade the player's onsets against the groove
    registerBeat(heardTime) {
      beatTimes.push(heardTime);
      const cutoff = (audioCtx?.currentTime ?? 0) - 2.0;
      while (beatTimes.length && beatTimes[0] < cutoff) beatTimes.shift();
    },

    // player onsets within the last `seconds` — the brain uses this to thin
    // out when the player goes sparse
    getRecentOnsetCount(seconds) {
      if (!audioCtx) return 0;
      const cutoff = audioCtx.currentTime - seconds;
      let n = 0;
      for (let i = onsetTimes.length - 1; i >= 0 && onsetTimes[i] > cutoff; i--) n++;
      return n;
    },

    // initialise smoothedBPM to detectedBPM so the band enters at your tempo
    snapToDetectedBPM() {
      if (detectedBPM !== null) smoothedBPM = detectedBPM;
    },

    // called every scheduler tick so the band tempo glides toward the player's
    // *forecast* tempo (anticipation), not the laggy past tempo; once playing it
    // follows less eagerly — holding the pocket while still leaning the right way
    syncBandBPM() {
      if (bpmLocked) return;           // tempo pinned — don't follow the player
      if (detectedBPM !== null) {
        const target = beatPredictor.predict(TEMPO_LOOKAHEAD_BEATS);
        smoothedBPM += LOCKED_FOLLOW_SCALE * wobbleToFollowRate(smoothedWobble) * (target - smoothedBPM);
      }
    },

    async start(deviceId = null) {
      try {
        const constraints = {
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1
          }
        };
        if (deviceId) {
          constraints.audio.device = { exact: deviceId };
        }

        micStream = await navigator.mediaDevices.getUserMedia(constraints);

      } catch (e) {
        callbacks.onStatus?.('Audio Input failed: ', e.message);
        return false;
      }

      const AudioCtx = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
      audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      loadKit();

      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      } catch (err) {
        callbacks.onStatus?.('Mic permission denied: ' + err.message);
        return false;
      }


      bandBus = audioCtx.createGain();

      drumBus = audioCtx.createGain();
      drumBus.gain.value = drumVolume;
      drumBus.connect(bandBus);

      bassBus = audioCtx.createGain();
      bassBus.gain.value = bassVolume;
      const bassShelf = audioCtx.createBiquadFilter();
      bassShelf.type = 'lowshelf';
      bassShelf.frequency.value = 140;
      bassShelf.gain.value = 5;          // +5 dB low end for weight
      bassBus.connect(bassShelf);
      bassShelf.connect(bandBus);

      const comp = audioCtx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value      = 12;
      comp.ratio.value     = 4;
      comp.attack.value    = 0.003;
      comp.release.value   = 0.15;
      const verb = audioCtx.createConvolver();
      verb.buffer = makeRoomImpulse(audioCtx, 1.1, 2.8);
      const send = audioCtx.createGain();
      send.gain.value = 0.16;
      bandBus.connect(comp);
      comp.connect(audioCtx.destination);
      comp.connect(send);
      send.connect(verb);
      verb.connect(audioCtx.destination);

      // shared white-noise buffer for snare + hat synthesis
      const len = Math.floor(audioCtx.sampleRate * 0.2);
      noiseBuffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      const nd = noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;

      const source = audioCtx.createMediaStreamSource(micStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);

      // recording tap: sum the band master (dry + reverb) and the mic into a
      // script processor that accumulates raw PCM while recording (→ WAV)
      recorderNode = audioCtx.createScriptProcessor(4096, 2, 2);
      recorderNode.onaudioprocess = (e) => {
        if (!recording) return;
        const ib = e.inputBuffer;
        recLeft.push(ib.getChannelData(0).slice());
        recRight.push(ib.getChannelData(ib.numberOfChannels > 1 ? 1 : 0).slice());
      };
      comp.connect(recorderNode);
      verb.connect(recorderNode);
      source.connect(recorderNode);
      recorderNode.connect(audioCtx.destination); // must be connected to run; outputs silence

      timeBuf = new Float32Array(analyser.fftSize);
      fluxState.freqBuf = new Float32Array(analyser.frequencyBinCount);
      fluxState.prevMag = null;

      // reset analysis state
      fluxBaseline = 0; lastOnsetTime = -1; onsetTimes.length = 0;
      detectedBPM = null; lastDisplayedBPM = null; smoothedWobble = 0;
      beatPredictor.reset(smoothedBPM);
      chromaProfile.fill(0); detectedRoot = null; detectedMode = null;
      bassRootFreq = 65.41; keyRootFreq = 65.41; onsetGateExpiry = 0;
      keyFrameCount = 0; chordFrameCount = 0;
      chordRootPc = null; chordQuality = 'maj'; lastChordLabel = null;
      chordLocked = false; candRootPc = null; candQuality = 'maj'; candSince = 0;
      chordPredictor.reset();
      smoothedEnergy = 0; bandHits.length = 0;
      beatTimes.length = 0; timingOffsets.length = 0; lastTimingOnset = -1;

      listening = true;
      callbacks.onListeningChange?.(true);
      callbacks.onStatus?.('Listening. Strum chords or pick notes to set the tempo.');

      // resume the click if the metronome was left armed while paused
      if (isMetronomeOn) startMetronome();

      rafId = requestAnimationFrame(loop);
      return true;
    },

    stop() {
      listening = false;
      // silence the click on pause, but leave it armed (button stays lit)
      stopMetronome();
      // finalise any in-progress recording so it still downloads (before the
      // context closes — encoding needs audioCtx.sampleRate)
      api.stopRecording();
      if (recorderNode) {
        recorderNode.onaudioprocess = null;
        try { recorderNode.disconnect(); } catch { /* not connected */ }
      }
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      if (micStream) micStream.getTracks().forEach(t => t.stop());
      if (audioCtx)  audioCtx.close();
      Object.keys(samples).forEach(k => delete samples[k]);
      audioCtx = analyser = micStream = noiseBuffer = bandBus = drumBus = bassBus = recorderNode = null;
      callbacks.onListeningChange?.(false);
      callbacks.onStatus?.('Stopped.');
      callbacks.onRms?.(0);
      callbacks.onBpm?.(null);
      callbacks.onKey?.(null);
    },
  };

  function loop() {
    if (!listening) return;

    // RMS energy
    analyser.getFloatTimeDomainData(timeBuf);
    let sumSq = 0;
    for (let i = 0; i < timeBuf.length; i++) sumSq += timeBuf[i] * timeBuf[i];
    const rms = Math.sqrt(sumSq / timeBuf.length);
    callbacks.onRms?.(rms);

    // dynamics envelope
    const eRate = rms > smoothedEnergy ? ENERGY_ATTACK : ENERGY_RELEASE;
    smoothedEnergy += eRate * (rms - smoothedEnergy);
    callbacks.onEnergy?.(energyLevel(smoothedEnergy));

    const now  = audioCtx.currentTime;
    const flux = computeSpectralFlux(analyser, audioCtx, fluxState);

    // when the band's own hit is bleeding into the mic, skip detection so we
    // track the player and not our own drums
    const bandBleed = bandPlaying && bandHitNear(now);
    if (!bandBleed) {
      updateChroma(chromaProfile, fluxState.freqBuf, analyser, audioCtx, now, onsetGateExpiry);
    }

    if (++keyFrameCount % 30 === 0) {
      const result = detectKey(chromaProfile, detectedRoot, detectedMode);
      if (result) {
        detectedRoot  = result.root;
        detectedMode  = result.mode;
        keyRootFreq   = result.bassRootFreq;
        // until a chord is confidently detected, the bass sits on the tonic
        if (chordRootPc === null) bassRootFreq = keyRootFreq;
        callbacks.onKey?.(result.name + ' ' + result.mode);
      }
    }

    // ---- chord following (forgiving) ----
    // detect the current chord, but only switch the band to a *different* root
    // once it has persisted (hysteresis); a fleeting wrong note never yanks it
    if (!chordLocked && ++chordFrameCount % 15 === 0) {
      const cand = detectChord(chromaProfile, chordQuality);
      if (cand) {
        if (cand.rootPc === chordRootPc) {
          chordQuality = cand.quality;   // same root: refine maj/min freely
          candRootPc = null;
          emitChord();
        } else if (cand.rootPc === candRootPc && cand.quality === candQuality) {
          // shorten the wait when the change is harmonically expected, keep the
          // full cautious wait when it's a surprise (anticipation)
          const from = chordRootPc === null ? null : { rootPc: chordRootPc, quality: chordQuality };
          const to   = { rootPc: cand.rootPc, quality: cand.quality };
          const hold = CHORD_HOLD_MIN + (1 - chordPredictor.score(from, to)) * (CHORD_HOLD_SEC - CHORD_HOLD_MIN);
          if (now - candSince >= hold) {
            chordPredictor.observe(from, to); // learn the player's progression
            chordRootPc  = cand.rootPc;
            chordQuality = cand.quality;
            bassRootFreq = pcToBassFreq(chordRootPc);
            candRootPc   = null;
            emitChord();
          }
        } else {
          candRootPc  = cand.rootPc;    // new contender — start its timer
          candQuality = cand.quality;
          candSince   = now;
        }
      }
      // no confident candidate → hold the current chord
    }

    fluxBaseline += BASELINE_RATE * (flux - fluxBaseline);

    // stale BPM — no onsets for > 3 s (but keep the frozen reading while locked)
    if (!bpmLocked && detectedBPM !== null && (now - lastOnsetTime) > 3.0) {
      detectedBPM = null; lastDisplayedBPM = null;
      callbacks.onBpm?.(null);
    }

    const loudEnough    = flux > fluxBaseline * ONSET_FACTOR;
    const pastRefract   = (now - lastOnsetTime) > REFRACTORY;
    const baselineReady = fluxState.prevMag !== null && fluxBaseline > 1e-6;
    const aboveGate     = rms > RMS_GATE;

    // timing feedback runs on its own (shorter) refractory and is NOT
    // feedback-rejected — it needs the on-beat onsets that the tempo path drops
    if (bandPlaying && loudEnough && baselineReady && aboveGate &&
        (now - lastTimingOnset) > TIMING_REFRACTORY) {
      lastTimingOnset = now;
      measureTiming(now);
    }

    if (loudEnough && pastRefract && baselineReady && aboveGate && !bandBleed) {
      lastOnsetTime   = now;
      onsetGateExpiry = now + ONSET_GATE_DUR;
      onsetTimes.push(now);
      callbacks.onOnset?.();

      const tempo = updateTempo(onsetTimes, smoothedWobble);
      if (tempo) {
        detectedBPM   = tempo.detectedBPM;
        smoothedWobble = tempo.smoothedWobble;
        beatPredictor.observe(detectedBPM, smoothedWobble, now); // feed the anticipatory model
        const rounded = Math.round(detectedBPM);
        if (!bpmLocked && (lastDisplayedBPM === null || Math.abs(rounded - lastDisplayedBPM) >= 3)) {
          callbacks.onBpm?.(rounded);
          lastDisplayedBPM = rounded;
        }
      }
    }

    // glide smoothedBPM while band is not running — toward the *forecast*, not
    // the laggy past tempo, so the band is already at speed when it enters
    if (!bpmLocked && !bandPlaying && detectedBPM !== null) {
      const target = beatPredictor.predict(TEMPO_LOOKAHEAD_BEATS);
      smoothedBPM += wobbleToFollowRate(smoothedWobble) * (target - smoothedBPM);
    }

    rafId = requestAnimationFrame(loop);
  }

  // Standalone metronome: its own AudioContext + timer (kept separate from the
  // main audioCtx). Started on play, stopped on pause. Schedules clicks with a
  // lookahead and follows smoothedBPM.
  function startMetronome() {
    if (!metroCtx) {
      const AudioCtx = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
      metroCtx = new AudioCtx();
      metroBus = metroCtx.createGain();
      metroBus.gain.value = metroVolume;
      metroBus.connect(metroCtx.destination);
    }
    metroCtx.resume?.();
    nextClickTime = metroCtx.currentTime + 0.05;
    metronomeBeat = 0;

    if (metroTimer) clearInterval(metroTimer);
    const lookahead = 0.1;
    metroTimer = setInterval(() => {
      const now = metroCtx.currentTime;
      if (nextClickTime < now) nextClickTime = now; // catch up after a stall
      while (nextClickTime < now + lookahead) {
        const osc = metroCtx.createOscillator();
        const env = metroCtx.createGain();
        osc.frequency.value = (metronomeBeat % 4 === 0) ? 1000 : 800;
        env.gain.setValueAtTime(1, nextClickTime);
        env.gain.exponentialRampToValueAtTime(0.001, nextClickTime + 0.05);
        osc.connect(env);
        env.connect(metroBus);
        osc.start(nextClickTime);
        osc.stop(nextClickTime + 0.05);

        nextClickTime += 60.0 / smoothedBPM;
        metronomeBeat++;
      }
    }, 25);
  }

  function stopMetronome() {
    if (metroTimer) { clearInterval(metroTimer); metroTimer = null; }
    if (metroCtx)   { metroCtx.close(); metroCtx = metroBus = null; }
  }

  async function loadSample(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const ab = await res.arrayBuffer();
    return audioCtx.decodeAudioData(ab);
  }

  // each sample loads independently so one missing file (e.g. crash.wav)
  // doesn't knock out the whole kit — anything missing falls back to synthesis
  async function loadKit() {
    // drum kit: samples.drums[name] = layers[] of takes[] of AudioBuffer.
    // Missing files are dropped silently; a drum with nothing loaded falls back
    // to synthesis. Layers/takes that end up empty are pruned.
    samples.drums = {};
    await Promise.all(Object.keys(DRUM_KIT).map(async (name) => {
      const layers = await Promise.all(
        DRUM_KIT[name].map(async (takes) => {
          const bufs = await Promise.all(
            takes.map(file =>
              loadSample(`/samples/${file}`).catch(() => null)
            )
          );
          return bufs.filter(Boolean);
        })
      );
      const nonEmpty = layers.filter(l => l.length);
      if (nonEmpty.length) samples.drums[name] = nonEmpty;
    }));
    const loaded = Object.keys(samples.drums);
    console.log(loaded.length ? `[JamPal] Drums loaded: ${loaded.join(', ')} ✓` : '[JamPal] No drum samples — using synthesis');

    // bass multisample — keyed by MIDI note; missing notes just don't load
    samples.bass = {};
    const bassResults = await Promise.allSettled(
      BASS_SAMPLE_MIDI.map(m => loadSample(`/samples/bass-${m}.wav`))
    );
    bassResults.forEach((r, i) => {
      if (r.status === 'fulfilled') samples.bass[BASS_SAMPLE_MIDI[i]] = r.value;
    });
    const nBass = Object.keys(samples.bass).length;
    console.log(nBass ? `[JamPal] Loaded ${nBass} bass samples ✓` : '[JamPal] No bass samples — using synth bass');
  }

  return api;
}
