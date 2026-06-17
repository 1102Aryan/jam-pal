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
// How many beats ahead the band forecasts the player's tempo (anticipation).
// 0 = pure reaction; ~1 leads the player's drift so the band stops trailing.
export const TEMPO_LOOKAHEAD_BEATS = 1.0;

// Scheduler
export const LOOKAHEAD_MS    = 25;
export const SCHEDULE_AHEAD  = 0.1;   // seconds

// Latency & feedback rejection
// The band's sound leaves the speakers ~outputLatency after it's scheduled,
// reaches the mic, and shows up in the analysis ~inputLatency later. We know
// when every band hit will be heard, so we ignore mic onsets/chroma in a window
// around it — that stops the band's own drums from being mistaken for the
// player and corrupting BPM/key detection.
export const DEFAULT_OUTPUT_LATENCY = 0.02;  // fallback if the browser won't report it
export const INPUT_LATENCY_EST      = 0.02;  // estimated mic → analysis delay
export const FEEDBACK_GUARD         = 0.05;  // ± window (s) around a band hit to suppress
export const BAND_HIT_TTL           = 0.5;   // forget registered band hits older than this

// Key detection (Krumhansl-Schmuckler)
export const CHROMA_DECAY    = 0.997;
export const KEY_CONFIDENCE  = 0.65;

// Chord detection (forgiving, beginner-friendly)
export const CHORD_MIN_ENERGY  = 1.0;   // ignore near-silent chroma
export const CHORD_CONFIDENCE  = 0.34;  // share of energy the chord must explain
export const CHORD_THIRD_DEADZONE = 1.4; // maj/min only flips when one third clearly wins
export const CHORD_HOLD_SEC    = 0.45;  // hysteresis for a *surprising* chord change
export const CHORD_HOLD_MIN    = 0.14;  // hysteresis for a fully *expected* change (anticipation)
export const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
export const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

// Timing feedback (pedagogy): compares the player's onsets to the band's beat
// grid. Most accurate on headphones — see measureTiming in audioEngine.js.
export const TIMING_REFRACTORY = 0.12;  // min seconds between measured onsets
export const TIMING_WINDOW     = 12;    // onsets averaged for the rush/drag read
export const TIMING_TIGHT_SEC  = 0.05;  // within ±50 ms counts as "in the pocket"
export const TIMING_ONBEAT_FRAC = 0.3;  // only onsets within ±0.3 beat are graded

// Energy / dynamics
export const ENERGY_ATTACK  = 0.06;
export const ENERGY_RELEASE = 0.008;
export const ENERGY_LOW     = 0.003;
export const ENERGY_HIGH    = 0.030;

// ---- Blues preset (see genres.js for how styles are assembled) ----
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

// Dynamic arc over the 12-bar form (gain multiplier per bar) — the V–IV bars
// (9–10) are the tension peak, bar 12 pushes into the turnaround.
export const BLUES_BAR_DYNAMICS =
  [1.0, 0.97, 1.0, 1.02, 1.03, 1.03, 1.0, 1.0, 1.08, 1.06, 1.0, 1.05];

// Bass multisample manifest — MIDI note numbers expected as
// /samples/bass-<midi>.wav. These 7 (every major third, C2–C4) keep repitching
// to ≤±2 semitones. For pristine quality record the full chromatic range and
// use: Array.from({ length: 25 }, (_, i) => 36 + i)  // C2..C4
export const BASS_SAMPLE_MIDI = [36, 40, 44, 48, 52, 56, 60];

// Drum kit manifest. Each drum maps to an array of velocity LAYERS ordered
// soft → loud; each layer is an array of round-robin TAKES (filenames in
// /samples/). The engine picks a layer from how hard the hit is, then cycles
// through that layer's takes so consecutive hits aren't bit-identical.
//
// Record as many or as few as you like — a single file per drum still works.
//   one file:                kick:  [['kick.wav']]
//   3 velocity layers:       kick:  [['kick-soft.wav'], ['kick-mid.wav'], ['kick-hard.wav']]
//   velocity + round-robin:  snare: [['snare-soft-1.wav','snare-soft-2.wav'],
//                                    ['snare-hard-1.wav','snare-hard-2.wav']]
// Only list files you actually have, so nothing 404s.
export const DRUM_KIT = {
  kick:    [['kick.wav']],
  snare:   [['snare.wav']],
  hihat:   [['hihat.wav']],
  openhat: [['openhat.wav']],
  crash:   [['crash.wav']],
};

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
