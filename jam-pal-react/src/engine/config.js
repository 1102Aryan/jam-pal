// Onset detection
export const BASELINE_RATE  = 0.05;
export const ONSET_FACTOR   = 2.5;
export const REFRACTORY     = 0.40;   // seconds between onsets
export const RMS_GATE       = 0.003;  // silence guard
export const GUITAR_LOW_HZ  = 150;
export const GUITAR_HIGH_HZ = 6000;
export const ONSET_GATE_DUR = 0.40;   // seconds to accumulate chroma after onset

// Chroma binning range for chord/key detection (see updateChroma in analysis.js)
export const GUITAR_CHROMA_LOW_HZ  = 80;
export const GUITAR_CHROMA_HIGH_HZ = 1200;

// Bass tuning: fundamentals sit roughly an octave-plus below guitar (a 5-string's
// low B ≈ 31 Hz vs guitar's low E ≈ 82 Hz), so both onset and chroma detection
// need a much lower floor or most of what's actually played goes undetected.
export const BASS_LOW_HZ         = 28;
export const BASS_HIGH_HZ        = 1200;
export const BASS_CHROMA_LOW_HZ  = 28;
export const BASS_CHROMA_HIGH_HZ = 800;

// Keyboard tuning: chords span both lower (left-hand/bass notes, ~C2) and
// wider (spread voicings) than a strummed guitar, and the hammer attack gives
// a strong percussive transient across a broad band — useful for onsets, but
// chroma stays narrower so distant overtones don't smear the chord read.
export const KEYS_LOW_HZ         = 60;
export const KEYS_HIGH_HZ        = 6000;
export const KEYS_CHROMA_LOW_HZ  = 60;
export const KEYS_CHROMA_HIGH_HZ = 1500;

// Per-instrument detection profile, selected by what the player says they're
// playing (see SetupScreen's instrument picker). Feeds computeSpectralFlux
// (onset) and updateChroma (chord/key) in analysis.js.
export const INSTRUMENT_PROFILES = {
  guitar: {
    onsetLowHz: GUITAR_LOW_HZ, onsetHighHz: GUITAR_HIGH_HZ,
    chromaLowHz: GUITAR_CHROMA_LOW_HZ, chromaHighHz: GUITAR_CHROMA_HIGH_HZ,
  },
  bass: {
    onsetLowHz: BASS_LOW_HZ, onsetHighHz: BASS_HIGH_HZ,
    chromaLowHz: BASS_CHROMA_LOW_HZ, chromaHighHz: BASS_CHROMA_HIGH_HZ,
  },
  keys: {
    onsetLowHz: KEYS_LOW_HZ, onsetHighHz: KEYS_HIGH_HZ,
    chromaLowHz: KEYS_CHROMA_LOW_HZ, chromaHighHz: KEYS_CHROMA_HIGH_HZ,
  },
};

// Tempo
export const TEMPO_WINDOW = 5;        // gaps between last N onsets
// How many beats ahead the band forecasts the player's tempo (anticipation).
// 0 = pure reaction; ~1 leads the player's drift so the band stops trailing.
export const TEMPO_LOOKAHEAD_BEATS = 1.0;

// Scheduler
export const LOOKAHEAD_MS    = 25;
export const SCHEDULE_AHEAD  = 0.1;   // seconds

// Time signatures. The grid is always sixteenth-notes; a meter just sets how
// many steps make a bar and how they group into displayed beats.
//   stepsPerBar  : grid steps in one bar (16th notes)
//   stepsPerBeat : steps per displayed beat / metronome click
//   beats        : beats shown per bar  (= stepsPerBar / stepsPerBeat)
//   accentBeats  : beat indices the metronome accents (the bar's strong pulses)
// 6/8 is compound: 6 eighth-note pulses (2 steps each), felt in 2 (accents 1 & 4).
export const METERS = {
  '4/4':  { stepsPerBar: 16, stepsPerBeat: 4, beats: 4,  accentBeats: [0] },
  '3/4':  { stepsPerBar: 12, stepsPerBeat: 4, beats: 3,  accentBeats: [0] },
  '2/4':  { stepsPerBar: 8,  stepsPerBeat: 4, beats: 2,  accentBeats: [0] },
  '6/8':  { stepsPerBar: 12, stepsPerBeat: 2, beats: 6,  accentBeats: [0, 3] },
  // 12/8 compound quadruple — 4 dotted-quarter pulses (slow-blues shuffle feel)
  '12/8': { stepsPerBar: 24, stepsPerBeat: 2, beats: 12, accentBeats: [0, 3, 6, 9] },
};

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

// Bass multisample — real recorded notes with velocity LAYERS (soft → loud)
// and round-robin TAKES, mirroring the drum-kit structure below. Files live in
// /samples/bass/ named <note><octave>_<dyn>_rr<n>.ogg (e.g. a2_ff_rr3.ogg).
//
// Only octaves 2–3 are listed: the bass line never plays above ~Gb3 (the root
// sits at C2–B2 and patterns reach the fifth at most — see genres.js), so the
// library's octave-4/5 notes would be dead weight. Notes are spaced ~a minor
// third apart, so any target repitches by ≤1.5 semitones.
//
// We load 3 of the 4 recorded dynamics (ff omitted to keep the download light)
// and 2 of the 4 round-robins — ~32 files (~4 MB) instead of the full 224.
export const BASS_VELOCITY_LAYERS = ['pp', 'p', 'f']; // soft → loud
export const BASS_ROUND_ROBINS    = ['rr1', 'rr2'];
export const BASS_NOTES = {        // filename note → MIDI number
  db2: 37, e2: 40, gb2: 42, a2: 45,
  c3:  48, eb3: 51, gb3: 54, a3: 57,
};

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
// Acoustic kit chosen from the /samples/drums/ palette. The two "acousticNN"
// variants of each drum are used as round-robin takes (they're different
// recordings, not soft/loud layers), so consecutive hits aren't bit-identical.
export const DRUM_KIT = {
  kick:    [['drums/kick-acoustic01.ogg',  'drums/kick-acoustic02.ogg']],
  snare:   [['drums/snare-acoustic01.ogg', 'drums/snare-acoustic02.ogg']],
  hihat:   [['drums/hihat-acoustic01.ogg', 'drums/hihat-acoustic02.ogg']],
  openhat: [['drums/openhat-acoustic01.ogg']],
  crash:   [['drums/crash-acoustic.ogg']],
};

// Per-genre drum kits — each picks different samples from /samples/drums/ so the
// genres actually sound different. Falls back to DRUM_KIT if a genre is absent.
export const GENRE_KITS = {
  // warm acoustic; a ride cymbal stands in for the "hat" → classic shuffle ride
  blues: {
    kick:    [['drums/kick-acoustic01.ogg',  'drums/kick-acoustic02.ogg']],
    snare:   [['drums/snare-acoustic01.ogg', 'drums/snare-acoustic02.ogg']],
    hihat:   [['drums/ride-acoustic01.ogg',  'drums/ride-acoustic02.ogg']],
    openhat: [['drums/openhat-acoustic01.ogg']],
    crash:   [['drums/crash-acoustic.ogg']],
  },
  // bigger, punchier acoustic
  rock: {
    kick:    [['drums/kick-heavy.ogg',       'drums/kick-acoustic02.ogg']],
    snare:   [['drums/snare-acoustic02.ogg', 'drums/snare-big.ogg']],
    hihat:   [['drums/hihat-acoustic01.ogg', 'drums/hihat-acoustic02.ogg']],
    openhat: [['drums/openhat-acoustic01.ogg']],
    crash:   [['drums/crash-acoustic.ogg']],
  },
  // tight, clean, electronic-tinged; clap layered with the snare
  pop: {
    kick:    [['drums/kick-big.ogg',      'drums/kick-tight.ogg']],
    snare:   [['drums/snare-punch.ogg',   'drums/clap-fat.ogg']],
    hihat:   [['drums/hihat-digital.ogg', 'drums/hihat-electro.ogg']],
    openhat: [['drums/openhat-tight.ogg']],
    crash:   [['drums/crash-808.ogg']],
  },
  // huge, washy, roomy
  shoegaze: {
    kick:    [['drums/kick-deep.ogg',  'drums/kick-heavy.ogg']],
    snare:   [['drums/snare-big.ogg',  'drums/snare-modular.ogg']],
    hihat:   [['drums/hihat-acoustic01.ogg']],
    openhat: [['drums/openhat-acoustic01.ogg']],
    crash:   [['drums/crash-acoustic.ogg', 'drums/crash-noise.ogg']],
  },
};

// Per-genre bus FX — gives each style its own production vibe, not just a room.
//   roomSeconds / roomDecay : reverb tail length & shape
//   reverbSend              : how much reverb is mixed in
//   tone                    : master high-shelf gain in dB (+ = bright/airy pop,
//                             − = warm/dark blues & shoegaze)
//   predelay                : seconds before the reverb hits — separates the wet
//                             tail from the dry hit for a polished, produced feel
export const GENRE_FX = {
  blues:    { roomSeconds: 1.1, roomDecay: 3.0, reverbSend: 0.16, tone: -1.5, predelay: 0.020 }, // warm, roomy
  rock:     { roomSeconds: 0.7, roomDecay: 2.6, reverbSend: 0.10, tone:  1.0, predelay: 0.010 }, // tight, present
  pop:      { roomSeconds: 1.0, roomDecay: 2.0, reverbSend: 0.18, tone:  4.0, predelay: 0.025 }, // bright, airy, spacious
  shoegaze: { roomSeconds: 2.8, roomDecay: 2.4, reverbSend: 0.38, tone: -2.0, predelay: 0.040 }, // dark, cavernous wash
};

// ---- Performance / humanization ----
export const HUMAN_TIME_JITTER = 0.004;  // ±4 ms on everything except downbeats
export const GHOST_SNARE_GAIN  = 0.10;
export const EXTRA_KICK_PROB   = 0.18;   // occasional kick on beat 3's shuffle note
export const PHRASE_BARS       = 4;      // fill on the last bar of each phrase

// Intensity tiers — evaluated only at bar boundaries, with hysteresis so the
// band doesn't flap between levels.
export const TIER_UP   = [0.40, 0.82];   // energy to move 0→1, 1→2 (busy 16ths kept rare)
export const TIER_DOWN = [0.28, 0.58];   // energy to move 1→0, 2→1
export const SPARSE_ONSETS = 2;          // player onsets/bar at or below this → band thins out

// Once the band is locked in it follows the player's tempo less eagerly —
// real bands hold the pocket rather than chase every fluctuation.
export const LOCKED_FOLLOW_SCALE = 0.38;

// Session personality: rolled once per session so every jam has a slightly
// different drummer. [lo, hi] ranges, sampled uniformly.
export const PERSONALITY_RANGES = {
  shuffle:    [0.62, 0.68],    // where the shuffle note sits in the beat
  layback:    [0.004, 0.008],  // seconds the backbeat drags behind the grid
  fillProb:   [0.65, 1.0],     // chance a phrase ends with a fill
  midFillProb:[0.04, 0.10],    // chance of a surprise fill mid-phrase
  ghostProb:  [0.25, 0.45],    // ghost-snare density
  gainJitter: [0.08, 0.15],    // per-hit velocity looseness
  bassRest:   [0.06, 0.16],    // chance an off-beat bass note is left out (space)
  bassOctave: [0.05, 0.14],    // chance an off-beat root note jumps up an octave
};

// Fills: replace the normal pattern over beat 4 (steps 12-15) of the last bar
// of each phrase. One is chosen at random per phrase so no two feel identical.
export const BLUES_FILLS = [
  [ { step: 12, drum: 'snare', gain: 0.50 }, { step: 14, drum: 'snare', gain: 0.65 }, { step: 15, drum: 'snare', gain: 0.80 } ],
  [ { step: 12, drum: 'snare', gain: 0.55 }, { step: 13, drum: 'snare', gain: 0.35 }, { step: 14, drum: 'kick',  gain: 0.70 }, { step: 15, drum: 'snare', gain: 0.85 } ],
  [ { step: 12, drum: 'kick',  gain: 0.70 }, { step: 14, drum: 'snare', gain: 0.60 }, { step: 15, drum: 'snare', gain: 0.45 } ],
  [ { step: 14, drum: 'snare', gain: 0.55 }, { step: 15, drum: 'snare', gain: 0.75 } ],
];
