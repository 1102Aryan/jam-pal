import { LOOKAHEAD_MS, SCHEDULE_AHEAD } from './config.js';

// The scheduler is a clock + renderer: it asks the brain what to play at each
// grid step and turns the returned events into sound. It knows nothing about
// styles, patterns, or musical decisions — that's all in bandBrain.js (and,
// later, a transformer behind the same interface).

// ---- renderers ----

function playSample(audioCtx, dest, buffer, time, gain) {
  if (!buffer) return false;
  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(gain, time);
  src.connect(g).connect(dest);
  src.start(time);
  return true;
}

// ---- synth voices (fallback when samples aren't loaded) ----

function playKick(audioCtx, dest, time, gain = 1) {
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.frequency.setValueAtTime(150, time);
  o.frequency.exponentialRampToValueAtTime(50, time + 0.12);
  g.gain.setValueAtTime(gain, time);
  g.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
  o.connect(g).connect(dest);
  o.start(time); o.stop(time + 0.2);
}

function playSnare(audioCtx, dest, noiseBuffer, time, gain = 0.7) {
  const n  = audioCtx.createBufferSource(); n.buffer = noiseBuffer;
  const hp = audioCtx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
  const g  = audioCtx.createGain();
  g.gain.setValueAtTime(gain, time);
  g.gain.exponentialRampToValueAtTime(0.01, time + 0.12);
  n.connect(hp).connect(g).connect(dest);
  n.start(time); n.stop(time + 0.15);
}

function playHat(audioCtx, dest, noiseBuffer, time, gain = 0.25, dur = 0.05) {
  const n  = audioCtx.createBufferSource(); n.buffer = noiseBuffer;
  const hp = audioCtx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
  const g  = audioCtx.createGain();
  g.gain.setValueAtTime(gain, time);
  g.gain.exponentialRampToValueAtTime(0.001, time + dur);
  n.connect(hp).connect(g).connect(dest);
  n.start(time); n.stop(time + dur + 0.01);
}

// ---- bass ----

const A4 = 440;
const midiToFreq = (m) => A4 * Math.pow(2, (m - 69) / 12);
const freqToMidi = (f) => 69 + 12 * Math.log2(f / A4);

// soft-clip curve — adds harmonics so the ear infers the (inaudible-on-laptop)
// fundamental, the way a real bass amp does
function makeSatCurve(k = 2.2) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x);
  }
  return c;
}
const SAT_CURVE = makeSatCurve(2.2);

// nearest recorded note (by MIDI distance) from the loaded multisample map
function nearestSampleMidi(bass, targetMidi) {
  let best = null, bestDist = Infinity;
  for (const k in bass) {
    const d = Math.abs(Number(k) - targetMidi);
    if (d < bestDist) { bestDist = d; best = Number(k); }
  }
  return best;
}

// Real sampled bass: repitch the nearest recorded note. The sample keeps its
// natural attack and body; we only gate the tail so notes connect (legato).
function playBassSample(audioCtx, dest, buffer, sampleMidi, targetFreq, ev, time) {
  const src  = audioCtx.createBufferSource();
  const g    = audioCtx.createGain();
  const rate = targetFreq / midiToFreq(sampleMidi);
  src.buffer = buffer;

  if (ev.slide) {
    src.playbackRate.setValueAtTime(rate * Math.pow(2, -1 / 12), time);
    src.playbackRate.exponentialRampToValueAtTime(rate, time + 0.05);
  } else {
    src.playbackRate.value = rate;
  }

  const s   = ev.sustain;
  const rel = Math.min(0.09, s * 0.35);
  g.gain.setValueAtTime(ev.gain, time);
  g.gain.setValueAtTime(ev.gain, time + Math.max(0.02, s - rel));
  g.gain.exponentialRampToValueAtTime(0.0008, time + s);

  src.connect(g).connect(dest);
  src.start(time); src.stop(time + s + 0.03);
}

// Synth fallback: triangle body + sub sine + quiet saw, soft-saturated, with a
// filter envelope and a short pluck transient. Sounds like a bass, not a buzz.
function playBassSynth(audioCtx, dest, noiseBuffer, targetFreq, ev, time) {
  const s   = ev.sustain;
  const rel = Math.min(0.08, s * 0.3);

  const shaper = audioCtx.createWaveShaper();
  shaper.curve = SAT_CURVE; shaper.oversample = '2x';

  const lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1600, time);
  lp.frequency.exponentialRampToValueAtTime(420, time + Math.min(0.25, s));

  const env = audioCtx.createGain();
  env.gain.setValueAtTime(0.0001, time);
  env.gain.linearRampToValueAtTime(ev.gain, time + 0.012);
  env.gain.exponentialRampToValueAtTime(ev.gain * 0.5, time + Math.max(0.05, s - rel));
  env.gain.exponentialRampToValueAtTime(0.0008, time + s);

  shaper.connect(lp).connect(env).connect(dest);

  const setFreq = (osc, f) => {
    if (ev.slide) {
      osc.frequency.setValueAtTime(f * Math.pow(2, -1 / 12), time);
      osc.frequency.exponentialRampToValueAtTime(f, time + 0.05);
    } else {
      osc.frequency.setValueAtTime(f, time);
    }
  };

  const voices = [
    ['triangle', targetFreq,     0.6 ],  // body
    ['sine',     targetFreq / 2, 0.5 ],  // sub-octave reinforcement
    ['sawtooth', targetFreq,     0.18],  // bite / definition
  ];
  for (const [type, f, level] of voices) {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type; setFreq(o, f); g.gain.value = level;
    o.connect(g).connect(shaper);
    o.start(time); o.stop(time + s + 0.05);
  }

  // finger-on-string pluck transient
  if (noiseBuffer) {
    const n  = audioCtx.createBufferSource(); n.buffer = noiseBuffer;
    const bp = audioCtx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8;
    const ng = audioCtx.createGain();
    ng.gain.setValueAtTime(ev.gain * 0.25, time);
    ng.gain.exponentialRampToValueAtTime(0.0005, time + 0.03);
    n.connect(bp).connect(ng).connect(dest);
    n.start(time); n.stop(time + 0.04);
  }
}

// ---- scheduler factory ----
// engine = object returned by createAudioEngine
// brain  = object implementing the bandBrain interface (see bandBrain.js)
export function createScheduler(engine, brain) {
  let playing        = false;
  let current16th    = 0;
  let nextNoteTime   = 0;
  let schedulerTimer = null;
  const noteQueue    = [];
  let lastQuarterLit = -1;
  let beatRafId      = null;
  let beatChangeCb   = null;
  let barCount       = 0;
  let onBarCb        = null;
  let muteMask       = { kick: false, snare: false, hat: false, bass: false };

  // which mute-mask channel each drum belongs to
  const MUTE_KEY = { kick: 'kick', snare: 'snare', hat: 'hat', openhat: 'hat', crash: 'hat' };

  function renderEvent(ev, time) {
    const audioCtx = engine.getAudioCtx();
    if (!audioCtx) return;
    const dest = engine.getBandBus() ?? audioCtx.destination;
    const t    = Math.max(time + (ev.dt || 0), audioCtx.currentTime);

    if (ev.kind === 'drum') {
      if (muteMask[MUTE_KEY[ev.drum]]) return;
      const smp         = engine.getSamples();
      const noiseBuffer = engine.getNoiseBuffer();
      switch (ev.drum) {
        case 'kick':
          if (!playSample(audioCtx, dest, smp.kick, t, ev.gain)) playKick(audioCtx, dest, t, ev.gain);
          break;
        case 'snare':
          if (!playSample(audioCtx, dest, smp.snare, t, ev.gain)) playSnare(audioCtx, dest, noiseBuffer, t, ev.gain);
          break;
        case 'hat':
          if (!playSample(audioCtx, dest, smp.hihat, t, ev.gain)) playHat(audioCtx, dest, noiseBuffer, t, ev.gain);
          break;
        case 'openhat':
          if (!playSample(audioCtx, dest, smp.openhat ?? smp.hihat, t, ev.gain)) playHat(audioCtx, dest, noiseBuffer, t, ev.gain * 1.3, 0.12);
          break;
        case 'crash':
          if (!playSample(audioCtx, dest, smp.crash ?? smp.openhat ?? smp.hihat, t, ev.gain)) playHat(audioCtx, dest, noiseBuffer, t, ev.gain * 1.4, 0.35);
          break;
      }
    } else if (ev.kind === 'bass') {
      if (muteMask.bass) return;
      const targetFreq = engine.getBassRootFreq() * Math.pow(2, ev.semi / 12);
      const bass = engine.getSamples().bass;
      if (bass && Object.keys(bass).length) {
        const sm = nearestSampleMidi(bass, freqToMidi(targetFreq));
        playBassSample(audioCtx, dest, bass[sm], sm, targetFreq, ev, t);
      } else {
        playBassSynth(audioCtx, dest, engine.getNoiseBuffer(), targetFreq, ev, t);
      }
    }
  }

  function scheduleStep(step, time) {
    if (step === 0) onBarCb?.(barCount++);

    const beatSec = 60 / engine.getSmoothedBPM();
    const events  = brain.step({
      step,
      barIdx: barCount - 1,
      energy: engine.getEnergyLevel(),
      beatSec,
      playerOnsets: engine.getRecentOnsetCount(beatSec * 4),
    });
    for (const ev of events) renderEvent(ev, time);

    noteQueue.push({ step, time });
  }

  function stepAdvance(step) {
    const s16 = (60.0 / engine.getSmoothedBPM()) / 4;
    return s16 * brain.stepAdvance(step);
  }

  function schedulerLoop() {
    if (!playing) return;
    const audioCtx = engine.getAudioCtx();
    engine.syncBandBPM();

    while (nextNoteTime < audioCtx.currentTime + SCHEDULE_AHEAD) {
      scheduleStep(current16th, nextNoteTime);
      nextNoteTime += stepAdvance(current16th);
      current16th = (current16th + 1) % 16;
    }
    schedulerTimer = setTimeout(schedulerLoop, LOOKAHEAD_MS);
  }

  function drawBeats() {
    const audioCtx = engine.getAudioCtx();
    if (audioCtx && playing) {
      const now = audioCtx.currentTime;
      let step = -1;
      while (noteQueue.length && noteQueue[0].time <= now) {
        step = noteQueue[0].step;
        noteQueue.shift();
      }
      if (step !== -1) {
        const q = Math.floor(step / 4);
        if (q !== lastQuarterLit) {
          beatChangeCb?.(q);
          lastQuarterLit = q;
        }
      }
    }
    beatRafId = requestAnimationFrame(drawBeats);
  }

  return {
    start(onBeat) {
      const audioCtx = engine.getAudioCtx();
      if (!audioCtx) return;
      beatChangeCb     = onBeat;
      playing          = true;
      engine.setBandPlaying(true);
      current16th      = 0;
      barCount         = 0;
      brain.reset();
      noteQueue.length = 0;
      lastQuarterLit   = -1;
      nextNoteTime     = audioCtx.currentTime + 0.1;
      schedulerLoop();
      beatRafId = requestAnimationFrame(drawBeats);
    },

    // ending: true plays a closing crash + root note so the band ends rather
    // than cutting off mid-groove (caller must keep the AudioContext alive
    // long enough for it to ring)
    stop({ ending = false } = {}) {
      if (ending && playing) {
        const audioCtx = engine.getAudioCtx();
        if (audioCtx) {
          const t = audioCtx.currentTime + 0.03;
          renderEvent({ kind: 'drum', drum: 'crash', gain: 0.4, dt: 0 }, t);
          renderEvent({ kind: 'bass', semi: 0, gain: 0.5, sustain: 0.6, dt: 0, slide: false }, t);
        }
      }
      playing = false;
      engine.setBandPlaying(false);
      clearTimeout(schedulerTimer);
      if (beatRafId) { cancelAnimationFrame(beatRafId); beatRafId = null; }
      beatChangeCb?.(null);
    },

    setMuteMask(m) { Object.assign(muteMask, m); },
    setOnBar(cb)   { onBarCb = cb; },
  };
}
