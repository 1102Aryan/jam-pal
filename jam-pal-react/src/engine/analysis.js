import {
  GUITAR_LOW_HZ, GUITAR_HIGH_HZ,
  CHROMA_DECAY, KS_MAJOR, KS_MINOR, NOTE_NAMES, KEY_CONFIDENCE,
  TEMPO_WINDOW, ENERGY_LOW, ENERGY_HIGH,
  CHORD_MIN_ENERGY, CHORD_CONFIDENCE, CHORD_THIRD_DEADZONE,
} from './config.js';

export function foldTempo(bpm, low = 55, high = 160) {
  while (bpm < low || bpm > high) {
    if (bpm > high) bpm /= 2;
    else bpm *= 2;
  }
  return bpm;
}

export function energyLevel(smoothedEnergy) {
  return Math.max(0, Math.min(1, (smoothedEnergy - ENERGY_LOW) / (ENERGY_HIGH - ENERGY_LOW)));
}

// Computes half-wave-rectified spectral flux in the guitar band.
// state = { freqBuf: Float32Array, prevMag: Float32Array | null }
// Mutates state.prevMag; freqBuf must already be allocated to analyser.frequencyBinCount.
export function computeSpectralFlux(analyser, audioCtx, state) {
  analyser.getFloatFrequencyData(state.freqBuf);
  const binWidth = audioCtx.sampleRate / analyser.fftSize;
  const startBin = Math.round(GUITAR_LOW_HZ / binWidth);
  const endBin   = Math.min(state.freqBuf.length, Math.round(GUITAR_HIGH_HZ / binWidth));

  const mag = new Float32Array(endBin - startBin);
  for (let i = startBin; i < endBin; i++) {
    mag[i - startBin] = Math.pow(10, state.freqBuf[i] / 20);
  }

  if (!state.prevMag || state.prevMag.length !== mag.length) {
    state.prevMag = mag;
    return 0;
  }

  let flux = 0;
  for (let i = 0; i < mag.length; i++) {
    const diff = mag[i] - state.prevMag[i];
    if (diff > 0) flux += diff;
  }
  state.prevMag = mag;
  return flux;
}

// Bins freqBuf magnitudes into chromaProfile (12 pitch classes), gated by onset window.
// Mutates chromaProfile in place.
export function updateChroma(chromaProfile, freqBuf, analyser, audioCtx, now, onsetGateExpiry) {
  for (let i = 0; i < 12; i++) chromaProfile[i] *= CHROMA_DECAY;
  if (now > onsetGateExpiry) return;

  const binWidth = audioCtx.sampleRate / analyser.fftSize;
  for (let bin = 1; bin < freqBuf.length; bin++) {
    const freq = bin * binWidth;
    if (freq < 80 || freq > 1200) continue;
    if (freqBuf[bin] < -80) continue;
    const mag  = Math.pow(10, freqBuf[bin] / 20);
    const midi = 69 + 12 * Math.log2(freq / 440);
    const pc   = ((Math.round(midi) % 12) + 12) % 12;
    chromaProfile[pc] += mag;
  }
}

function pearsonCorr(a, b) {
  const n  = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da2 = 0, db2 = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    num += da * db; da2 += da * da; db2 += db * db;
  }
  return da2 * db2 > 0 ? num / Math.sqrt(da2 * db2) : 0;
}

// Krumhansl-Schmuckler key detection.
// Returns { root, mode, name, bassRootFreq } when confident and key changed, else null.
export function detectKey(chromaProfile, currentRoot, currentMode) {
  const total = chromaProfile.reduce((a, b) => a + b, 0);
  if (total < 1.0) return null;

  const norm = Array.from(chromaProfile, v => v / total);
  let best = { score: -Infinity, root: 0, mode: 'minor' };

  for (let tonic = 0; tonic < 12; tonic++) {
    for (const [mode, ks] of [['major', KS_MAJOR], ['minor', KS_MINOR]]) {
      const tSum = ks.reduce((a, b) => a + b, 0);
      const t    = ks.map(v => v / tSum);
      const rot  = Array.from({ length: 12 }, (_, i) => t[(i - tonic + 12) % 12]);
      const score = pearsonCorr(norm, rot);
      if (score > best.score) best = { score, root: tonic, mode };
    }
  }

  if (best.score < KEY_CONFIDENCE) return null;
  if (best.root === currentRoot && best.mode === currentMode) return null;

  const bassRootFreq = 440 * Math.pow(2, (36 + best.root - 69) / 12);
  return { root: best.root, mode: best.mode, bassRootFreq, name: NOTE_NAMES[best.root] };
}

// Detects the chord the player is currently sounding from the chroma profile.
// Forgiving by design: roots on the most prominent pitch class reinforced by
// its fifth, picks maj/min only when one third clearly wins (else keeps the
// previous quality), and returns null when nothing is confident enough so the
// caller can simply hold the last chord.
// Returns { rootPc, quality, confidence } or null.
export function detectChord(chromaProfile, prevQuality = 'maj') {
  const total = chromaProfile.reduce((a, b) => a + b, 0);
  if (total < CHORD_MIN_ENERGY) return null;

  const c = Array.from(chromaProfile, v => v / total);

  // score each possible root by its own strength plus the strength of its
  // fifth and best third — a perfect fifth is a strong root indicator
  let best = { score: -Infinity, root: 0 };
  for (let r = 0; r < 12; r++) {
    const fifth = c[(r + 7) % 12];
    const third = Math.max(c[(r + 4) % 12], c[(r + 3) % 12]);
    const score = 1.5 * c[r] + 1.0 * fifth + 0.8 * third;
    if (score > best.score) best = { score, root: r };
  }

  // confidence = how much of the total energy the triad explains
  const r          = best.root;
  const maj3       = c[(r + 4) % 12];
  const min3       = c[(r + 3) % 12];
  const confidence = c[r] + c[(r + 7) % 12] + Math.max(maj3, min3);
  if (confidence < CHORD_CONFIDENCE) return null;

  // major vs minor: only flip when one third clearly dominates, otherwise keep
  // what we had — a missing or ambiguous third shouldn't make the band waver
  let quality = prevQuality;
  if (maj3 > min3 * CHORD_THIRD_DEADZONE)      quality = 'maj';
  else if (min3 > maj3 * CHORD_THIRD_DEADZONE) quality = 'min';

  return { rootPc: r, quality, confidence };
}

export function wobbleToFollowRate(wobble) {
  const STEADY = 0.1, MESSY = 0.4;
  const HIGH_RATE = 0.10, LOW_RATE = 0.05;
  const t = Math.max(0, Math.min(1, (wobble - STEADY) / (MESSY - STEADY)));
  return HIGH_RATE + t * (LOW_RATE - HIGH_RATE);
}

// Computes tempo from recent onset gaps.
// Mutates onsetTimes (prunes stale entries).
// Returns { detectedBPM, smoothedWobble } or null if not enough data.
export function updateTempo(onsetTimes, prevSmoothedWobble) {
  const last   = onsetTimes[onsetTimes.length - 1];
  const cutoff = last - 8.0;
  while (onsetTimes.length > 0 && onsetTimes[0] < cutoff) onsetTimes.shift();

  if (onsetTimes.length < 3) return null;

  const recent = onsetTimes.slice(-TEMPO_WINDOW);
  const gaps   = [];
  for (let i = 1; i < recent.length; i++) gaps.push(recent[i] - recent[i - 1]);

  const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const variance = gaps.reduce((a, b) => a + (b - meanGap) ** 2, 0) / gaps.length;
  const wobble = Math.sqrt(variance) / meanGap;
  const smoothedWobble = prevSmoothedWobble + 0.2 * (wobble - prevSmoothedWobble);

  const sorted    = [...gaps].sort((a, b) => a - b);
  const medianGap = sorted[Math.floor(sorted.length / 2)];
  if (medianGap <= 0) return null;

  return { detectedBPM: foldTempo(60 / medianGap), smoothedWobble };
}
