import {
  BLUES_ACCENT, BLUES_SNARE, BLUES_KICK_POOL, BLUES_HAT_POOL,
  BLUES_BAR_DYNAMICS, BLUES_FILLS, EXTRA_KICK_PROB,
} from './config.js';

// ============================================================================
// Genre specs — the *data* a generic groove brain (bandBrain.js) plays from.
// Adding a style is adding an entry here; no new code.
//
// Each spec:
//   swing         : true → triplet shuffle timing, false → straight grid
//   accent        : [4] per-beat-slot gain multiplier (downbeat … last slot)
//   barDynamics   : gain multiplier looped over bars (length = its own cycle)
//   kickPool/hatPool : [tier][variation][16] — brain picks per bar by intensity.
//                   (kick/hat must have the same number of tiers.) In a hat
//                   pattern, 2 = open hat.
//   snare         : [16] backbeat hits
//   fills         : array of [{ step, drum, gain }] — one plays at a phrase end
//   ghostSteps    : steps where a quiet ghost snare may sneak in
//   extraKick     : { step, prob } occasional surprise kick, or null
//   crashAfterFill: crash on the "1" after a fill
//   hatGain       : [base, energyScale] loudness of the hat/ride
//   bass          : chord-following line, offsets RELATIVE TO THE CHORD ROOT
//       pattern    : { step: semitone | 'third' }  ('third' = maj/min aware)
//       slideSteps : steps that slide up into their note
//       beatSustain / offSustain : note length (× beat) on / off the beat
// ============================================================================

export const GENRE_SPECS = {
  // ---- Blues: triplet shuffle, walking root-fifth ----
  blues: {
    swing: true,
    accent: BLUES_ACCENT,
    barDynamics: BLUES_BAR_DYNAMICS,
    kickPool: BLUES_KICK_POOL,
    hatPool: BLUES_HAT_POOL,
    snare: BLUES_SNARE,
    fills: BLUES_FILLS,
    ghostSteps: [3, 11],
    extraKick: { step: 10, prob: EXTRA_KICK_PROB },
    crashAfterFill: true,
    hatGain: [0.10, 0.14],
    bass: { pattern: { 0: 0, 2: 7, 4: 7, 8: 0, 10: 'third', 12: 7, 14: -1 }, slideSteps: [14], beatSustain: 1.05, offSustain: 0.6 },
  },

  // ---- Pop: straight, clean, punchy backbeat ----
  pop: {
    swing: false,
    accent: [1.0, 0.7, 0.85, 0.7],
    barDynamics: [1.0, 1.0, 1.0, 1.03],
    kickPool: [
      [ [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0] ],                  // 0: 1 & 3
      [ [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,1,0],                    // 1: + pickup into the 1
        [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,0,0] ],                  //    + "and of 2"
      [ [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],                    // 2: four-on-the-floor
        [1,0,0,0, 1,0,0,0, 1,0,1,0, 1,0,0,0] ],
    ],
    hatPool: [
      [ [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0] ],                  // 0: quarters
      [ [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0] ],                  // 1: 8ths
      [ [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],                    // 2: 16ths
        [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,2,0] ],                  //    8ths + open-hat lift
    ],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    fills: [
      [ { step: 12, drum: 'snare', gain: 0.45 }, { step: 13, drum: 'snare', gain: 0.50 }, { step: 14, drum: 'snare', gain: 0.60 }, { step: 15, drum: 'snare', gain: 0.75 } ],
      [ { step: 14, drum: 'snare', gain: 0.55 }, { step: 15, drum: 'snare', gain: 0.70 } ],
      [ { step: 12, drum: 'snare', gain: 0.50 }, { step: 14, drum: 'kick', gain: 0.60 }, { step: 15, drum: 'snare', gain: 0.75 } ],
    ],
    ghostSteps: [6, 14],
    extraKick: { step: 14, prob: 0.15 },
    crashAfterFill: true,
    hatGain: [0.10, 0.16],
    bass: { pattern: { 0: 0, 4: 7, 8: 0, 12: 7, 14: -1 }, slideSteps: [14], beatSustain: 0.95, offSustain: 0.5 },
  },

  // ---- Shoegaze: washy open-hat wall, sustained root-fifth drone ----
  shoegaze: {
    swing: false,
    accent: [1.0, 0.85, 0.9, 0.85],   // flat — wall of sound, little dynamic shaping
    barDynamics: [1.0],
    kickPool: [
      [ [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0] ],                  // 0: 1 & 3
      [ [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
        [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,1,0] ],                  // 1: + pickup
      [ [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0] ],                  // 2: four-on-the-floor drive
    ],
    hatPool: [
      [ [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0] ],                  // 0: steady 8ths
      [ [1,0,2,0, 1,0,2,0, 1,0,2,0, 1,0,2,0] ],                  // 1: open-hat wash on the "and"
      [ [2,0,2,0, 2,0,2,0, 2,0,2,0, 2,0,2,0] ],                  // 2: all-open wall
    ],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    fills: [
      [ { step: 12, drum: 'crash', gain: 0.50 } ],               // crash swell
      [ { step: 14, drum: 'snare', gain: 0.40 }, { step: 15, drum: 'snare', gain: 0.55 } ],
    ],
    ghostSteps: [],
    extraKick: null,
    crashAfterFill: true,
    hatGain: [0.14, 0.14],
    // sustained half-note drone — root on the 1, fifth on the 3, both ringing
    bass: { pattern: { 0: 0, 8: 7 }, slideSteps: [], beatSustain: 2.1, offSustain: 2.1 },
  },

  // ---- Rock: straight, driving backbeat (the default) ----
  rock: {
    swing: false,
    accent: [1.0, 0.6, 0.85, 0.6],
    barDynamics: [1.0, 1.0, 1.0, 1.03],
    kickPool: [
      [ [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0] ],                  // 0
      [ [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,1,0],                    // 1: classic
        [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0] ],
      [ [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,1,0] ],                  // 2: driving
    ],
    hatPool: [
      [ [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0] ],
      [ [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0] ],
      [ [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
        [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,2,0] ],
    ],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    fills: BLUES_FILLS,   // generic snare/kick fills work fine here
    ghostSteps: [10, 14],
    extraKick: { step: 14, prob: 0.2 },
    crashAfterFill: true,
    hatGain: [0.08, 0.22],
    bass: { pattern: { 0: 0, 4: 7, 8: 0, 12: 7, 14: -1 }, slideSteps: [14], beatSustain: 1.0, offSustain: 0.5 },
  },
};
