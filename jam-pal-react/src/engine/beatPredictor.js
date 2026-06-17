// ============================================================================
// Predictive tempo model — the anticipatory core of the band's timekeeping.
//
// Step 1 tracked tempo as a level + a trend so the band could forecast where
// the player is heading instead of trailing where they've been.
//
// Step 2 models the *drift* properly:
//   • drift is a RATE in BPM-per-second (computed from timestamped readings),
//     so it's robust to onsets arriving unevenly — not "per reading", which
//     conflated tempo change with how often the player happened to strum.
//   • a CONSISTENCY gate: the band only anticipates drift when the tempo has
//     been moving in one direction (a real accel/decel). Random back-and-forth
//     wobble — a beginner who's just uneven, not actually speeding up — decays
//     the consistency, so the band holds steady instead of chasing the noise.
//
//   const bp = createBeatPredictor();
//   bp.observe(detectedBpm, wobble, now);  // feed each fresh reading (now = secs)
//   const tempo = bp.predict(1);           // BPM forecast 1 beat ahead
// ============================================================================

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createBeatPredictor({
  alphaSteady  = 0.45,  // level gain when steady (responsive)
  alphaMessy   = 0.18,  // level gain when erratic (lean on prediction)
  beta         = 0.18,  // drift-rate learning rate
  gamma        = 0.25,  // consistency learning rate
  maxDriftBps  = 8,     // clamp drift to ±8 BPM/sec — no runaway
  driftEps     = 0.5,   // BPM/sec below this counts as "not really moving"
  minDt        = 0.05,  // clamp the gap between readings (seconds)
  maxDt        = 2.0,
  minBpm       = 50,
  maxBpm       = 180,
} = {}) {
  let level       = 100;
  let driftRate   = 0;   // BPM per second
  let consistency = 0;   // 0 = wobble/no trend … 1 = sustained drift
  let lastT       = 0;
  let started     = false;

  // map smoothedWobble (≈0.1 steady … 0.4 messy) → 0 steady … 1 messy
  const messiness = (wobble) => clamp((wobble - 0.1) / 0.3, 0, 1);

  return {
    reset(bpm = 100) {
      level = bpm; driftRate = 0; consistency = 0; lastT = 0; started = false;
    },

    observe(bpm, wobble = 0, now = 0) {
      if (!started) { level = bpm; driftRate = 0; consistency = 0; lastT = now; started = true; return; }

      const dt   = clamp(now - lastT, minDt, maxDt);
      lastT      = now;
      const prev = level;

      // level update (Holt's, irregular sampling): smooth the new reading
      // against where the current drift said we'd be
      const alpha = alphaSteady + messiness(wobble) * (alphaMessy - alphaSteady);
      level = alpha * bpm + (1 - alpha) * (level + driftRate * dt);
      level = clamp(level, minBpm, maxBpm);

      // instantaneous drift rate, then smooth it
      const instRate = (level - prev) / dt;
      driftRate = clamp(beta * instRate + (1 - beta) * driftRate, -maxDriftBps, maxDriftBps);

      // consistency: did this reading keep moving the same way as the drift?
      // tempo that's actually drifting agrees repeatedly; wobble decays it
      const moving = Math.abs(instRate) >= driftEps;
      const agrees = moving && Math.sign(instRate) === Math.sign(driftRate) ? 1 : 0;
      consistency = clamp(gamma * agrees + (1 - gamma) * consistency, 0, 1);
    },

    // forecast BPM `beatsAhead` into the future — drift is applied in real time
    // and scaled by how consistent the drift has been
    predict(beatsAhead = 1) {
      if (!started) return level;
      const secondsAhead = beatsAhead * 60 / level;
      return clamp(level + driftRate * secondsAhead * consistency, minBpm, maxBpm);
    },

    current()    { return level; },
    driftPerSec() { return driftRate; },
    consistency() { return consistency; },
  };
}
