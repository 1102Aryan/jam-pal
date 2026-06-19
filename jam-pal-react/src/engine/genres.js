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

// ============================================================================
// Non-4/4 grooves. The genre specs below are written for 4/4; for other meters
// the brain merges the genre spec with one of these, overriding just the
// meter-dependent pattern fields (lengths, accents, beat placement) while
// keeping the genre's flavour (hat loudness, crash-after-fill). Patterns are
// 12-step (= 3 quarter-notes of clock time, shared by 3/4 and 6/8).
// ============================================================================
export const METER_GROOVES = {
  // 3/4 waltz — kick on 1, light backbeat on 2 & 3, root-fifth-fifth bass
  '3/4': {
    swing: false,
    accent: [1.0, 0.55, 0.8, 0.55],
    barDynamics: [1.0],
    kickPool: [
      [ [1,0,0,0, 0,0,0,0, 0,0,0,0] ],                       // 0: just the 1
      [ [1,0,0,0, 0,0,0,0, 0,0,0,0],
        [1,0,0,0, 0,0,0,0, 1,0,0,0] ],                       // 1: + a push on 3
      [ [1,0,0,0, 1,0,0,0, 1,0,0,0] ],                       // 2: all three beats
    ],
    hatPool: [
      [ [1,0,0,0, 1,0,0,0, 1,0,0,0] ],                       // 0: quarters
      [ [1,0,1,0, 1,0,1,0, 1,0,1,0] ],                       // 1: eighths
      [ [1,0,1,0, 1,0,1,0, 1,0,1,0] ],
    ],
    snare: [0,0,0,0, 1,0,0,0, 1,0,0,0],                      // beats 2 & 3
    fills: [
      [ { step: 8, drum: 'snare', gain: 0.5 }, { step: 10, drum: 'snare', gain: 0.65 }, { step: 11, drum: 'snare', gain: 0.8 } ],
      [ { step: 10, drum: 'snare', gain: 0.55 }, { step: 11, drum: 'snare', gain: 0.75 } ],
    ],
    ghostSteps: [],
    extraKick: null,
    bass: { pattern: { 0: 0, 4: 7, 8: 7 }, slideSteps: [], beatSustain: 0.95, offSustain: 0.6 },
  },

  // 2/4 march — kick on 1, backbeat on 2; half a 4/4 bar (8 steps)
  '2/4': {
    swing: false,
    accent: [1.0, 0.6, 0.85, 0.6],
    barDynamics: [1.0],
    kickPool: [
      [ [1,0,0,0, 0,0,0,0] ],                                // 0: just the 1
      [ [1,0,0,0, 0,0,0,0],
        [1,0,0,0, 0,0,1,0] ],                                // 1: + pickup on the "and"
      [ [1,0,0,0, 1,0,0,0] ],                                // 2: 1 and 2
    ],
    hatPool: [
      [ [1,0,0,0, 1,0,0,0] ],                                // 0: quarters
      [ [1,0,1,0, 1,0,1,0] ],                                // 1: eighths
      [ [1,1,1,1, 1,1,1,1] ],                                // 2: sixteenths
    ],
    snare: [0,0,0,0, 1,0,0,0],                               // beat 2
    fills: [
      [ { step: 4, drum: 'snare', gain: 0.5 }, { step: 6, drum: 'snare', gain: 0.65 }, { step: 7, drum: 'snare', gain: 0.8 } ],
      [ { step: 6, drum: 'snare', gain: 0.55 }, { step: 7, drum: 'snare', gain: 0.75 } ],
    ],
    ghostSteps: [],
    extraKick: null,
    bass: { pattern: { 0: 0, 4: 7 }, slideSteps: [], beatSustain: 0.95, offSustain: 0.5 },
  },

  // 12/8 slow blues — 4 dotted-quarter pulses, triplet feel; kick on 1 & 3,
  // backbeat snare on 2 & 4, hat on all twelve eighths (24-step bar)
  '12/8': {
    swing: false,
    accent: [1.0, 0.5],
    barDynamics: [1.0],
    kickPool: [
      [ [1,0,0,0,0,0, 0,0,0,0,0,0, 1,0,0,0,0,0, 0,0,0,0,0,0] ],   // 0: 1 & 3
      [ [1,0,0,0,0,0, 0,0,0,0,0,0, 1,0,0,0,0,0, 0,0,0,0,0,0],
        [1,0,0,0,0,0, 0,0,0,0,0,0, 1,0,0,0,0,0, 0,0,0,0,1,0] ],   // 1: + pickup
      [ [1,0,0,0,0,0, 0,0,0,0,0,0, 1,0,0,0,1,0, 0,0,0,0,0,0] ],   // 2: + push before 4
    ],
    hatPool: [
      [ [1,0,1,0,1,0, 1,0,1,0,1,0, 1,0,1,0,1,0, 1,0,1,0,1,0] ],   // 0: twelve eighths
      [ [1,0,1,0,1,0, 1,0,1,0,1,0, 1,0,1,0,1,0, 1,0,1,0,1,0] ],
      [ [1,0,1,0,1,0, 1,0,1,0,1,0, 2,0,1,0,1,0, 1,0,1,0,1,0] ],   // 2: open hat on 3
    ],
    snare: [0,0,0,0,0,0, 1,0,0,0,0,0, 0,0,0,0,0,0, 1,0,0,0,0,0],  // beats 2 & 4
    fills: [
      [ { step: 22, drum: 'snare', gain: 0.5 }, { step: 23, drum: 'snare', gain: 0.7 } ],
    ],
    ghostSteps: [],
    extraKick: null,
    bass: { pattern: { 0: 0, 12: 7 }, slideSteps: [], beatSustain: 1.4, offSustain: 1.4 },
  },

  // 6/8 compound — 6 eighth pulses felt in 2; kick on 1, snare on 4 (step 6)
  '6/8': {
    swing: false,
    accent: [1.0, 0.5],                                      // per-eighth (stepsPerBeat = 2)
    barDynamics: [1.0],
    kickPool: [
      [ [1,0,0,0, 0,0,0,0, 0,0,0,0] ],                       // 0: just the 1
      [ [1,0,0,0, 0,0,0,0, 0,0,0,0],
        [1,0,0,0, 0,0,1,0, 0,0,0,0] ],                       // 1: + the 4
      [ [1,0,0,0, 0,0,1,0, 0,0,0,0] ],                       // 2: 1 and 4
    ],
    hatPool: [
      [ [1,0,1,0, 1,0,1,0, 1,0,1,0] ],                       // 0: six eighths
      [ [1,0,1,0, 1,0,1,0, 1,0,1,0] ],
      [ [1,0,1,0, 1,0,2,0, 1,0,1,0] ],                       // 2: open hat on the 4
    ],
    snare: [0,0,0,0, 0,0,1,0, 0,0,0,0],                      // the 4
    fills: [
      [ { step: 10, drum: 'snare', gain: 0.5 }, { step: 11, drum: 'snare', gain: 0.7 } ],
    ],
    ghostSteps: [],
    extraKick: null,
    bass: { pattern: { 0: 0, 6: 7 }, slideSteps: [], beatSustain: 1.4, offSustain: 1.4 },
  },
};

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
    bass: {
      pool: [
        { 0: 0, 2: 7, 4: 7, 8: 0, 10: 'third', 12: 7, 14: -1 },   // main shuffle root-fifth
        { 0: 0, 2: 0, 4: 7, 8: 0, 10: 0, 12: 7, 14: -1 },         // bouncier root pumps
        { 0: 0, 4: 'third', 8: 7, 12: 9, 14: 10 },                // walking up the blues scale
      ],
      slideSteps: [14], beatSustain: 1.05, offSustain: 0.6,
    },
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
    bass: {
      pool: [
        { 0: 0, 4: 7, 8: 0, 12: 7, 14: -1 },                      // main root-fifth
        { 0: 0, 2: 0, 4: 7, 8: 0, 10: 0, 12: 7, 14: -1 },         // eighth-note pump
        { 0: 0, 4: 'third', 8: 7, 12: 9, 14: -1 },                // walking line
      ],
      slideSteps: [14], beatSustain: 0.95, offSustain: 0.5,
    },
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
      [ { step: 12, drum: 'crash', gain: 0.38 } ],               // crash swell
      [ { step: 14, drum: 'snare', gain: 0.40 }, { step: 15, drum: 'snare', gain: 0.55 } ],
    ],
    ghostSteps: [],
    extraKick: null,
    crashAfterFill: true,
    hatGain: [0.14, 0.14],
    // sustained drone — root on the 1, fifth on the 3, both ringing
    bass: {
      pool: [
        { 0: 0, 8: 7 },                                           // root → fifth half-notes
        { 0: 0 },                                                 // single whole-note root
        { 0: 0, 8: 'third' },                                     // root → third colour
      ],
      slideSteps: [], beatSustain: 2.1, offSustain: 2.1,
    },
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
    bass: {
      pool: [
        { 0: 0, 4: 7, 8: 0, 12: 7, 14: -1 },                      // main root-fifth
        { 0: 0, 2: 0, 4: 7, 6: 7, 8: 0, 10: 0, 12: 7, 14: -1 },   // driving eighths
        { 0: 0, 4: 'third', 8: 7, 10: 9, 12: 7, 14: 10 },         // walking line
      ],
      slideSteps: [14], beatSustain: 1.0, offSustain: 0.5,
    },
  },
};
