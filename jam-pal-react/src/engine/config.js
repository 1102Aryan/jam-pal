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
