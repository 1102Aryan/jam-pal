import {
  KICK_PATTERN, SNARE_PATTERN, BASS_PATTERN,
  BLUES_ACCENT, BLUES_SNARE, BLUES_KICK_POOL, BLUES_HAT_POOL,
  BLUES_TWELVE_BAR, CHORD_ROOTS, BLUES_BASS_PATTERNS, BLUES_TURNAROUND_BASS,
  BLUES_BAR_DYNAMICS, BLUES_FILLS,
  HUMAN_TIME_JITTER, GHOST_SNARE_GAIN, EXTRA_KICK_PROB, PHRASE_BARS,
  SPARSE_ONSETS, TIER_UP, TIER_DOWN, PERSONALITY_RANGES,
} from './config.js';

// ============================================================================
// The band "brain" decides WHAT to play. The scheduler keeps the clock and
// the renderer makes sound — neither knows anything about style or patterns.
//
// This is the swap point for a future transformer: any object implementing
// this interface can drive the band.
//
//   brain.stepAdvance(step) -> multiplier (in straight-16th units) to advance
//                              the clock after `step`. Swing lives here.
//   brain.step(ctx)         -> Event[]   events to render at this grid step
//   brain.reset()           -> clear per-session state
//
//   ctx   = { step: 0-15, barIdx: 0.., energy: 0-1, playerOnsets: int }
//   Event = { kind: 'drum', drum: 'kick'|'snare'|'hat'|'openhat'|'crash',
//             gain: 0-1, dt: seconds }
//         | { kind: 'bass', semi: int, gain: 0-1, sustain: seconds,
//             dt: seconds, slide: bool }
//
// A transformer replaces createBluesBrain with a model that samples the same
// events (velocity and micro-timing included) conditioned on the same
// context — the scheduler, renderer, and director are unchanged.
// ============================================================================

export function createBrain({ genre = 'rock' } = {}) {
  return genre === 'blues' ? createBluesBrain() : createRockBrain();
}

// ---- session personality ----

const rollIn = ([lo, hi]) => lo + Math.random() * (hi - lo);

function rollPersonality() {
  const p = {};
  for (const k of Object.keys(PERSONALITY_RANGES)) p[k] = rollIn(PERSONALITY_RANGES[k]);
  return p;
}

// weighted pick from a pool: favour the "main" pattern (index 0), and never
// play the same variation twice in a row — fall back to main instead
function pickPattern(pool, lastIdx) {
  if (pool.length === 1) return 0;
  const idx = Math.random() < 0.65 ? 0 : 1 + Math.floor(Math.random() * (pool.length - 1));
  return (idx !== 0 && idx === lastIdx) ? 0 : idx;
}

// ---- blues ----

function createBluesBrain() {
  const p = rollPersonality();

  let tier       = 1;
  let kickIdx    = 0;
  let hatIdx     = 0;
  let kickPat    = BLUES_KICK_POOL[1][0];
  let hatPat     = BLUES_HAT_POOL[1][0];
  let fill       = null;   // fill chosen for this bar, or null
  let justFilled = false;

  const jitter = (g)    => g * (1 + (Math.random() * 2 - 1) * p.gainJitter);
  const loose  = (step) => step % 4 === 0 ? 0 : (Math.random() * 2 - 1) * HUMAN_TIME_JITTER;

  // per-bar decisions: intensity tier, pattern picks, fill choice
  function newBar({ barIdx, energy, playerOnsets }) {
    if (tier < 2 && energy > TIER_UP[tier]) tier += 1;
    else if (tier > 0 && energy < TIER_DOWN[tier - 1]) tier -= 1;

    // if the player goes sparse, come down a level with them — react at the
    // bar line, not instantly, so it feels like listening rather than flinching
    const t = (playerOnsets <= SPARSE_ONSETS && tier > 0) ? tier - 1 : tier;

    kickIdx = pickPattern(BLUES_KICK_POOL[t], kickIdx);
    hatIdx  = pickPattern(BLUES_HAT_POOL[t], hatIdx);
    kickPat = BLUES_KICK_POOL[t][kickIdx];
    hatPat  = BLUES_HAT_POOL[t][hatIdx];

    const phraseEnd = barIdx % PHRASE_BARS === PHRASE_BARS - 1;
    fill = phraseEnd && Math.random() < p.fillProb
      ? BLUES_FILLS[Math.floor(Math.random() * BLUES_FILLS.length)]
      : null;
  }

  return {
    // shuffle: slots within each beat land at 0, s/2, s, s+(1-s)/2
    stepAdvance(step) {
      const s = p.shuffle;
      return [2 * s, 2 * s, 2 * (1 - s), 2 * (1 - s)][step % 4];
    },

    reset() {
      tier = 1; fill = null; justFilled = false;
      kickIdx = 0; hatIdx = 0;
      kickPat = BLUES_KICK_POOL[1][0]; hatPat = BLUES_HAT_POOL[1][0];
    },

    step(ctx) {
      const { step, barIdx, energy: e, beatSec } = ctx;
      if (step === 0) newBar(ctx);

      const events    = [];
      const barInForm = barIdx % 12;
      const arc       = BLUES_BAR_DYNAMICS[barInForm];
      const accent    = BLUES_ACCENT[step % 4];
      const inFill    = fill !== null && step >= 12;

      // crash marks the top of the phrase after a fill
      if (step === 0 && justFilled) {
        justFilled = false;
        events.push({ kind: 'drum', drum: 'crash', gain: jitter(0.30 + 0.20 * e), dt: 0 });
      }

      if (inFill) {
        for (const h of fill) {
          if (h.step === step) {
            events.push({ kind: 'drum', drum: h.drum, gain: jitter(h.gain * (0.5 + 0.5 * e) * arc), dt: loose(step) });
          }
        }
        if (step === 15) justFilled = true;
      } else {
        if (kickPat[step]) {
          events.push({ kind: 'drum', drum: 'kick', gain: jitter((0.45 + 0.55 * e) * accent * arc), dt: loose(step) });
        } else if (step === 10 && Math.random() < EXTRA_KICK_PROB) {
          events.push({ kind: 'drum', drum: 'kick', gain: jitter(0.25 + 0.25 * e), dt: loose(step) });
        }

        if (BLUES_SNARE[step]) {
          // the backbeat drags behind the grid by the session's lay-back amount
          events.push({ kind: 'drum', drum: 'snare', gain: jitter((0.35 + 0.65 * e) * accent * arc), dt: p.layback + loose(step) });
        } else if ((step === 3 || step === 11) && Math.random() < p.ghostProb) {
          // ghost snare on the skip slot before each backbeat
          events.push({ kind: 'drum', drum: 'snare', gain: jitter(GHOST_SNARE_GAIN), dt: loose(step) });
        }
      }

      // ride keeps going except during the fill; 2 in the pattern = open hat
      if (!inFill && hatPat[step]) {
        const drum = hatPat[step] === 2 ? 'openhat' : 'hat';
        events.push({ kind: 'drum', drum, gain: jitter((0.10 + 0.14 * e) * accent * arc), dt: loose(step) });
      }

      // ---- bass: 12-bar walk, chromatic approaches, bar-12 turnaround ----
      const chord      = BLUES_TWELVE_BAR[barInForm];
      const nextChord  = BLUES_TWELVE_BAR[(barInForm + 1) % 12];
      const turnaround = barInForm === 11;

      let semi    = turnaround ? BLUES_TURNAROUND_BASS[step] : BLUES_BASS_PATTERNS[chord][step];
      let slide   = false;
      // walking quarters ring almost to the next beat (legato); off-beat
      // pickups are shorter. Length tracks tempo so the line is never gappy.
      let sustain = step % 4 === 0 ? beatSec * 0.95 : beatSec * 0.5;

      // approach the next chord's root chromatically on the last shuffle note
      if (!turnaround && semi === null && step === 14 && nextChord !== chord) {
        semi    = CHORD_ROOTS[nextChord] + (Math.random() < 0.5 ? -1 : 1);
        slide   = true;
        sustain = beatSec * 0.5;
      }

      if (semi !== null) {
        const g = (0.28 + 0.27 * e) * (step % 4 === 0 ? 1 : 0.8) * arc;
        events.push({ kind: 'bass', semi, gain: jitter(g), sustain, dt: loose(step), slide });
      }

      return events;
    },
  };
}

// ---- rock / default ----

function createRockBrain() {
  const p = rollPersonality();

  const jitter = (g)    => g * (1 + (Math.random() * 2 - 1) * p.gainJitter);
  const loose  = (step) => step % 4 === 0 ? 0 : (Math.random() * 2 - 1) * HUMAN_TIME_JITTER;

  return {
    stepAdvance() { return 1; }, // straight 16th grid

    reset() {},

    step({ step, energy: e, beatSec }) {
      const events = [];

      if (KICK_PATTERN[step]) {
        events.push({ kind: 'drum', drum: 'kick', gain: jitter(0.35 + 0.65 * e), dt: loose(step) });
      }
      if (SNARE_PATTERN[step]) {
        events.push({ kind: 'drum', drum: 'snare', gain: jitter(0.25 + 0.75 * e), dt: p.layback + loose(step) });
      }

      // energy-scaled hat density: quarter → 8th → 16th notes
      const hatHit = e < 0.33 ? (step % 4 === 0)
                   : e < 0.66 ? (step % 2 === 0)
                   : true;
      if (hatHit) {
        const drum = e > 0.66 && (step === 6 || step === 14) ? 'openhat' : 'hat';
        events.push({ kind: 'drum', drum, gain: jitter(0.08 + 0.22 * e), dt: loose(step) });
      }

      if (BASS_PATTERN[step] !== null) {
        events.push({ kind: 'bass', semi: BASS_PATTERN[step], gain: jitter(0.20 + 0.30 * e), sustain: beatSec * 0.85, dt: loose(step), slide: false });
      }

      return events;
    },
  };
}
