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
//   keys / guitar : chord comping (electric piano / rhythm guitar), each
//                   optional and independent — genres without one simply
//                   play no part for it. Both can sound at once (they fill in
//                   for whichever the player *isn't* playing live — see
//                   scheduler.js's per-instrument suppression), so their
//                   patterns/registers are kept distinct rather than doubled.
//       pool       : [{ step: { sustainBeats, gain } }] — chord stabs, picked
//                    per bar like the bass pool
//       voicing    : chord tones stacked at each stab — any of
//                    'root'|'third'|'fifth'|'sixth'|'seventh' ('third'/'seventh'
//                    are maj/min-aware)
//       octaveShift: semitones above the bass root the voicing is centred on
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
    keys: {
      pool: [ { 0: { sustainBeats: 2.8, gain: 0.20 } } ],
      voicing: ['root', 'third', 'fifth'], octaveShift: 24,
    },
    guitar: {
      pool: [ { 0: { sustainBeats: 0.6, gain: 0.19 } } ],
      voicing: ['root', 'fifth'], octaveShift: 12,
    },
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
    keys: {
      pool: [ { 0: { sustainBeats: 1.8, gain: 0.20 } } ],
      voicing: ['root', 'third', 'fifth'], octaveShift: 24,
    },
    guitar: {
      pool: [ { 0: { sustainBeats: 0.5, gain: 0.19 } } ],
      voicing: ['root', 'fifth'], octaveShift: 12,
    },
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
    keys: {
      pool: [ { 0: { sustainBeats: 2.6, gain: 0.20 }, 12: { sustainBeats: 2.6, gain: 0.18 } } ],
      voicing: ['root', 'third', 'fifth', 'seventh'], octaveShift: 24,
    },
    guitar: {
      pool: [ { 0: { sustainBeats: 0.7, gain: 0.19 }, 12: { sustainBeats: 0.7, gain: 0.17 } } ],
      voicing: ['root', 'third', 'fifth'], octaveShift: 12,
    },
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
    keys: {
      pool: [ { 0: { sustainBeats: 2.8, gain: 0.18 } } ],
      voicing: ['root', 'third', 'fifth'], octaveShift: 24,
    },
    guitar: {
      pool: [ { 0: { sustainBeats: 0.7, gain: 0.18 } } ],
      voicing: ['root', 'fifth'], octaveShift: 12,
    },
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
    // shuffle comp: stab on the 1, a short push into the turnaround
    keys: {
      pool: [
        { 0: { sustainBeats: 2.5, gain: 0.20 }, 10: { sustainBeats: 0.5, gain: 0.15 } },
        { 0: { sustainBeats: 1.4, gain: 0.20 }, 8: { sustainBeats: 1.4, gain: 0.18 } },
      ],
      voicing: ['root', 'third', 'fifth', 'seventh'], octaveShift: 24,
    },
    // punchy shuffle chunks, offset from the keys' hits so they interlock
    guitar: {
      pool: [
        { 0: { sustainBeats: 0.5, gain: 0.19 }, 6: { sustainBeats: 0.3, gain: 0.15 } },
        { 4: { sustainBeats: 0.5, gain: 0.18 }, 12: { sustainBeats: 0.5, gain: 0.17 } },
      ],
      voicing: ['root', 'third', 'fifth'], octaveShift: 12,
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
    // bright triad stabs on the 1 and 3, clean pop piano
    keys: {
      pool: [
        { 0: { sustainBeats: 1.7, gain: 0.20 }, 8: { sustainBeats: 1.7, gain: 0.18 } },
        { 0: { sustainBeats: 0.9, gain: 0.20 }, 6: { sustainBeats: 0.4, gain: 0.14 }, 8: { sustainBeats: 1.7, gain: 0.18 } },
      ],
      voicing: ['root', 'third', 'fifth'], octaveShift: 24,
    },
    // clean strummed chords, on the offbeat pickups so they thread through the keys
    guitar: {
      pool: [
        { 2: { sustainBeats: 0.4, gain: 0.18 }, 10: { sustainBeats: 0.4, gain: 0.17 } },
        { 4: { sustainBeats: 0.4, gain: 0.17 }, 14: { sustainBeats: 0.4, gain: 0.18 } },
      ],
      voicing: ['root', 'third', 'fifth'], octaveShift: 12,
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
    // washy sustained pad — open fifths, no third, so it stays ambiguous/dreamy
    keys: {
      pool: [ { 0: { sustainBeats: 4.0, gain: 0.16 } } ],
      voicing: ['root', 'fifth'], octaveShift: 24,
    },
    // a lower-register drone doubling the keys pad — thickens the wall rather
    // than competing with it
    guitar: {
      pool: [ { 0: { sustainBeats: 4.0, gain: 0.15 } } ],
      voicing: ['root', 'fifth'], octaveShift: 12,
    },
  },

  // ---- Jazz: triplet swing, ride cymbal, walking bass, sparse kick ----
  jazz: {
    swing: true,
    accent: [1.0, 0.55, 0.78, 0.58],
    barDynamics: [1.0, 1.02, 1.0, 1.03],
    kickPool: [
      [ [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0] ],                  // 0: just the 1 (sparse jazz kick)
      [ [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
        [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,1,0] ],                  // 1: + beat 3 or pickup
      [ [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,1,0] ],                  // 2: + "and of 4"
    ],
    hatPool: [
      [ [2,0,2,0, 2,0,2,0, 2,0,2,0, 2,0,2,0] ],                  // 0: ride eighths (open=ride feel)
      [ [2,0,2,0, 2,0,2,0, 2,0,2,0, 2,0,2,0] ],                  // 1: same — ride stays steady
      [ [2,0,2,0, 2,0,2,0, 2,0,2,0, 2,0,2,0] ],                  // 2: ride stays
    ],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],                 // 2 & 4
    fills: [
      [ { step: 12, drum: 'snare', gain: 0.38 }, { step: 14, drum: 'snare', gain: 0.52 }, { step: 15, drum: 'snare', gain: 0.68 } ],
      [ { step: 13, drum: 'snare', gain: 0.32 }, { step: 14, drum: 'snare', gain: 0.48 }, { step: 15, drum: 'snare', gain: 0.62 } ],
    ],
    ghostSteps: [2, 6, 10, 14],                                   // comping ghost notes
    extraKick: { step: 6, prob: 0.18 },                           // occasional "and of 2" kick
    crashAfterFill: false,                                         // jazz doesn't crash hard
    hatGain: [0.11, 0.08],                                        // ride is steady, not loud
    bass: {
      pool: [
        { 0: 0, 4: 7, 8: 0, 12: -1 },                           // root-fifth-root-leading tone
        { 0: 0, 4: 'third', 8: 7, 12: 9 },                      // root-third-fifth-sixth walk
        { 0: 0, 4: 2, 8: 5, 12: 7 },                            // stepwise chromatic walk up
      ],
      slideSteps: [12], beatSustain: 1.05, offSustain: 1.0,      // long notes — walking feel
    },
    // sparse syncopated stabs on the off-beats, bebop-style comping
    keys: {
      pool: [
        { 2: { sustainBeats: 0.4, gain: 0.17 }, 10: { sustainBeats: 0.4, gain: 0.17 } },
        { 6: { sustainBeats: 0.4, gain: 0.16 }, 14: { sustainBeats: 0.6, gain: 0.18 } },
      ],
      voicing: ['root', 'third', 'seventh'], octaveShift: 24,
    },
    // Freddie-Green-style quarter-note chunks, offset from the keys' hits
    guitar: {
      pool: [
        { 4: { sustainBeats: 0.3, gain: 0.16 }, 12: { sustainBeats: 0.3, gain: 0.16 } },
        { 0: { sustainBeats: 0.3, gain: 0.15 }, 8: { sustainBeats: 0.3, gain: 0.16 } },
      ],
      voicing: ['root', 'third', 'fifth'], octaveShift: 12,
    },
  },

  // ---- R&B: straight 16ths, soul groove, funky bass ----
  rnb: {
    swing: false,
    accent: [1.0, 0.65, 0.88, 0.68],
    barDynamics: [1.0, 1.0, 1.02, 1.01],
    kickPool: [
      [ [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0] ],                  // 0: 1 & and-of-3
      [ [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,1,0],                    // 1: + pickup into 1
        [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,0] ],                  //    + and-of-2
      [ [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,1,0] ],                  // 2: multiple 16th kicks
    ],
    hatPool: [
      [ [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0] ],                  // 0: eighths
      [ [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1] ],                  // 1: 16th note soul groove
      [ [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,2,1] ],                  // 2: 16ths + open-hat lift
    ],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],                 // 2 & 4
    fills: [
      [ { step: 12, drum: 'snare', gain: 0.45 }, { step: 13, drum: 'snare', gain: 0.55 }, { step: 14, drum: 'snare', gain: 0.65 }, { step: 15, drum: 'snare', gain: 0.80 } ],
      [ { step: 14, drum: 'kick',  gain: 0.60 }, { step: 15, drum: 'snare', gain: 0.75 } ],
      [ { step: 12, drum: 'snare', gain: 0.42 }, { step: 14, drum: 'snare', gain: 0.60 }, { step: 15, drum: 'snare', gain: 0.78 } ],
    ],
    ghostSteps: [3, 7, 11, 15],                                   // 16th-note ghost snares
    extraKick: { step: 14, prob: 0.22 },
    crashAfterFill: true,
    hatGain: [0.08, 0.20],
    bass: {
      pool: [
        { 0: 0, 6: 0, 8: 0, 12: 7, 14: -1 },                    // octave pump then fifth
        { 0: 0, 2: 0, 8: 0, 10: 0, 12: 7 },                     // rhythmic root emphasis
        { 0: 0, 4: 7, 6: 7, 8: 0, 12: 'third' },                // root-fifth groove
      ],
      slideSteps: [2, 6, 14], beatSustain: 0.80, offSustain: 0.40,
    },
    // syncopated 16th-note stabs, Rhodes/Wurli-style tight voicing (no 5th)
    keys: {
      pool: [
        { 0: { sustainBeats: 0.4, gain: 0.18 }, 6: { sustainBeats: 0.4, gain: 0.16 }, 10: { sustainBeats: 0.4, gain: 0.16 }, 14: { sustainBeats: 0.6, gain: 0.18 } },
        { 2: { sustainBeats: 0.4, gain: 0.16 }, 8: { sustainBeats: 0.4, gain: 0.18 }, 12: { sustainBeats: 0.6, gain: 0.18 } },
      ],
      voicing: ['root', 'third', 'seventh'], octaveShift: 24,
    },
    // funky muted chuck strums, offset from the keys' 16th-note hits
    guitar: {
      pool: [
        { 2: { sustainBeats: 0.25, gain: 0.16 }, 8: { sustainBeats: 0.25, gain: 0.17 }, 13: { sustainBeats: 0.3, gain: 0.16 } },
        { 4: { sustainBeats: 0.25, gain: 0.16 }, 10: { sustainBeats: 0.25, gain: 0.16 }, 14: { sustainBeats: 0.3, gain: 0.17 } },
      ],
      voicing: ['root', 'third'], octaveShift: 12,
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
    // sustained chord on the 1 and 3, doubling the kick's anchor points
    keys: {
      pool: [ { 0: { sustainBeats: 1.9, gain: 0.20 }, 8: { sustainBeats: 1.9, gain: 0.18 } } ],
      voicing: ['root', 'third', 'fifth'], octaveShift: 24,
    },
    // driving power-chord strum, same anchor points as the kick but punchier
    guitar: {
      pool: [ { 0: { sustainBeats: 0.7, gain: 0.20 }, 8: { sustainBeats: 0.7, gain: 0.18 } } ],
      voicing: ['root', 'fifth'], octaveShift: 12,
    },
  },
};
