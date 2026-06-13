// Onset detection
export const BASELINE_RATE  = 0.05;
export const ONSET_FACTOR   = 2.5;
export const REFRACTORY     = 0.40;   // seconds between onsets
export const RMS_GATE       = 0.003;  // silence guard
export const GUITAR_LOW_HZ  = 150;
export const GUITAR_HIGH_HZ = 6000;
export const ONSET_GATE_DUR = 0.40;   // seconds to accumulate chroma after onset

// Tempo
export const TEMPO_WINDOW = 5;        // gaps between last N onsets

// Scheduler
export const LOOKAHEAD_MS    = 25;
export const SCHEDULE_AHEAD  = 0.1;   // seconds

// Key detection (Krumhansl-Schmuckler)
export const CHROMA_DECAY    = 0.997;
export const KEY_CONFIDENCE  = 0.65;
export const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
export const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

// Energy / dynamics
export const ENERGY_ATTACK  = 0.06;
export const ENERGY_RELEASE = 0.008;
export const ENERGY_LOW     = 0.003;
export const ENERGY_HIGH    = 0.030;

// Drum patterns (one bar = 16 sixteenths)
export const KICK_PATTERN  = [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0];
export const SNARE_PATTERN = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
export const BASS_PATTERN  = [0, null, null, null, 0, null, null, null, 7, null, null, null, 5, null, null, null];

// ---- Blues preset ----
// Shuffle timing lives in the brain's session personality (see bandBrain.js):
// the 4 sixteenth slots of each beat land at 0, s/2, s, s+(1-s)/2 where
// s ≈ 2/3 is the shuffle position — slot 2 is THE shuffle note, slot 3 the
// late "skip" slot used for ghosts and pickups.

// Per-slot accent: downbeat strong, shuffle note a bit behind it, the
// in-between slots soft. Multiplied into every hit's gain.
export const BLUES_ACCENT = [1.0, 0.55, 0.8, 0.5];

// Snare: standard backbeat 2 and 4
export const BLUES_SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];

// Kick and ride pools per intensity tier (0=sparse, 1=main, 2=driving).
// The brain picks one per bar — weighted toward the first ("main") entry,
// never repeating a variation twice in a row. In hat patterns 2 = open hat.
export const BLUES_KICK_POOL = [
  [ [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0] ],                // 0: beats 1+3 only
  [ [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    [1,0,0,0, 0,0,0,0, 1,0,1,0, 0,0,0,0] ],                // 1: + shuffle-note push on 3
  [ [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,0,0],
    [1,0,1,0, 0,0,0,0, 1,0,1,0, 0,0,0,0] ],                // 2: driving
];
export const BLUES_HAT_POOL = [
  [ [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0] ],                // 0: quarter notes
  [ [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0] ],                // 1: full shuffle ride
  [ [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,2,0] ],                // 2: open hat on beat 4's shuffle note
];

// 12-bar blues: 0=I, 1=IV, 2=V  (quick-change form, turnaround on bar 12)
export const BLUES_TWELVE_BAR = [0, 0, 0, 0, 1, 1, 0, 0, 2, 1, 0, 2];
export const CHORD_ROOTS      = [0, 5, 7]; // I, IV, V in semitones from the key root

// Walking bass patterns per chord degree (semitones from the detected key root).
// Quarter-note walk (slots 0, 4, 8, 12) plus a swung pickup on slot 2.
//
// I  chord: C – G(swung) – E – G – F          outlines C maj-add6, walks to IV
// IV chord: F – C3(swung) – A – C3 – Bb       outlines F7, walks to I
// V  chord: G – D3(swung) – B – D3 – F        outlines G7, F resolves back to I
export const BLUES_BASS_PATTERNS = [
  [0,  null, 7,  null, 4,  null, null, null, 7,  null, null, null, 5,  null, null, null], // I
  [5,  null, 12, null, 9,  null, null, null, 12, null, null, null, 10, null, null, null], // IV
  [7,  null, 14, null, 11, null, null, null, 14, null, null, null, 5,  null, null, null], // V
];

// Bar 12 turnaround: quarter-note chromatic walk V → I (G A B♭ B → C),
// landing on the root at the top of the next chorus.
export const BLUES_TURNAROUND_BASS =
  [7, null, null, null, 9, null, null, null, 10, null, null, null, 11, null, null, null];

// Dynamic arc over the 12-bar form (gain multiplier per bar) — the V–IV bars
// (9–10) are the tension peak, bar 12 pushes into the turnaround.
export const BLUES_BAR_DYNAMICS =
  [1.0, 0.97, 1.0, 1.02, 1.03, 1.03, 1.0, 1.0, 1.08, 1.06, 1.0, 1.05];

// Bass multisample manifest — MIDI note numbers expected as
// /samples/bass-<midi>.wav. These 7 (every major third, C2–C4) keep repitching
// to ≤±2 semitones. For pristine quality record the full chromatic range and
// use: Array.from({ length: 25 }, (_, i) => 36 + i)  // C2..C4
export const BASS_SAMPLE_MIDI = [36, 40, 44, 48, 52, 56, 60];

// ---- Performance / humanization ----
export const HUMAN_TIME_JITTER = 0.004;  // ±4 ms on everything except downbeats
export const GHOST_SNARE_GAIN  = 0.10;
export const EXTRA_KICK_PROB   = 0.18;   // occasional kick on beat 3's shuffle note
export const PHRASE_BARS       = 4;      // fill on the last bar of each phrase

// Intensity tiers — evaluated only at bar boundaries, with hysteresis so the
// band doesn't flap between levels.
export const TIER_UP   = [0.40, 0.72];   // energy to move 0→1, 1→2
export const TIER_DOWN = [0.28, 0.58];   // energy to move 1→0, 2→1
export const SPARSE_ONSETS = 2;          // player onsets/bar at or below this → band thins out

// Once the band is locked in it follows the player's tempo less eagerly —
// real bands hold the pocket rather than chase every fluctuation.
export const LOCKED_FOLLOW_SCALE = 0.6;

// Session personality: rolled once per session so every jam has a slightly
// different drummer. [lo, hi] ranges, sampled uniformly.
export const PERSONALITY_RANGES = {
  shuffle:    [0.62, 0.68],    // where the shuffle note sits in the beat
  layback:    [0.004, 0.008],  // seconds the backbeat drags behind the grid
  fillProb:   [0.65, 1.0],     // chance a phrase ends with a fill
  ghostProb:  [0.25, 0.45],    // ghost-snare density
  gainJitter: [0.08, 0.15],    // per-hit velocity looseness
};

// Fills: replace the normal pattern over beat 4 (steps 12-15) of the last bar
// of each phrase. One is chosen at random per phrase so no two feel identical.
export const BLUES_FILLS = [
  [ { step: 12, drum: 'snare', gain: 0.50 }, { step: 14, drum: 'snare', gain: 0.65 }, { step: 15, drum: 'snare', gain: 0.80 } ],
  [ { step: 12, drum: 'snare', gain: 0.55 }, { step: 13, drum: 'snare', gain: 0.35 }, { step: 14, drum: 'kick',  gain: 0.70 }, { step: 15, drum: 'snare', gain: 0.85 } ],
  [ { step: 12, drum: 'kick',  gain: 0.70 }, { step: 14, drum: 'snare', gain: 0.60 }, { step: 15, drum: 'snare', gain: 0.45 } ],
  [ { step: 14, drum: 'snare', gain: 0.55 }, { step: 15, drum: 'snare', gain: 0.75 } ],
];
