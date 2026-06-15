import { TIMING_TIGHT_SEC } from './config.js';

// ============================================================================
// Session stats collector — accumulates the signals the engine already emits
// during a jam (timing offsets, chords, BPM, energy) and produces a structured
// report at the end. Pure data: no UI, no AI. The report object is designed to
// be both human-readable and a clean input for a future AI feedback step.
//
//   const stats = createSessionStats();
//   stats.addTiming(offsetMs);  stats.addChord('Am');  stats.addBpm(96);  …
//   const report = stats.summarize();
// ============================================================================

const TIGHT_MS       = TIMING_TIGHT_SEC * 1000; // ±ms that counts as "in the pocket"
const ENERGY_MIN_GAP = 0.25;                    // throttle energy sampling (s)

// ---- small math helpers ----
const avg    = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const round  = (v, d = 0) => { const p = 10 ** d; return Math.round(v * p) / p; };
const clamp  = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pct    = (n, total) => total ? Math.round((n / total) * 100) : 0;
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const stdev  = (a) => { const m = avg(a); return Math.sqrt(avg(a.map(v => (v - m) ** 2))); };

export function createSessionStats() {
  const t0 = performance.now();
  const now = () => (performance.now() - t0) / 1000;

  const timing  = []; // { t, offsetMs }
  const chords  = []; // { t, label }
  const bpms    = []; // { t, bpm }
  const energy  = []; // { t, e }
  let lastEnergyT = -Infinity;

  return {
    addTiming(offsetMs) {
      if (Number.isFinite(offsetMs)) timing.push({ t: now(), offsetMs });
    },
    addChord(label) {
      if (label && (chords.length === 0 || chords[chords.length - 1].label !== label)) {
        chords.push({ t: now(), label });
      }
    },
    addBpm(bpm) {
      if (bpm) bpms.push({ t: now(), bpm });
    },
    addEnergy(e) {
      const t = now();
      if (Number.isFinite(e) && t - lastEnergyT >= ENERGY_MIN_GAP) {
        energy.push({ t, e });
        lastEnergyT = t;
      }
    },

    summarize() {
      return {
        durationSec: round(now()),
        notesGraded: timing.length,
        timing: summarizeTiming(timing),
        tempo:  summarizeTempo(bpms),
        chords: summarizeChords(chords),
        energy: summarizeEnergy(energy),
      };
    },
  };
}

// pocket % = share of graded onsets landing within ±TIGHT_MS of the beat
const pocketOf = (offs) => pct(offs.filter(o => Math.abs(o) <= TIGHT_MS).length, offs.length);

function summarizeTiming(entries) {
  if (entries.length < 3) return null;
  const offs = entries.map(e => e.offsetMs);
  const med  = median(offs);

  // first vs second half — did the player tighten up over the session?
  const half       = entries[entries.length - 1].t / 2;
  const firstOffs  = entries.filter(e => e.t <= half).map(e => e.offsetMs);
  const secondOffs = entries.filter(e => e.t >  half).map(e => e.offsetMs);

  return {
    pocketPct:      pocketOf(offs),
    medianOffsetMs: round(med),
    spreadMs:       round(stdev(offs)),                      // consistency (lower = tighter)
    tendency:       Math.abs(med) < 12 ? 'steady' : med < 0 ? 'rushing' : 'dragging',
    firstHalfPocketPct:  firstOffs.length  ? pocketOf(firstOffs)  : null,
    secondHalfPocketPct: secondOffs.length ? pocketOf(secondOffs) : null,
  };
}

function summarizeTempo(entries) {
  if (!entries.length) return null;
  const v    = entries.map(e => e.bpm);
  const mean = avg(v);
  const cv   = mean ? stdev(v) / mean : 0;            // coefficient of variation
  return {
    meanBpm:    Math.round(mean),
    minBpm:     Math.round(Math.min(...v)),
    maxBpm:     Math.round(Math.max(...v)),
    steadiness: round(clamp(1 - cv * 6, 0, 1), 2),    // 1 = rock steady, 0 = all over
  };
}

function summarizeChords(entries) {
  if (!entries.length) return null;
  const seq    = entries.map(e => e.label);
  const counts = {};
  for (const l of seq) counts[l] = (counts[l] || 0) + 1;
  const unique = Object.keys(counts);
  return {
    unique,
    distinct:   unique.length,
    changes:    seq.length,
    sequence:   seq.slice(0, 64),                                  // capped for readability
    mostPlayed: unique.reduce((a, b) => (counts[b] > counts[a] ? b : a), unique[0]),
  };
}

function summarizeEnergy(entries) {
  if (!entries.length) return null;
  const v = entries.map(e => e.e);
  return {
    mean:  round(avg(v), 2),
    min:   round(Math.min(...v), 2),
    max:   round(Math.max(...v), 2),
    range: round(Math.max(...v) - Math.min(...v), 2),  // dynamic range — did they vary?
  };
}
