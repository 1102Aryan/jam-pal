"""Runs all four detectors on the generated test audio and saves onsets.png and intensity.png."""

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import librosa
import numpy as np
import os

import analysis as A

LAB = os.path.dirname(__file__)


def banner(t):
    print("\n" + "=" * 56 + f"\n {t}\n" + "=" * 56)


click, sr = librosa.load(os.path.join(LAB, "clapping_120.wav"), sr=None)
riff, _ = librosa.load(os.path.join(LAB, "riff_Amin.wav"), sr=None)

banner("MILESTONE 1 - Onset detection  (on click_120.wav)")
onsets, onset_env = A.detect_onsets(click, sr)
print(f"Detected     : {len(onsets)} onsets")
print(f"First five   : {np.round(onsets[:5], 3)}  (expected ~0.0, 0.5, 1.0, 1.5, 2.0)")

plt.figure(figsize=(10, 3))
t = np.arange(len(click)) / sr
plt.plot(t, click, color="#888", linewidth=0.5)
for o in onsets:
    plt.axvline(o, color="#1d9e75", linewidth=1.2)
plt.title("Milestone 1: detected onsets (green) over click track")
plt.xlabel("seconds"); plt.tight_layout()
plt.savefig(os.path.join(LAB, "onsets.png"), dpi=90)
plt.close()
print("-> saved onsets.png")

banner("MILESTONE 2 - Tempo  (click + riff)")
for name, y in (("click_120.wav", click), ("riff_Amin.wav", riff)):
    ons, _ = A.detect_onsets(y, sr)
    t_lr, t_ioi = A.detect_tempo(y, sr, ons)
    print(f"{name:16s} truth=120 BPM | librosa={t_lr:6.1f} | IOI-method={t_ioi:6.1f}")

banner("MILESTONE 3 - Intensity  (on riff_Amin.wav, has a crescendo)")
times, rms = A.detect_intensity(riff, sr)
print(f"RMS at start : {rms[:5].mean():.4f}")
print(f"RMS at end   : {rms[-5:].mean():.4f}   (should be clearly higher)")

plt.figure(figsize=(10, 3))
plt.plot(times, rms, color="#ef9f27")
plt.title("Milestone 3: intensity (RMS) rising with the crescendo")
plt.xlabel("seconds"); plt.ylabel("loudness"); plt.tight_layout()
plt.savefig(os.path.join(LAB, "intensity.png"), dpi=90)
plt.close()
print("-> saved intensity.png")

banner("MILESTONE 4 - Key  (on riff_Amin.wav)")
key, profile = A.detect_key(riff, sr)
print(f"Ground truth : A minor")
print(f"Detected     : {key}")

print("\nAll milestones ran. Open onsets.png and intensity.png to eyeball them.")
