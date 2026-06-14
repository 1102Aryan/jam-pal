import {
  BASELINE_RATE, ONSET_FACTOR, REFRACTORY, RMS_GATE, ONSET_GATE_DUR,
  ENERGY_ATTACK, ENERGY_RELEASE, LOCKED_FOLLOW_SCALE, BASS_SAMPLE_MIDI, DRUM_KIT,
  DEFAULT_OUTPUT_LATENCY, INPUT_LATENCY_EST, FEEDBACK_GUARD, BAND_HIT_TTL,
  CHORD_HOLD_SEC, NOTE_NAMES,
  TIMING_REFRACTORY, TIMING_WINDOW, TIMING_TIGHT_SEC, TIMING_ONBEAT_FRAC,
} from './config.js';
import {
  computeSpectralFlux, updateChroma, detectKey, detectChord, updateTempo,
  wobbleToFollowRate, energyLevel,
} from './analysis.js';

const pcToBassFreq = (pc) => 440 * Math.pow(2, (36 + pc - 69) / 12); // C2..B2

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
  // candidate awaiting confirmation (hysteresis)
  let candRootPc       = null;
  let candSince        = 0;
  let smoothedEnergy   = 0;
  let smoothedBPM      = 100;
  let bandPlaying      = false;
  let bandBus          = null;
  let drumBus          = null;
  let bassBus          = null;
  let drumVolume       = 0.85;
  let bassVolume       = 1.0;
  let recordDest       = null;
  let mediaRecorder    = null;
  let recording        = false;
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

    // ---- recording: capture the jam (band + mic) to a downloadable file ----
    isRecording: () => recording,

    startRecording() {
      if (!audioCtx || !recordDest || recording) return false;
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/webm';
      const chunks = [];
      mediaRecorder = new MediaRecorder(recordDest.stream, { mimeType: mime });
      mediaRecorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mime });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url;
        a.download = `jam-pal-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      };
      mediaRecorder.start();
      recording = true;
      callbacks.onRecordingChange?.(true);
      return true;
    },

    stopRecording() {
      if (mediaRecorder && recording) {
        try { mediaRecorder.stop(); } catch { /* already stopped */ }
      }
      recording = false;
      mediaRecorder = null;
      callbacks.onRecordingChange?.(false);
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

    // called every scheduler tick so the band tempo glides toward detected BPM;
    // once the band is playing it follows less eagerly — it holds the pocket
    // and lets the player float rather than chasing every fluctuation
    syncBandBPM() {
      if (detectedBPM !== null) {
        smoothedBPM += LOCKED_FOLLOW_SCALE * wobbleToFollowRate(smoothedWobble) * (detectedBPM - smoothedBPM);
      }
    },

    async start() {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      } catch (err) {
        callbacks.onStatus?.('Mic permission denied: ' + err.message);
        return false;
      }

      const AudioCtx = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
      audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      loadKit(); // async — fills samples{}; synth voices are the fallback

      // Signal flow:
      //   drums → drumBus ─┐
      //                    ├→ bandBus → comp → destination
      //   bass → bassBus → lowShelf ─┘            └→ reverb send → destination
      // drumBus / bassBus are the user volume faders; the low shelf deepens the
      // bass; the compressor glues the kit; a small reverb send adds room.
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

      // recording tap: the band master (dry + reverb) plus the player's mic
      recordDest = audioCtx.createMediaStreamDestination();
      comp.connect(recordDest);
      verb.connect(recordDest);
      source.connect(recordDest);

      timeBuf = new Float32Array(analyser.fftSize);
      fluxState.freqBuf = new Float32Array(analyser.frequencyBinCount);
      fluxState.prevMag = null;

      // reset analysis state
      fluxBaseline = 0; lastOnsetTime = -1; onsetTimes.length = 0;
      detectedBPM = null; lastDisplayedBPM = null; smoothedWobble = 0;
      chromaProfile.fill(0); detectedRoot = null; detectedMode = null;
      bassRootFreq = 65.41; keyRootFreq = 65.41; onsetGateExpiry = 0;
      keyFrameCount = 0; chordFrameCount = 0;
      chordRootPc = null; chordQuality = 'maj'; lastChordLabel = null;
      chordLocked = false; candRootPc = null; candSince = 0;
      smoothedEnergy = 0; bandHits.length = 0;
      beatTimes.length = 0; timingOffsets.length = 0; lastTimingOnset = -1;

      listening = true;
      callbacks.onListeningChange?.(true);
      callbacks.onStatus?.('Listening. Strum chords or pick notes to set the tempo.');

      rafId = requestAnimationFrame(loop);
      return true;
    },

    stop() {
      listening = false;
      // finalise any in-progress recording so it still downloads
      if (mediaRecorder && recording) {
        try { mediaRecorder.stop(); } catch { /* already stopped */ }
      }
      recording = false; mediaRecorder = null;
      callbacks.onRecordingChange?.(false);
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      if (micStream) micStream.getTracks().forEach(t => t.stop());
      if (audioCtx)  audioCtx.close();
      Object.keys(samples).forEach(k => delete samples[k]);
      audioCtx = analyser = micStream = noiseBuffer = bandBus = drumBus = bassBus = recordDest = null;
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
        } else if (cand.rootPc === candRootPc) {
          if (now - candSince >= CHORD_HOLD_SEC) {
            chordRootPc  = cand.rootPc;
            chordQuality = cand.quality;
            bassRootFreq = pcToBassFreq(chordRootPc);
            candRootPc   = null;
            emitChord();
          }
        } else {
          candRootPc = cand.rootPc;   // new contender — start its timer
          candSince  = now;
        }
      }
      // no confident candidate → hold the current chord
    }

    fluxBaseline += BASELINE_RATE * (flux - fluxBaseline);

    // stale BPM — no onsets for > 3 s
    if (detectedBPM !== null && (now - lastOnsetTime) > 3.0) {
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
        const rounded = Math.round(detectedBPM);
        if (lastDisplayedBPM === null || Math.abs(rounded - lastDisplayedBPM) >= 3) {
          callbacks.onBpm?.(rounded);
          lastDisplayedBPM = rounded;
        }
      }
    }

    // glide smoothedBPM while band is not running
    if (!bandPlaying && detectedBPM !== null) {
      smoothedBPM += wobbleToFollowRate(smoothedWobble) * (detectedBPM - smoothedBPM);
    }

    rafId = requestAnimationFrame(loop);
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
