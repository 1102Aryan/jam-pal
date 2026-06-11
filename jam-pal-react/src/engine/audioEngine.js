import {
  BASELINE_RATE, ONSET_FACTOR, REFRACTORY, RMS_GATE, ONSET_GATE_DUR,
  ENERGY_ATTACK, ENERGY_RELEASE,
} from './config.js';
import {
  computeSpectralFlux, updateChroma, detectKey, updateTempo,
  wobbleToFollowRate, energyLevel,
} from './analysis.js';

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
  let bassRootFreq     = 65.41; // C2
  let onsetGateExpiry  = 0;
  let keyFrameCount    = 0;
  let smoothedEnergy   = 0;
  let smoothedBPM      = 100;
  let bandPlaying      = false;

  // ---- public getters used by the scheduler ----
  const api = {
    getAudioCtx:     () => audioCtx,
    getNoiseBuffer:  () => noiseBuffer,
    getSmoothedBPM:  () => smoothedBPM,
    getBassRootFreq: () => bassRootFreq,
    getEnergyLevel:  () => energyLevel(smoothedEnergy),
    getDetectedBPM:  () => detectedBPM,
    getSmoothedWobble: () => smoothedWobble,
    isBandPlaying:   () => bandPlaying,
    setBandPlaying:  (v) => { bandPlaying = v; },

    // initialise smoothedBPM to detectedBPM so the band enters at your tempo
    snapToDetectedBPM() {
      if (detectedBPM !== null) smoothedBPM = detectedBPM;
    },

    // called every scheduler tick so the band tempo glides toward detected BPM
    syncBandBPM() {
      if (detectedBPM !== null) {
        smoothedBPM += wobbleToFollowRate(smoothedWobble) * (detectedBPM - smoothedBPM);
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

      timeBuf = new Float32Array(analyser.fftSize);
      fluxState.freqBuf = new Float32Array(analyser.frequencyBinCount);
      fluxState.prevMag = null;

      // reset analysis state
      fluxBaseline = 0; lastOnsetTime = -1; onsetTimes.length = 0;
      detectedBPM = null; lastDisplayedBPM = null; smoothedWobble = 0;
      chromaProfile.fill(0); detectedRoot = null; detectedMode = null;
      bassRootFreq = 65.41; onsetGateExpiry = 0; keyFrameCount = 0;
      smoothedEnergy = 0;

      listening = true;
      callbacks.onListeningChange?.(true);
      callbacks.onStatus?.('Listening. Strum chords or pick notes to set the tempo.');

      rafId = requestAnimationFrame(loop);
      return true;
    },

    stop() {
      listening = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      if (micStream) micStream.getTracks().forEach(t => t.stop());
      if (audioCtx)  audioCtx.close();
      audioCtx = analyser = micStream = noiseBuffer = null;
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
    updateChroma(chromaProfile, fluxState.freqBuf, analyser, audioCtx, now, onsetGateExpiry);

    if (++keyFrameCount % 30 === 0) {
      const result = detectKey(chromaProfile, detectedRoot, detectedMode);
      if (result) {
        detectedRoot  = result.root;
        detectedMode  = result.mode;
        bassRootFreq  = result.bassRootFreq;
        callbacks.onKey?.(result.name + ' ' + result.mode);
      }
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

    if (loudEnough && pastRefract && baselineReady && aboveGate) {
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

  return api;
}
