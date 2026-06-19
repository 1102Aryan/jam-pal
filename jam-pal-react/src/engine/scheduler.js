import { LOOKAHEAD_MS, SCHEDULE_AHEAD, METERS } from './config.js';

// The scheduler is a clock + renderer: it asks the brain what to play at each
// grid step and turns the returned events into sound. It knows nothing about
// styles, patterns, or musical decisions — that's all in bandBrain.js (and,
// later, a transformer behind the same interface).

// renderers 

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

// synth audio (fallback when samples aren't loaded) 

function playKick(audioCtx, dest, time, gain = 1) {
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.frequency.setValueAtTime(150, time);
  o.frequency.exponentialRampToValueAtTime(45, time + 0.16);
  g.gain.setValueAtTime(gain, time);
  g.gain.exponentialRampToValueAtTime(0.001, time + 0.42); // longer tail — more body
  o.connect(g).connect(dest);
  o.start(time); o.stop(time + 0.45);
}

function playSnare(audioCtx, dest, noiseBuffer, time, gain = 0.7) {
  const n  = audioCtx.createBufferSource(); n.buffer = noiseBuffer;
  const hp = audioCtx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
  const g  = audioCtx.createGain();
  g.gain.setValueAtTime(gain, time);
  g.gain.exponentialRampToValueAtTime(0.01, time + 0.22); // longer ring-out
  n.connect(hp).connect(g).connect(dest);
  n.start(time); n.stop(time + 0.25);
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

//  bass 
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

// Synth fallback modelled on a bass DI + amp blend, in two parallel paths:
//   LOW  path (clean): sine fundamental + sub-octave → gentle lowpass — the deep
//                      foundation, never saturated so the bottom stays solid.
//   HARM path (driven): triangle + saw → soft saturation → filter envelope —
//                      adds the harmonics that read as "bass" on small speakers.
// A long release lets each note ring into the next instead of clipping off.
function playBassSynth(audioCtx, dest, noiseBuffer, targetFreq, ev, time) {
  const s   = ev.sustain;
  const rel = Math.min(0.18, s * 0.45); // generous release for a singing tail

  // shared amplitude envelope: fast attack, gentle pluck decay, long release
  const env = audioCtx.createGain();
  env.gain.setValueAtTime(0.0001, time);
  env.gain.linearRampToValueAtTime(ev.gain, time + 0.012);
  env.gain.exponentialRampToValueAtTime(ev.gain * 0.6, time + Math.max(0.06, s - rel));
  env.gain.exponentialRampToValueAtTime(0.0006, time + s + rel);
  env.connect(dest);

  const setFreq = (osc, f) => {
    if (ev.slide) {
      osc.frequency.setValueAtTime(f * Math.pow(2, -1 / 12), time);
      osc.frequency.exponentialRampToValueAtTime(f, time + 0.05);
    } else {
      osc.frequency.setValueAtTime(f, time);
    }
  };

  // ---- LOW path: clean fundamental + sub ----
  const lowLP = audioCtx.createBiquadFilter();
  lowLP.type = 'lowpass'; lowLP.frequency.value = 320;
  lowLP.connect(env);
  for (const [f, level] of [[targetFreq, 0.85], [targetFreq / 2, 0.55]]) {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine'; setFreq(o, f); g.gain.value = level;
    o.connect(g).connect(lowLP);
    o.start(time); o.stop(time + s + rel + 0.05);
  }

  //  HARM path: saturated harmonics with a bright to dark filter sweep 
  const shaper = audioCtx.createWaveShaper();
  shaper.curve = SAT_CURVE; shaper.oversample = '2x';
  const harmLP = audioCtx.createBiquadFilter();
  harmLP.type = 'lowpass';
  harmLP.frequency.setValueAtTime(1700, time);
  harmLP.frequency.exponentialRampToValueAtTime(450, time + Math.min(0.3, s));
  shaper.connect(harmLP).connect(env);
  for (const [type, level] of [['triangle', 0.5], ['sawtooth', 0.16]]) {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type; setFreq(o, targetFreq); g.gain.value = level;
    o.connect(g).connect(shaper);
    o.start(time); o.stop(time + s + rel + 0.05);
  }

  // finger-on-string pluck transient
  if (noiseBuffer) {
    const n  = audioCtx.createBufferSource(); n.buffer = noiseBuffer;
    const bp = audioCtx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8;
    const ng = audioCtx.createGain();
    ng.gain.setValueAtTime(ev.gain * 0.22, time);
    ng.gain.exponentialRampToValueAtTime(0.0005, time + 0.03);
    n.connect(bp).connect(ng).connect(dest);
    n.start(time); n.stop(time + 0.04);
  }
}

// scheduler factory 
// engine = object returned by createAudioEngine
// brain  = object implementing the bandBrain interface (see bandBrain.js)
export function createScheduler(engine, brain, meter = METERS['4/4']) {
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

  // looper: capture LOOP_BARS bars of the player's chords, then loop them
  const LOOP_BARS   = 4;
  let loopMode      = 'off';   // 'off' | 'arming' | 'recording' | 'playing'
  let loopChords    = [];      // captured { rootPc, quality } per bar
  let loopRecStart  = 0;
  let loopPlayStart = 0;
  let loopStatusCb  = null;

  const reportLoop = (bar = 0) => loopStatusCb?.({ mode: loopMode, bar, bars: LOOP_BARS });

  // advances the loop state machine once per bar (called at each downbeat)
  function handleLoopBar(bar) {
    if (loopMode === 'arming') {           // wait hit — start capturing this bar
      loopMode = 'recording';
      loopChords = [];
      loopRecStart = bar;
      reportLoop(1);
      return;
    }
    if (loopMode === 'recording') {
      // grab the chord from the bar that just finished
      loopChords.push(engine.getChord() ?? loopChords[loopChords.length - 1] ?? { rootPc: 0, quality: 'maj' });
      if (bar - loopRecStart >= LOOP_BARS) {
        loopMode = 'playing';              // captured them all — lock in and loop
        loopPlayStart = bar;
        engine.lockChord(true);
      } else {
        reportLoop(bar - loopRecStart + 1);
        return;
      }
    }
    if (loopMode === 'playing') {
      const idx = ((bar - loopPlayStart) % LOOP_BARS + LOOP_BARS) % LOOP_BARS;
      const c = loopChords[idx];
      if (c) engine.setChord(c.rootPc, c.quality);
      reportLoop(idx + 1);
    }
  }

  // which mute-mask channel each drum belongs to
  const MUTE_KEY = { kick: 'kick', snare: 'snare', hat: 'hat', openhat: 'hat', crash: 'hat' };

  // round-robin cursor per drum-layer, so repeated hits cycle through takes
  const rrCursor = {};

  // pick a buffer from a layers[]-of-takes[] structure (used by both the drum
  // kit and the bass multisample): choose the velocity layer from how hard the
  // hit is (`vel` 0–1), then advance that layer's round-robin to the next take.
  // `key` namespaces the round-robin cursor so layers don't share a counter.
  function pickFromLayers(layers, key, vel) {
    if (!layers || !layers.length) return null;
    const li    = Math.min(layers.length - 1, Math.floor(Math.min(vel, 0.999) * layers.length));
    const takes = layers[li];
    if (!takes.length) return null;
    const k    = `${key}:${li}`;
    const next = ((rrCursor[k] ?? -1) + 1) % takes.length;
    rrCursor[k] = next;
    return takes[next];
  }

  const pickDrumBuffer = (drumKit, name, gain) => pickFromLayers(drumKit?.[name], name, gain);

  // try each name in order (for fallback chains like crash → openhat → hihat)
  function pickFirst(drumKit, names, gain) {
    for (const n of names) {
      const b = pickDrumBuffer(drumKit, n, gain);
      if (b) return b;
    }
    return null;
  }

  function renderEvent(ev, time) {
    const audioCtx = engine.getAudioCtx();
    if (!audioCtx) return;
    const fallback = audioCtx.destination;
    const t        = Math.max(time + (ev.dt || 0), audioCtx.currentTime);

    if (ev.kind === 'drum') {
      if (muteMask[MUTE_KEY[ev.drum]]) return;
      const dest        = engine.getDrumBus() ?? engine.getBandBus() ?? fallback;
      const drumKit     = engine.getSamples().drums;
      const noiseBuffer = engine.getNoiseBuffer();
      // tell the engine when this hit will reach the mic, so it can reject it
      engine.registerBandHit(t + engine.getOutputLatency());
      switch (ev.drum) {
        case 'kick':
          if (!playSample(audioCtx, dest, pickDrumBuffer(drumKit, 'kick', ev.gain), t, ev.gain)) playKick(audioCtx, dest, t, ev.gain);
          break;
        case 'snare':
          if (!playSample(audioCtx, dest, pickDrumBuffer(drumKit, 'snare', ev.gain), t, ev.gain)) playSnare(audioCtx, dest, noiseBuffer, t, ev.gain);
          break;
        case 'hat':
          if (!playSample(audioCtx, dest, pickDrumBuffer(drumKit, 'hihat', ev.gain), t, ev.gain)) playHat(audioCtx, dest, noiseBuffer, t, ev.gain);
          break;
        case 'openhat':
          if (!playSample(audioCtx, dest, pickFirst(drumKit, ['openhat', 'hihat'], ev.gain), t, ev.gain)) playHat(audioCtx, dest, noiseBuffer, t, ev.gain * 1.3, 0.12);
          break;
        case 'crash':
          if (!playSample(audioCtx, dest, pickFirst(drumKit, ['crash', 'openhat', 'hihat'], ev.gain), t, ev.gain)) playHat(audioCtx, dest, noiseBuffer, t, ev.gain * 1.4, 0.35);
          break;
      }
    } else if (ev.kind === 'bass') {
      if (muteMask.bass) return;
      const dest       = engine.getBassBus() ?? engine.getBandBus() ?? fallback;
      const targetFreq = engine.getBassRootFreq() * Math.pow(2, ev.semi / 12);
      const bass = engine.getSamples().bass;
      if (bass && Object.keys(bass).length) {
        // velocity layer follows the band's energy (the bass's own gain still
        // shapes the level); round-robin keeps repeated notes from being identical
        const sm  = nearestSampleMidi(bass, freqToMidi(targetFreq));
        const buf = pickFromLayers(bass[sm], `bass${sm}`, engine.getEnergyLevel());
        if (buf) playBassSample(audioCtx, dest, buf, sm, targetFreq, ev, t);
        else     playBassSynth(audioCtx, dest, engine.getNoiseBuffer(), targetFreq, ev, t);
      } else {
        playBassSynth(audioCtx, dest, engine.getNoiseBuffer(), targetFreq, ev, t);
      }
    }
  }

  function scheduleStep(step, time) {
    if (step === 0) {
      const bar = barCount++;
      onBarCb?.(bar);
      handleLoopBar(bar);
    }

    // tell the engine when the player will hear each beat (timing feedback)
    if (step % meter.stepsPerBeat === 0) engine.registerBeat(time + engine.getOutputLatency());

    const beatSec = 60 / engine.getSmoothedBPM();
    const events  = brain.step({
      step,
      barIdx: barCount - 1,
      energy: engine.getEnergyLevel(),
      beatSec,
      chordQuality: engine.getChordQuality(),
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
      current16th = (current16th + 1) % meter.stepsPerBar;
      // at each bar line, ease the grid toward the player's actual placement
      if (current16th === 0) nextNoteTime += engine.getPhaseCorrection();
    }
    schedulerTimer = setTimeout(schedulerLoop, LOOKAHEAD_MS);
  }

  function drawBeats() {
    const audioCtx = engine.getAudioCtx();
    if (audioCtx && playing) {
      // light a beat when its audio is actually heard, not when it's scheduled
      const now = audioCtx.currentTime - engine.getOutputLatency();
      let step = -1;
      while (noteQueue.length && noteQueue[0].time <= now) {
        step = noteQueue[0].step;
        noteQueue.shift();
      }
      if (step !== -1) {
        const q = Math.floor(step / meter.stepsPerBeat);
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
      loopMode         = 'off';
      loopChords       = [];
      brain.reset();
      noteQueue.length = 0;
      lastQuarterLit   = -1;
      // come in on the player's pulse if we can read it, else just start now
      nextNoteTime     = engine.getEntryBeatTime() ?? (audioCtx.currentTime + 0.1);
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
      loopMode = 'off';
      loopChords = [];
      reportLoop();
    },

    setMuteMask(m) { Object.assign(muteMask, m); },
    setOnBar(cb)   { onBarCb = cb; },
    setOnLoopStatus(cb) { loopStatusCb = cb; },

    // arm the looper if idle, otherwise clear it (back to live chord following)
    toggleLoop() {
      if (loopMode === 'off') {
        if (playing) { loopMode = 'arming'; reportLoop(); }
      } else {
        loopMode = 'off';
        loopChords = [];
        engine.lockChord(false);
        reportLoop();
      }
    },
  };
}
