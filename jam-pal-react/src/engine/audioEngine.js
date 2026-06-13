import {
  BASELINE_RATE, ONSET_FACTOR, REFRACTORY, RMS_GATE, ONSET_GATE_DUR,
  ENERGY_ATTACK, ENERGY_RELEASE, LOCKED_FOLLOW_SCALE, BASS_SAMPLE_MIDI,
} from './config.js';

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
  let bandBus          = null;
  const samples        = {};

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
    getSamples:      () => samples,
    getBandBus:      () => bandBus,

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

      // band bus: every band voice goes through one compressor ("glue") with
      // a small room-reverb send, instead of raw hits straight to the output
      bandBus = audioCtx.createGain();
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
      Object.keys(samples).forEach(k => delete samples[k]);
      audioCtx = analyser = micStream = noiseBuffer = bandBus = null;
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
  async function loadSample(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const ab = await res.arrayBuffer();
    return audioCtx.decodeAudioData(ab);
  }

  // each sample loads independently so one missing file (e.g. crash.wav)
  // doesn't knock out the whole kit — anything missing falls back to synthesis
  async function loadKit() {
    const names   = ['kick', 'snare', 'hihat', 'openhat', 'crash'];
    const results = await Promise.allSettled(names.map(n => loadSample(`/samples/${n}.wav`)));
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') samples[names[i]] = r.value;
      else console.warn(`[JamPal] ${names[i]}.wav not loaded — using synthesis:`, r.reason?.message);
    });

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
