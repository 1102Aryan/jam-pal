import { createBrain } from './bandBrain.js';

// Calls the FastAPI backend for drum/bass bars (/generate) and transformer
// anticipation (/anticipate). Falls back to the local rule-based brain when
// the network is unavailable so the band never goes silent.

const ENDPOINT = import.meta.env.VITE_TRANSFORMER_URL || 'http://localhost:8000';
const ANTICIPATE_EVERY_BARS = 2;
const MAX_EVENTS = 32; // rolling chord-onset history fed to /anticipate

function toEngineEvents(rawEvents, ctx) {
  const out = [];
  for (const ev of rawEvents) {
    if (ev.kind === 'drum') {
      out.push({ kind: 'drum', drum: ev.drum, gain: ev.gain, dt: ev.dt || 0 });
    } else if (ev.kind === 'bass') {
      let semi = ev.semi;
      if (semi === 'third') semi = ctx.chordQuality === 'min' ? 3 : 4;
      out.push({
        kind: 'bass', semi, gain: ev.gain,
        sustain: (ev.sustainBeats ?? 1) * ctx.beatSec,
        dt: ev.dt || 0, slide: !!ev.slide,
      });
    }
  }
  return out;
}

export function createTransformerBrain({
  genre = 'rock', timeSig = '4/4', endpoint = ENDPOINT, lookahead = 2, lowWater = 1,
  onPrediction = null,
} = {}) {
  const fallback  = createBrain({ genre, timeSig });
  let buffer      = [];
  let curBar      = null;
  let fetching    = false;
  let anticipating = false;
  let barsSinceAnticipation = 0;

  // rolling list of chord-onset events sent to /anticipate
  // each entry: { time_sec, dur_sec, pitch } where pitch is chordRootPc + 48 (C3..B3)
  const recentEvents = [];
  let lastPrediction = null; // most recent /anticipate response

  let context = { energy: 0.5, playerOnsets: 4, recentChords: [], tier: 1 };

  function indexByStep(events) {
    const byStep = {};
    for (const ev of events) (byStep[ev.step] ??= []).push(ev);
    return byStep;
  }

  async function prefetch() {
    if (fetching) return;
    fetching = true;
    try {
      const body = {
        genre, timeSig, bars: lookahead,
        context: {
          ...context,
          ...(lastPrediction?.estimated_bpm != null && { estimatedBpm: lastPrediction.estimated_bpm }),
        },
      };
      const res = await fetch(`${endpoint}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        for (const bar of data.bars) buffer.push(indexByStep(bar.events));
      }
    } catch { /* offline — fallback brain keeps the band playing */ }
    finally { fetching = false; }
  }

  async function runAnticipation() {
    if (anticipating || recentEvents.length < 2) return;
    anticipating = true;
    try {
      // normalise times so the oldest event starts at t=0
      const t0 = recentEvents[0].time_sec;
      const notes = recentEvents.map(e => ({
        time_sec: +(e.time_sec - t0).toFixed(3),
        dur_sec:  e.dur_sec,
        pitch:    e.pitch,
      }));
      const res = await fetch(`${endpoint}/anticipate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recent_notes: notes, steps: 4, top_p: 0.95 }),
      });
      if (res.ok) {
        const data = await res.json();
        lastPrediction = data.predictions[0];
        onPrediction?.(lastPrediction)
        console.log('[transformer] anticipation →', lastPrediction);
      }
    } catch { /* offline */ }
    finally { anticipating = false; }
  }

  return {
    // Called by useJamEngine whenever a chord onset is detected.
    // timeSec = audioCtx.currentTime at the onset; pitch = chordRootPc + 48.
    addEvent(timeSec, pitch) {
      recentEvents.push({ time_sec: timeSec, dur_sec: 0.25, pitch });
      if (recentEvents.length > MAX_EVENTS) recentEvents.shift();
    },

    stepAdvance: (step) => fallback.stepAdvance(step),

    reset() {
      buffer    = [];
      curBar    = null;
      barsSinceAnticipation = 0;
      fallback.reset();
      prefetch();
    },

    step(ctx) {
      context = {
        energy:       ctx.energy,
        playerOnsets: ctx.playerOnsets,
        recentChords: context.recentChords,
        tier:         context.tier,
      };

      if (ctx.step === 0) {
        curBar = buffer.shift() ?? null;
        if (buffer.length <= lowWater) prefetch();

        barsSinceAnticipation++;
        if (barsSinceAnticipation >= ANTICIPATE_EVERY_BARS) {
          barsSinceAnticipation = 0;
          runAnticipation();
        }
      }

      // The backend only generates drum/bass bars, so the local groove brain
      // always runs too: it supplies the keys/guitar comping on top of the
      // transformer's rhythm section, and everything when the network is down.
      const fbEvents = fallback.step(ctx);
      if (!curBar) return fbEvents;
      const comping = fbEvents.filter(ev => ev.kind === 'keys' || ev.kind === 'guitar');
      return [...toEngineEvents(curBar[ctx.step] || [], ctx), ...comping];
    },
  };
}
