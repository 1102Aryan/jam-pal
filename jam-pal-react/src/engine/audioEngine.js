import {
  BASELINE_RATE, ONSET_FACTOR, REFRACTORY, RMS_GATE, ONSET_GATE_DUR,
  ENERGY_ATTACK, ENERGY_RELEASE, LOCKED_FOLLOW_SCALE,
  BASS_NOTES, BASS_VELOCITY_LAYERS, BASS_ROUND_ROBINS, DRUM_KIT, GENRE_KITS, GENRE_FX,
  DEFAULT_OUTPUT_LATENCY, INPUT_LATENCY_EST, FEEDBACK_GUARD, BAND_HIT_TTL,
  CHORD_HOLD_SEC, CHORD_HOLD_MIN, NOTE_NAMES,
  TIMING_REFRACTORY, TIMING_WINDOW, TIMING_TIGHT_SEC, TIMING_ONBEAT_FRAC,
  TEMPO_LOOKAHEAD_BEATS, METERS,
} from './config.js';
import {
  computeSpectralFlux, updateChroma, detectKey, detectChord, updateTempo,
  wobbleToFollowRate, energyLevel,
} from './analysis.js';
import { createBeatPredictor } from './beatPredictor.js';
import { createChordPredictor } from './chordPredictor.js';

// Samples live under Vite's base URL, so fetch them relative to that rather
// than assuming a fixed path (base is '/' on the custom domain).
const SAMPLE_ROOT = import.meta.env.BASE_URL + 'samples/';
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
  let keyAnalyser = null;   // higher-resolution FFT dedicated to chroma/key
  let keyFreqBuf  = null;
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
  let meter            = METERS['4/4'];  // set per session from the chosen time sig

  let recorderNode     = null;  // taps band + mic, accumulates PCM while recording
  let recording        = false;
  let recLeft          = [];    // Float32 chunks per channel
  let recRight         = [];
  const samples        = {};
  const bandHits       = [];   // audible times of recent/upcoming band hits
  const beatTimes      = [];   // times the player *hears* each quarter beat
  const timingOffsets  = [];   // recent signed player-vs-beat offsets (seconds)
  let lastTimingOnset  = -1;
  // phase lock: track the player's placement so the band can sit WITH them.
  // phaseMean is the slow baseline (the constant latency/reaction lag — never
  // chased, or the grid would run away); phaseDev is the transient slip the band
  // gently follows.
  let phaseMean        = 0;
  let phaseDev         = 0;
  let phaseInit        = false;

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

    // phase lock: learn the slow baseline, then track only the deviation from it
    // (zero-mean → the per-bar nudge can't accumulate/run away)
    if (!phaseInit) { phaseMean = offset; phaseInit = true; }
    else            { phaseMean += 0.02 * (offset - phaseMean); }
    phaseDev += 0.30 * ((offset - phaseMean) - phaseDev);

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

    // raw FFT magnitudes (0-255) for the visualizer; fills `target` in place
    getFrequencyData(target) {
      if (!analyser) return false;
      analyser.getByteFrequencyData(target);
      return true;
    },
    getFrequencyBinCount: () => (analyser ? analyser.frequencyBinCount : 0),
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

    nudgeBpm(bpm) {
      if (bpmLocked || bpm == null) return;
      let b = bpm;
      while (b < 55 || b > 160) { if (b > 160) b/= 2; else b *- 2; }
      smoothedBPM += 0.05 * (b - smoothedBPM);
    },
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

    // set the time signature for this session (clicks, accents, beat grouping)
    setMeter(m) { meter = m || METERS['4/4']; },

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
      recorderNode.port.postMessage('start');
      callbacks.onRecordingChange?.(true);
      return true;
    },

    stopRecording() {
      if (!recording) return;
      recording = false;
      recorderNode?.port.postMessage('stop');
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

    // entry phase: project the player's pulse forward so the band's first
    // downbeat lands ON their beat — it comes in *with* them, not at a random
    // phase. Returns an audioCtx time, or null to fall back to "start now".
    getEntryBeatTime() {
      if (!audioCtx || lastOnsetTime < 0 || detectedBPM === null) return null;
      const period = 60 / smoothedBPM;
      const ahead  = audioCtx.currentTime + 0.12;   // a little lead for scheduling
      let t = lastOnsetTime;
      while (t < ahead) t += period;
      return t;
    },

    // gentle, leaky, clamped phase nudge the scheduler applies each bar so the
    // band tracks the player's timing slips while it plays (steady players only —
    // chasing a wobbling beginner would feel like seasickness)
    getPhaseCorrection() {
      if (!bandPlaying || bpmLocked || !phaseInit || smoothedWobble > 0.35) return 0;
      return Math.max(-0.008, Math.min(0.008, 0.25 * phaseDev));
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

    async start(deviceId = null, genre = 'rock') {
      try {
        const constraints = {
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1,
          },
        };
        if (deviceId) {
          constraints.audio.deviceId = { exact: deviceId };
        }

        micStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        callbacks.onStatus?.('Mic permission denied: ' + err.message);
        return false;
      }

      const AudioCtx = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
      audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      loadKit(genre);

      const fx = GENRE_FX[genre] ?? GENRE_FX.rock;

      bandBus = audioCtx.createGain();

      drumBus = audioCtx.createGain();
      drumBus.gain.value = drumVolume;
      drumBus.connect(bandBus);

      // bass chain: volume → low-shelf (weight) → amp compressor (Trio+-style
      // even, punchy bass that sits forward) → band bus
      bassBus = audioCtx.createGain();
      bassBus.gain.value = bassVolume;
      const bassShelf = audioCtx.createBiquadFilter();
      bassShelf.type = 'lowshelf';
      bassShelf.frequency.value = 140;
      bassShelf.gain.value = 2.5;        // gentle low-end lift (was +5 dB — boomy)
      const bassComp = audioCtx.createDynamicsCompressor();
      bassComp.threshold.value = -24;
      bassComp.knee.value      = 18;
      bassComp.ratio.value     = 6;      // firm — evens out the notes like a bass amp
      bassComp.attack.value    = 0.008;
      bassComp.release.value   = 0.12;
      bassBus.connect(bassShelf);
      bassShelf.connect(bassComp);
      bassComp.connect(bandBus);

      const comp = audioCtx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value      = 12;
      comp.ratio.value     = 4;
      comp.attack.value    = 0.003;
      comp.release.value   = 0.15;

      // per-session room: jitter the genre's room around its setting so the
      // space sounds a little different every play, never identical
      const jit  = (v, amt) => v * (1 + (Math.random() * 2 - 1) * amt);
      const verb = audioCtx.createConvolver();
      verb.buffer = makeRoomImpulse(audioCtx, jit(fx.roomSeconds, 0.25), jit(fx.roomDecay, 0.2));
      const send = audioCtx.createGain();
      send.gain.value = jit(fx.reverbSend, 0.2);

      // brickwall limiter on the master so loud hits (crashes) can't distort
      const limiter = audioCtx.createDynamicsCompressor();
      limiter.threshold.value = -2;
      limiter.knee.value      = 0;
      limiter.ratio.value     = 20;
      limiter.attack.value    = 0.002;
      limiter.release.value   = 0.12;

      // master tone: a per-genre high-shelf gives each style its brightness
      // (pop airy, rock present, blues/shoegaze warm) ahead of the glue comp
      const toneShelf = audioCtx.createBiquadFilter();
      toneShelf.type = 'highshelf';
      toneShelf.frequency.value = 3200;
      toneShelf.gain.value = fx.tone ?? 0;

      // pre-delay separates the wet reverb from the dry hit for a produced feel
      const predelay = audioCtx.createDelay(0.1);
      predelay.delayTime.value = fx.predelay ?? 0.015;

      bandBus.connect(toneShelf);
      toneShelf.connect(comp);
      comp.connect(limiter);             // dry path
      comp.connect(send);
      send.connect(predelay);
      predelay.connect(verb);
      verb.connect(limiter);             // wet (reverb) path
      limiter.connect(audioCtx.destination);

      // shared white-noise buffer for snare + hat synthesis
      const len = Math.floor(audioCtx.sampleRate * 0.2);
      noiseBuffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      const nd = noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;

      const source = audioCtx.createMediaStreamSource(micStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;             // fast time response for onset/tempo
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);

      // a separate, higher-resolution FFT for chroma/key — ~5.4 Hz bins resolve
      // low notes a semitone apart, which 2048 can't (it would blur the bass)
      keyAnalyser = audioCtx.createAnalyser();
      keyAnalyser.fftSize = 8192;
      keyAnalyser.smoothingTimeConstant = 0.5;
      source.connect(keyAnalyser);

      // recording tap: sum the band master (dry + reverb) and the mic into an
      // AudioWorklet that streams raw PCM to the main thread while recording (→ WAV)
      try {
        await audioCtx.audioWorklet.addModule(import.meta.env.BASE_URL + 'recorder-worklet.js');
        recorderNode = new AudioWorkletNode(audioCtx, 'recorder-worklet');
        recorderNode.port.onmessage = (e) => {
          recLeft.push(e.data.left);
          recRight.push(e.data.right);
        };
        limiter.connect(recorderNode);     // record the limited master (band)
        source.connect(recorderNode);      // + the mic
        recorderNode.connect(audioCtx.destination); // keeps it in the graph; outputs silence
      } catch (err) {
        console.warn('[JamPal] Recorder worklet failed to load — recording disabled', err);
        recorderNode = null;
      }

      timeBuf = new Float32Array(analyser.fftSize);
      keyFreqBuf = new Float32Array(keyAnalyser.frequencyBinCount);
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
      phaseMean = 0; phaseDev = 0; phaseInit = false;

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
        recorderNode.port.onmessage = null;
        try { recorderNode.disconnect(); } catch { /* not connected */ }
      }
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      if (micStream) micStream.getTracks().forEach(t => t.stop());
      if (audioCtx)  audioCtx.close();
      Object.keys(samples).forEach(k => delete samples[k]);
      audioCtx = analyser = keyAnalyser = keyFreqBuf = micStream = noiseBuffer = bandBus = drumBus = bassBus = recorderNode = null;
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
      keyAnalyser.getFloatFrequencyData(keyFreqBuf);
      updateChroma(chromaProfile, keyFreqBuf, keyAnalyser, audioCtx, now, onsetGateExpiry);
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
        // accent the bar's strong pulses (downbeat, plus the "4" in 6/8)
        const beatInBar = metronomeBeat % meter.beats;
        osc.frequency.value = meter.accentBeats.includes(beatInBar) ? 1000 : 800;
        env.gain.setValueAtTime(1, nextClickTime);
        env.gain.exponentialRampToValueAtTime(0.001, nextClickTime + 0.05);
        osc.connect(env);
        env.connect(metroBus);
        osc.start(nextClickTime);
        osc.stop(nextClickTime + 0.05);

        // one click per displayed beat: a quarter in 4/4 & 3/4, an eighth in 6/8
        nextClickTime += (60.0 / smoothedBPM) * (meter.stepsPerBeat / 4);
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
  async function loadKit(genre = 'rock') {
    // drum kit: samples.drums[name] = layers[] of takes[] of AudioBuffer.
    // Missing files are dropped silently; a drum with nothing loaded falls back
    // to synthesis. Layers/takes that end up empty are pruned.
    const kit = GENRE_KITS[genre] ?? DRUM_KIT;
    samples.drums = {};
    await Promise.all(Object.keys(kit).map(async (name) => {
      const layers = await Promise.all(
        kit[name].map(async (takes) => {
          const bufs = await Promise.all(
            takes.map(file =>
              loadSample(SAMPLE_ROOT + file).catch(() => null)
            )
          );
          return bufs.filter(Boolean);
        })
      );
      const nonEmpty = layers.filter(l => l.length);
      if (nonEmpty.length) samples.drums[name] = nonEmpty;
    }));
    const loaded = Object.keys(samples.drums);
    console.log(loaded.length ? `[JamPal] ${genre} drums loaded: ${loaded.join(', ')} ✓` : '[JamPal] No drum samples — using synthesis');

    // bass multisample — samples.bass[midi] = layers[] of takes[], same shape
    // as the drum kit: velocity layers soft → loud, each a round-robin of takes.
    // Missing files are dropped; a note with nothing loaded just isn't a
    // candidate (nearestSampleMidi skips it), and an empty kit falls back to synth.
    samples.bass = {};
    await Promise.all(Object.entries(BASS_NOTES).map(async ([note, midi]) => {
      const layers = await Promise.all(
        BASS_VELOCITY_LAYERS.map(async (dyn) => {
          const bufs = await Promise.all(
            BASS_ROUND_ROBINS.map(rr =>
              loadSample(`${SAMPLE_ROOT}bass/${note}_${dyn}_${rr}.ogg`).catch(() => null)
            )
          );
          return bufs.filter(Boolean);
        })
      );
      const nonEmpty = layers.filter(l => l.length);
      if (nonEmpty.length) samples.bass[midi] = nonEmpty;
    }));
    const nBass = Object.keys(samples.bass).length;
    console.log(nBass ? `[JamPal] Loaded ${nBass} bass notes (velocity + round-robin) ✓` : '[JamPal] No bass samples — using synth bass');
  }

  return api;
}
