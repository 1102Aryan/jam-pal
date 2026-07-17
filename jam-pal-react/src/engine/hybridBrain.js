import { createBrain } from './bandBrain.js';
import { createTransformerBrain } from './transformerBrain.js';

// Dev A/B brain: runs the local groove brain and the backend transformer brain
// in lockstep, and picks which one drives the band per bar. `mix` is the
// probability a bar comes from the backend — 0 = always local, 1 = always
// backend, in between blends bar by bar so the two are audibly comparable
// mid-session. Only wired up in dev builds (see useJamEngine.js).
export function createHybridBrain({ genre, timeSig, onPrediction, onChordPrediction, onBarSource } = {}) {
  const local  = createBrain({ genre, timeSig });
  const remote = createTransformerBrain({ genre, timeSig, onPrediction, onChordPrediction });

  let mix = 1;
  let useRemote = true;

  return {
    setMix(v) { mix = Math.max(0, Math.min(1, v)); },
    getMix: () => mix,

    addEvent: (t, pitch) => remote.addEvent?.(t, pitch),

    stepAdvance: (step) => (useRemote ? remote : local).stepAdvance(step),

    reset() {
      local.reset();
      remote.reset();
    },

    step(ctx) {
      if (ctx.step === 0) {
        useRemote = Math.random() < mix;
        onBarSource?.(useRemote ? 'backend' : 'local');
      }
      // step both every time so their internal per-bar state stays coherent
      const localEvents  = local.step(ctx);
      const remoteEvents = remote.step(ctx);
      return useRemote ? remoteEvents : localEvents;
    },
  };
}
