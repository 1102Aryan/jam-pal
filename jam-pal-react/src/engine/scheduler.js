import { LOOKAHEAD_MS, SCHEDULE_AHEAD, KICK_PATTERN, SNARE_PATTERN, BASS_PATTERN } from './config.js';

// ---- synth voices ----

function playKick(audioCtx, time, gain = 1) {
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.frequency.setValueAtTime(150, time);
  o.frequency.exponentialRampToValueAtTime(50, time + 0.12);
  g.gain.setValueAtTime(gain, time);
  g.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
  o.connect(g).connect(audioCtx.destination);
  o.start(time); o.stop(time + 0.2);
}

function playSnare(audioCtx, noiseBuffer, time, gain = 0.7) {
  const n  = audioCtx.createBufferSource(); n.buffer = noiseBuffer;
  const hp = audioCtx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
  const g  = audioCtx.createGain();
  g.gain.setValueAtTime(gain, time);
  g.gain.exponentialRampToValueAtTime(0.01, time + 0.12);
  n.connect(hp).connect(g).connect(audioCtx.destination);
  n.start(time); n.stop(time + 0.15);
}

function playHat(audioCtx, noiseBuffer, time, gain = 0.25) {
  const n  = audioCtx.createBufferSource(); n.buffer = noiseBuffer;
  const hp = audioCtx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
  const g  = audioCtx.createGain();
  g.gain.setValueAtTime(gain, time);
  g.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
  n.connect(hp).connect(g).connect(audioCtx.destination);
  n.start(time); n.stop(time + 0.06);
}

function playBass(audioCtx, bassRootFreq, semi, time, gain = 0.5) {
  const o  = audioCtx.createOscillator();
  const g  = audioCtx.createGain();
  const lp = audioCtx.createBiquadFilter();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(bassRootFreq * Math.pow(2, semi / 12), time);
  lp.type = 'lowpass'; lp.frequency.value = 700;
  g.gain.setValueAtTime(0.0001, time);
  g.gain.linearRampToValueAtTime(gain, time + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
  o.connect(lp).connect(g).connect(audioCtx.destination);
  o.start(time); o.stop(time + 0.4);
}

// ---- scheduler factory ----
// engine = object returned by createAudioEngine (provides getters + syncBandBPM)
// onBeatChange(quarterIndex: 0-3 | null) — called from rAF to light beat dots
export function createScheduler(engine) {
  let playing       = false;
  let current16th   = 0;
  let nextNoteTime  = 0;
  let schedulerTimer = null;
  const noteQueue   = [];
  let lastQuarterLit = -1;
  let beatRafId     = null;
  let beatChangeCb  = null;

  function scheduleStep(step, time) {
    const audioCtx    = engine.getAudioCtx();
    const noiseBuffer = engine.getNoiseBuffer();
    const e           = engine.getEnergyLevel();
    const bassRoot    = engine.getBassRootFreq();

    if (KICK_PATTERN[step])  playKick(audioCtx, time, 0.35 + 0.65 * e);
    if (SNARE_PATTERN[step]) playSnare(audioCtx, noiseBuffer, time, 0.25 + 0.75 * e);

    // hat density scales with energy: quarter → 8th → 16th notes
    const hatHit = e < 0.33 ? (step % 4 === 0)
                 : e < 0.66 ? (step % 2 === 0)
                 : true;
    if (hatHit) playHat(audioCtx, noiseBuffer, time, 0.08 + 0.22 * e);

    if (BASS_PATTERN[step] !== null) playBass(audioCtx, bassRoot, BASS_PATTERN[step], time, 0.20 + 0.30 * e);
    noteQueue.push({ step, time });
  }

  function schedulerLoop() {
    if (!playing) return;
    const audioCtx = engine.getAudioCtx();
    engine.syncBandBPM();

    while (nextNoteTime < audioCtx.currentTime + SCHEDULE_AHEAD) {
      scheduleStep(current16th, nextNoteTime);
      const secondsPer16th = (60.0 / engine.getSmoothedBPM()) / 4;
      nextNoteTime += secondsPer16th;
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
    // onBeat: (quarterIndex: 0-3) => void — called in sync with scheduled audio
    start(onBeat) {
      const audioCtx = engine.getAudioCtx();
      if (!audioCtx) return;
      beatChangeCb   = onBeat;
      playing        = true;
      engine.setBandPlaying(true);
      current16th    = 0;
      noteQueue.length = 0;
      lastQuarterLit = -1;
      nextNoteTime   = audioCtx.currentTime + 0.1;
      schedulerLoop();
      beatRafId = requestAnimationFrame(drawBeats);
    },

    stop() {
      playing = false;
      engine.setBandPlaying(false);
      clearTimeout(schedulerTimer);
      if (beatRafId) { cancelAnimationFrame(beatRafId); beatRafId = null; }
      beatChangeCb?.(null);
    },
  };
}
