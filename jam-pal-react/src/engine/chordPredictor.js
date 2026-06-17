// ============================================================================
// Chord-transition predictor — the harmonic half of anticipation.
//
// The chord follower is otherwise reactive: it waits out a fixed hysteresis
// before committing a change, so the bass lands on the new chord late. This
// model tells the engine *how expected* a given chord change is, so an expected
// move (I→IV, V→I — root motion by fourths/fifths) can commit quickly while a
// surprising one still demands the full, cautious wait.
//
// It's key-independent: it scores by the ROOT MOTION (interval mod 12), seeded
// with functional-harmony priors and then learned live from the player's own
// progression — so it adapts to the song without needing the key.
//
//   pred.score(from, to)  -> 0..1 "how expected is this change"
//   pred.observe(from, to) -> learn a committed transition
// ============================================================================

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Prior expectation of a root move, by interval in semitones (0..11). Motion by
// a fourth/fifth (5, 7) is the backbone of functional harmony; whole steps
// (2, 10) next; the tritone (6) and bare semitones least likely.
const INTERVAL_PRIOR = [
  0.15, // 0  same root
  0.10, // 1  up semitone
  0.45, // 2  up whole step   (IV→V)
  0.30, // 3  up minor third
  0.30, // 4  up major third
  0.85, // 5  up fourth       (I→IV, V→I)
  0.10, // 6  tritone
  0.85, // 7  up fifth        (I→V, IV→I)
  0.20, // 8  up minor sixth
  0.40, // 9  up major sixth  (I→vi)
  0.45, // 10 down whole step (V→IV)
  0.15, // 11 down semitone
];

export function createChordPredictor() {
  const counts = new Array(12).fill(0); // learned transitions by interval
  let total = 0;

  const interval = (from, to) => ((to.rootPc - from.rootPc) % 12 + 12) % 12;

  return {
    reset() { counts.fill(0); total = 0; },

    observe(from, to) {
      if (!from || !to) return;
      const i = interval(from, to);
      if (i === 0) return;               // not a root change
      counts[i] += 1;
      total += 1;
    },

    // 0..1 — how expected is moving from `from` to `to`
    score(from, to) {
      if (!from) return 0.35;            // no context yet → mild expectation
      const i = interval(from, to);
      if (i === 0) return 0.9;           // same root (quality wobble) → expected
      const prior   = INTERVAL_PRIOR[i];
      const learned = total > 0 ? counts[i] / total : 0;
      // prior carries early on; learned evidence takes over as the song repeats
      return clamp(0.55 * prior + 0.7 * Math.min(1, learned * 2.5), 0, 1);
    },
  };
}
