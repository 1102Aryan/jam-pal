import { useEffect, useRef } from 'react';

// ============================================================================
// Audio-reactive ring visualizer.
//
// A circle whose radius at every angle is a morphing sum of sine waves (a
// "Fourier shape"), displaced by the live mic FFT, drawn as several offset,
// fading layers, stroked with a slowly-flowing angular gradient locked to the
// app palette, with an energy bloom behind it, a beat pulse, and a travelling
// highlight. It keeps morphing/rotating even with no audio, so it never feels
// static. All animation runs in one requestAnimationFrame loop on refs — no
// React re-renders per frame.
// ============================================================================

const TAU   = Math.PI * 2;
const N      = 180;   // samples around the circle
const BANDS  = 64;    // FFT bands mapped onto the ring
const WAVES  = 8;     // max Fourier waves (adaptive complexity scales this down)
const LAYERS = 4;     // offset copies for depth / light-trail look

// gradient — cyan → blue → purple → pink → cyan (matches --ring-b/--ring-a/pink)
const GRADIENT = ['#00d4ff', '#6ea8ff', '#9b6fff', '#c084fc', '#00d4ff'];
const LAYER_ALPHA = [1, 0.7, 0.45, 0.26];
const easeInOut = (t) => t * t * (3 - 2 * t);

// one Fourier shape: WAVES sines with decreasing amplitude as frequency rises
function makeShape() {
  const w = [];
  for (let i = 0; i < WAVES; i++) {
    w.push({
      amp:   (0.05 / (1 + i * 0.7)) * (0.6 + Math.random() * 0.8), // fraction of radius
      freq:  2 + Math.floor(Math.random() * (3 + i * 4)),
      phase: Math.random() * TAU,
    });
  }
  return w;
}

function RingVisualizer({ getFrequencyData, rms = 0, energy = 0, activeBeat = -1, listening = false, playing = false, className }) {
  const canvasRef = useRef(null);
  // live props the RAF loop reads without restarting
  const live = useRef({ rms, energy, activeBeat, listening, playing });
  live.current = { rms, energy, activeBeat, listening, playing };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // ---- persistent animation state ----
    let shapeA = makeShape();
    let shapeB = makeShape();
    let morphT = 0;
    const fft   = new Uint8Array(2048);   // generous; only the low bins matter
    const bands = new Float32Array(BANDS);     // smoothed FFT bands (0..1)
    let smRms = 0, smEnergy = 0;
    let gradRot = 0, globalRot = 0, hlAngle = 0, hlSpeed = TAU / 6.5;
    let lastBeat = -1, beatAt = -1e9;
    let raf = 0, last = performance.now();

    // size the canvas to its box at device resolution
    let size = 0, cx = 0, cy = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const css = canvas.clientWidth || 360;
      size = css;
      canvas.width = canvas.height = Math.round(css * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = cy = css / 2;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // radius (fraction of baseR, ~0..0.2) at a sampling angle, from the morphed
    // Fourier shape masked by adaptive complexity, plus the FFT displacement
    const shapeFrac = (ang, activeWaves, audioStrength) => {
      const te = easeInOut(morphT);
      let r = 0;
      for (let i = 0; i < WAVES; i++) {
        const gate = Math.max(0, Math.min(1, activeWaves - i)); // fade waves in/out
        if (gate <= 0) continue;
        const a = shapeA[i], b = shapeB[i];
        const amp   = a.amp   + (b.amp   - a.amp)   * te;
        const freq  = a.freq  + (b.freq  - a.freq)  * te;
        const phase = a.phase + (b.phase - a.phase) * te;
        r += gate * amp * Math.sin(freq * ang + phase);
      }
      // FFT displacement wrapped around the circle (interpolated between bands)
      const bf = (ang / TAU) * BANDS;
      const b0 = ((bf | 0) % BANDS + BANDS) % BANDS;
      const b1 = (b0 + 1) % BANDS;
      const fr = bf - Math.floor(bf);
      r += (bands[b0] * (1 - fr) + bands[b1] * fr) * audioStrength;
      return r;
    };

    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const p = live.current;

      // ---- audio: pull FFT, fold to BANDS, smooth (EMA) ----
      const hasAudio = p.listening && getFrequencyData(fft);
      const usable = Math.min(fft.length, 420); // ~ up to 9 kHz, where the music lives
      for (let bnd = 0; bnd < BANDS; bnd++) {
        let v = 0;
        if (hasAudio) {
          const lo = Math.floor((bnd / BANDS) * usable);
          const hi = Math.floor(((bnd + 1) / BANDS) * usable);
          let s = 0;
          for (let k = lo; k < hi; k++) s += fft[k];
          v = (s / Math.max(1, hi - lo)) / 255;
        }
        bands[bnd] += (v - bands[bnd]) * 0.25; // smooth out jitter
      }
      smRms    += (p.rms * 6 - smRms) * 0.08;
      smEnergy += (p.energy - smEnergy) * 0.05;
      const eng = Math.max(0, Math.min(1, smEnergy));

      // only come alive when there's actually audio — the band is playing, or
      // the mic is hearing something. Otherwise the ring holds still.
      const moving = p.playing || (p.listening && smRms > 0.02);

      // ---- beat pulse + highlight kick (only while moving) ----
      if (moving && p.activeBeat !== lastBeat && p.activeBeat >= 0) {
        beatAt = now;
        hlSpeed = TAU / 6;   // highlight darts on the beat, then eases back
        lastBeat = p.activeBeat;
      }
      if (p.activeBeat !== lastBeat) lastBeat = p.activeBeat;
      hlSpeed += (TAU / 12 - hlSpeed) * 0.04;
      const sinceBeat = (now - beatAt) / 1000;
      const pulse = 1 + 0.03 * Math.max(0, 1 - sinceBeat / 0.2);

      // ---- advance the clocks ----
      // drift very slowly when idle so the ring still has a little life, and run
      // at full speed only when there's audio
      const sp = moving ? 1 : 0.2;
      morphT += (dt / 4) * sp;          // a new shape every ~4s playing, ~20s idle
      if (morphT >= 1) { morphT = 0; shapeA = shapeB; shapeB = makeShape(); }
      globalRot += dt * (TAU / 90) * sp;
      gradRot   += dt * (TAU / 40) * (1 + eng) * sp;
      hlAngle   += dt * hlSpeed * sp;

      // canvas is drawn 1.4× the ring box (see CSS), so 0.36·size ≈ the old
      // full-size ring, with headroom around it for wobble + glow
      const baseR = size * 0.36 * pulse * (1 + 0.04 * Math.min(1, smRms));
      const activeWaves = 2 + eng * (WAVES - 2);     // 2 waves quiet … 8 loud
      const audioStrength = 0.06 + 0.06 * Math.min(1, smRms);
      const lineW = Math.max(3, Math.min(7, size * 0.016));

      ctx.clearRect(0, 0, size, size);

      // ---- Layer: energy bloom (behind the ring, breathes with RMS) ----
      const bloom = ctx.createRadialGradient(cx, cy, baseR * 0.5, cx, cy, baseR * 1.65);
      const bloomA = 0.06 + 0.22 * Math.min(1, smRms);
      bloom.addColorStop(0, `rgba(0,212,255,${bloomA})`);
      bloom.addColorStop(0.5, `rgba(155,111,255,${bloomA * 0.5})`);
      bloom.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bloom;
      ctx.fillRect(0, 0, size, size);

      // ---- the angular gradient stroke (flows independently of the ring) ----
      let stroke;
      if (ctx.createConicGradient) {
        stroke = ctx.createConicGradient(gradRot, cx, cy);
        GRADIENT.forEach((c, i) => stroke.addColorStop(i / (GRADIENT.length - 1), c));
      } else {
        stroke = GRADIENT[0]; // very old browsers
      }

      // ---- Layers: offset, fading copies of the spline for depth ----
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (let l = 0; l < LAYERS; l++) {
        const phaseOff = l * 0.22;          // each layer's shape is slightly shifted
        const radScale = 1 + l * 0.02;      // outer layers a touch larger
        ctx.globalAlpha = LAYER_ALPHA[l];
        ctx.globalCompositeOperation = l === 0 ? 'source-over' : 'lighter';
        ctx.lineWidth = lineW * (1 - l * 0.12);
        ctx.strokeStyle = stroke;

        ctx.beginPath();
        for (let i = 0; i <= N; i++) {
          const ang = (i / N) * TAU;
          const s   = ang + globalRot + phaseOff;        // sample angle (rotates)
          const r   = baseR * radScale * (1 + shapeFrac(s, activeWaves, audioStrength));
          const x   = cx + Math.cos(ang) * r;
          const y   = cy + Math.sin(ang) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }

      // ---- Layer: travelling highlight (energy flowing around the ring) ----
      const hx = cx + Math.cos(hlAngle - globalRot) * baseR;
      const hy = cy + Math.sin(hlAngle - globalRot) * baseR;
      const hl = ctx.createRadialGradient(hx, hy, 0, hx, hy, size * 0.12);
      hl.addColorStop(0, 'rgba(228,225,244,0.55)');
      hl.addColorStop(0.4, 'rgba(0,212,180,0.30)');
      hl.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = hl;
      ctx.fillRect(0, 0, size, size);

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [getFrequencyData]);

  return <canvas ref={canvasRef} className={className} />;
}

export default RingVisualizer;
