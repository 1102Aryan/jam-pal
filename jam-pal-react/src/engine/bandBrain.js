import {
  HUMAN_TIME_JITTER, GHOST_SNARE_GAIN, PHRASE_BARS,
  SPARSE_ONSETS, TIER_UP, TIER_DOWN, PERSONALITY_RANGES, METERS,
} from './config.js';
import { GENRE_SPECS, METER_GROOVES } from './genres.js';

// ============================================================================
// The band "brain" decides WHAT to play. The scheduler keeps the clock and
// the renderer makes sound — neither knows anything about style or patterns.
//
// One generic groove brain reads a per-genre spec (genres.js); every style is
// just data. This is also the swap point for a future transformer: anything
// implementing this interface can drive the band.
//
//   brain.stepAdvance(step) -> multiplier (in straight-16th units) to advance
//                              the clock after `step`. Swing lives here.
//   brain.step(ctx)         -> Event[]   events to render at this grid step
//   brain.reset()           -> clear per-session state
//
//   ctx   = { step: 0-15, barIdx, energy: 0-1, beatSec, chordQuality, playerOnsets }
//   Event = { kind: 'drum', drum: 'kick'|'snare'|'hat'|'openhat'|'crash',
//             gain: 0-1, dt: seconds }
//         | { kind: 'bass', semi: int, gain: 0-1, sustain: seconds,
//             dt: seconds, slide: bool }
//         | { kind: 'keys' | 'guitar', voicing: int[], octave: semitones,
//             gain: 0-1, sustain: seconds, dt: seconds }
// ============================================================================

// chord-tone offset (semitones from the root) for a comping voicing role,
// aware of the detected chord quality the same way bass's 'third' is
const CHORD_TONE_SEMI = {
  root: 0, fifth: 7, sixth: 9,
  third:   (q) => q === 'min' ? 3  : 4,
  seventh: (q) => q === 'min' ? 10 : 10, // dominant/minor 7th — a bluesy colour either way
};
function chordVoicing(roles, quality) {
  return roles.map(r => {
    const v = CHORD_TONE_SEMI[r];
    return typeof v === 'function' ? v(quality) : v;
  });
}

// comping instruments (keys, guitar): both are optional per-genre chord parts
// with identical pool/voicing/emission logic — only the event `kind` and the
// spec they read from (spec.keys / spec.guitar) differ.
const COMPING_KINDS = ['keys', 'guitar'];

export function createBrain({ genre = 'rock', timeSig = '4/4' } = {}) {
  const meter = METERS[timeSig] ?? METERS['4/4'];
  const base  = GENRE_SPECS[genre] ?? GENRE_SPECS.rock;
  // non-4/4 meters override the genre's meter-dependent patterns; 4/4 uses the
  // genre spec untouched
  const spec  = timeSig === '4/4' ? base : { ...base, ...METER_GROOVES[timeSig] };
  return createGrooveBrain(spec, meter);
}

// ---- session personality (rolled once per session) ----

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

function createGrooveBrain(spec, meter) {
  const p       = rollPersonality();
  const maxTier = spec.kickPool.length - 1;
  const spb     = meter.stepsPerBeat;            // grid steps per displayed beat
  const lastStep    = meter.stepsPerBar - 1;     // final step of the bar
  const lastBeatTop = meter.stepsPerBar - spb;   // first step of the bar's last beat

  // bass: a pool of per-bar variations (falls back to a single pattern)
  const bassPool = spec.bass.pool ?? [spec.bass.pattern];
  // comping (keys/guitar): optional chord-comping pools — genres without a
  // spec for a given kind simply don't get that part
  const comping = COMPING_KINDS
    .filter(kind => spec[kind]?.pool)
    .map(kind => ({ kind, spec: spec[kind], pool: spec[kind].pool, idx: 0, pat: spec[kind].pool[0] }));

  let tier       = 0;   // start sparse and build in, rather than slamming in
  let kickIdx    = 0;
  let hatIdx     = 0;
  let bassIdx    = 0;
  let kickPat    = spec.kickPool[0][0];
  let hatPat     = spec.hatPool[0][0];
  let bassPat    = bassPool[0];
  let fill       = null;   // fill chosen for this bar, or null
  let justFilled = false;
  let phraseGain = 1;      // gentle crescendo across the phrase

  const jitter = (g)    => g * (1 + (Math.random() * 2 - 1) * p.gainJitter);
  const loose  = (step) => step % spb === 0 ? 0 : (Math.random() * 2 - 1) * HUMAN_TIME_JITTER;

  // per-bar decisions: intensity tier, pattern picks, fill choice
  function newBar({ barIdx, energy, playerOnsets }) {
    if (tier < maxTier && energy > TIER_UP[Math.min(tier, TIER_UP.length - 1)]) tier += 1;
    else if (tier > 0 && energy < TIER_DOWN[tier - 1]) tier -= 1;

    // if the player goes sparse, come down a level with them — react at the
    // bar line, not instantly, so it feels like listening rather than flinching
    const t = (playerOnsets <= SPARSE_ONSETS && tier > 0) ? tier - 1 : tier;

    kickIdx = pickPattern(spec.kickPool[t], kickIdx);
    hatIdx  = pickPattern(spec.hatPool[t], hatIdx);
    bassIdx = pickPattern(bassPool, bassIdx);
    kickPat = spec.kickPool[t][kickIdx];
    hatPat  = spec.hatPool[t][hatIdx];
    bassPat = bassPool[bassIdx];
    for (const c of comping) {
      c.idx = pickPattern(c.pool, c.idx);
      c.pat = c.pool[c.idx];
    }

    // phrase shape: a gentle crescendo toward the phrase end, where a fill lands
    // (and the occasional surprise fill mid-phrase) so the groove develops
    const barInPhrase = barIdx % PHRASE_BARS;
    phraseGain = 1 + 0.06 * (barInPhrase / Math.max(1, PHRASE_BARS - 1));
    const wantFill = barInPhrase === PHRASE_BARS - 1
      ? Math.random() < p.fillProb
      : barIdx > 0 && Math.random() < p.midFillProb;
    fill = (spec.fills.length && wantFill)
      ? spec.fills[Math.floor(Math.random() * spec.fills.length)]
      : null;
  }

  return {
    // shuffle: slots within each beat land at 0, s/2, s, s+(1-s)/2; straight = 1
    stepAdvance(step) {
      if (!spec.swing) return 1;
      const s = p.shuffle;
      return [2 * s, 2 * s, 2 * (1 - s), 2 * (1 - s)][step % 4];
    },

    reset() {
      tier = 0; fill = null; justFilled = false; phraseGain = 1;
      kickIdx = 0; hatIdx = 0; bassIdx = 0;
      kickPat = spec.kickPool[0][0]; hatPat = spec.hatPool[0][0]; bassPat = bassPool[0];
      for (const c of comping) { c.idx = 0; c.pat = c.pool[0]; }
    },

    step(ctx) {
      const { step, barIdx, energy: e, beatSec } = ctx;
      if (step === 0) newBar(ctx);

      const events = [];
      const arc    = spec.barDynamics[barIdx % spec.barDynamics.length] * phraseGain;
      const accent = spec.accent[step % spb];
      const inFill = fill !== null && step >= lastBeatTop;

      // crash marks the top of the phrase after a fill
      if (step === 0 && justFilled) {
        justFilled = false;
        if (spec.crashAfterFill) {
          events.push({ kind: 'drum', drum: 'crash', gain: jitter(0.20 + 0.14 * e), dt: 0 });
        }
      }

      if (inFill) {
        for (const h of fill) {
          if (h.step === step) {
            events.push({ kind: 'drum', drum: h.drum, gain: jitter(h.gain * (0.5 + 0.5 * e) * arc), dt: loose(step) });
          }
        }
        if (step === lastStep) justFilled = true;
      } else {
        if (kickPat[step]) {
          events.push({ kind: 'drum', drum: 'kick', gain: jitter((0.45 + 0.55 * e) * accent * arc), dt: loose(step) });
        } else if (spec.extraKick && step === spec.extraKick.step && Math.random() < spec.extraKick.prob) {
          events.push({ kind: 'drum', drum: 'kick', gain: jitter(0.25 + 0.25 * e), dt: loose(step) });
        }

        if (spec.snare[step]) {
          // the backbeat drags behind the grid by the session's lay-back amount
          events.push({ kind: 'drum', drum: 'snare', gain: jitter((0.35 + 0.65 * e) * accent * arc), dt: p.layback + loose(step) });
        } else if (spec.ghostSteps.includes(step) && Math.random() < p.ghostProb) {
          events.push({ kind: 'drum', drum: 'snare', gain: jitter(GHOST_SNARE_GAIN), dt: loose(step) });
        }
      }

      // hi-hat / ride keeps going except during the fill; 2 in the pattern = open hat
      if (!inFill && hatPat[step]) {
        const drum = hatPat[step] === 2 ? 'openhat' : 'hat';
        events.push({ kind: 'drum', drum, gain: jitter((spec.hatGain[0] + spec.hatGain[1] * e) * accent * arc), dt: loose(step) });
      }

      // ---- bass: follows the chord the player is playing ----
      // Offsets are relative to the detected chord root (the engine sets the
      // bass root freq to it). 'third' resolves to the maj/min third, so a
      // wrong quality guess only colours a note — root and fifth stay safe.
      const bp = spec.bass;
      if (step in bassPat) {
        const isBeat = step % spb === 0;
        // leave space: drop the odd off-beat note (downbeats always anchor)
        if (isBeat || Math.random() >= p.bassRest) {
          let semi = bassPat[step];
          // octave lift on root/approach notes only — keeps the pitch inside the
          // sampled range (fifths would repitch too far)
          const canHop = typeof semi === 'number' && semi <= 0;
          if (semi === 'third') semi = ctx.chordQuality === 'min' ? 3 : 4;
          if (!isBeat && canHop && Math.random() < p.bassOctave) semi += 12;
          const slide   = bp.slideSteps.includes(step);
          const sustain = (isBeat ? bp.beatSustain : bp.offSustain) * beatSec;
          const g = (0.28 + 0.27 * e) * (isBeat ? 1 : 0.8) * arc;
          events.push({ kind: 'bass', semi, gain: jitter(g), sustain, dt: loose(step), slide });
        }
      }

      // ---- comping (keys/guitar): chord parts, follow the same root/quality
      // as the bass. Both play simultaneously when neither is the player's own
      // instrument (see scheduler.js's per-instrument suppression).
      if (!inFill) {
        for (const c of comping) {
          if (!(step in c.pat)) continue;
          const hit = c.pat[step];
          const voicing = chordVoicing(c.spec.voicing, ctx.chordQuality);
          const g = hit.gain * (0.6 + 0.4 * e) * arc;
          events.push({
            kind: c.kind, voicing, octave: c.spec.octaveShift,
            gain: jitter(g), sustain: hit.sustainBeats * beatSec, dt: loose(step),
          });
        }
      }

      return events;
    },
  };
}
