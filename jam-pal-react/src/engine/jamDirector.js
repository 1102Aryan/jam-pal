// Per-style probability and timing config. All durations are in bars.
const STYLE_CONFIG = {
  supportive: {
    breakdownChance: 0.06,  // probability per bar (after cooldown expires)
    breakdownCooldown: 18,  // bars before the next event can fire
    breakdownDuration: 2,
    soloChance: 0.04,
    soloCooldown: 20,
    soloDuration: 4,
    callChance: 0.03,
    callCooldown: 24,
    callDuration: 2,
    responseDuration: 2,
  },
  lead: {
    breakdownChance: 0.14,
    breakdownCooldown: 6,
    breakdownDuration: 4,
    soloChance: 0.12,
    soloCooldown: 8,
    soloDuration: 6,
    callChance: 0.08,
    callCooldown: 10,
    callDuration: 2,
    responseDuration: 2,
  },
  ambient: {
    breakdownChance: 0.08,
    breakdownCooldown: 10,
    breakdownDuration: 4,
    soloChance: 0.06,
    soloCooldown: 12,
    soloDuration: 8,
    callChance: 0.05,
    callCooldown: 14,
    callDuration: 4,
    responseDuration: 4,
  },
};

// Mute mask per state — false = play, true = muted
const MASKS = {
  normal:    { kick: false, snare: false, hat: false, bass: false },
  breakdown: { kick: false, snare: true,  hat: true,  bass: true  }, // kick only: re-entry practice
  solo:      { kick: false, snare: false, hat: true,  bass: false }, // kick+bass: minimal backing
  call:      { kick: false, snare: true,  hat: true,  bass: false }, // bass+kick: melodic call phrase
  response:  { kick: true,  snare: true,  hat: true,  bass: true  }, // full silence: player answers
};

// { getStyle: () => string, onModeChange: (mode | null) => void, setMuteMask: (mask) => void }
export function createJamDirector({ getStyle, onModeChange, setMuteMask }) {
  let state           = 'normal';
  let barsInState     = 0;
  let stateDuration   = 0;
  let cooldown        = 0;
  let pendingCooldown = 0;

  function applyState(newState, duration) {
    state         = newState;
    barsInState   = 0;
    stateDuration = duration;
    setMuteMask(MASKS[newState] ?? MASKS.normal);
    onModeChange(newState === 'normal' ? null : newState);
  }

  return {
    // Called at every bar boundary (step 0) from the scheduler
    onBar(barCount) {
      const cfg = STYLE_CONFIG[getStyle()] ?? STYLE_CONFIG.supportive;

      if (state !== 'normal') {
        barsInState++;
        if (barsInState >= stateDuration) {
          if (state === 'call') {
            // call is two-phase: call phrase → response gap
            applyState('response', cfg.responseDuration);
          } else {
            cooldown = pendingCooldown;
            applyState('normal', 0);
          }
        }
        return;
      }

      if (cooldown > 0) { cooldown--; return; }
      if (barCount < 4) return; // let the band settle before triggering anything

      const roll = Math.random();
      const p1   = cfg.breakdownChance;
      const p2   = p1 + cfg.soloChance;
      const p3   = p2 + cfg.callChance;

      if (roll < p1) {
        pendingCooldown = cfg.breakdownCooldown;
        applyState('breakdown', cfg.breakdownDuration);
      } else if (roll < p2) {
        pendingCooldown = cfg.soloCooldown;
        applyState('solo', cfg.soloDuration);
      } else if (roll < p3) {
        pendingCooldown = cfg.callCooldown;
        applyState('call', cfg.callDuration);
      }
    },

    reset() {
      state           = 'normal';
      barsInState     = 0;
      stateDuration   = 0;
      cooldown        = 0;
      pendingCooldown = 0;
      setMuteMask(MASKS.normal);
      onModeChange(null);
    },
  };
}
