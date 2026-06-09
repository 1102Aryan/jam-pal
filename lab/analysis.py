"""Phase 1 audio analysis: onset, tempo, intensity, and key detection (offline / reference)."""

import numpy as np
import librosa


# Milestone 1 — onset detection
def detect_onsets(y, sr, pad_seconds=0.5):
    # Prepend silence so the first note has energy to rise from.
    if pad_seconds > 0:
        y = np.concatenate([np.zeros(int(pad_seconds * sr)), y])
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    onset_frames = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr, delta=0.1)
    onset_times = librosa.frames_to_time(onset_frames, sr=sr) - pad_seconds
    onset_times = onset_times[onset_times >= -0.01]
    return onset_times, onset_env


# Milestone 2 — tempo (librosa beat tracker + IOI median)
def detect_tempo(y, sr, onset_times=None):
    tempo_arr = librosa.beat.beat_track(y=y, sr=sr)[0]
    tempo_lr = fold_tempo(float(np.atleast_1d(tempo_arr)[0]))

    tempo_ioi = None
    if onset_times is not None and len(onset_times) > 1:
        tempo_ioi = fold_tempo(60.0 / np.median(np.diff(onset_times)))

    return tempo_lr, tempo_ioi


# Milestone 3 — RMS intensity curve
def detect_intensity(y, sr, hop=512):
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop)
    return times, rms


# Milestone 4 — key via Krumhansl-Schmugler correlation
KS_MAJOR = np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88])
KS_MINOR = np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])
PITCH_CLASSES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]

def detect_key(y, sr):
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    profile = chroma.mean(axis=1)
    profile = profile / (profile.sum() + 1e-9)

    best = (None, -np.inf)
    for tonic in range(12):
        for mode, ks in (("major", KS_MAJOR), ("minor", KS_MINOR)):
            template = np.roll(ks, tonic)
            template = template / template.sum()
            score = np.corrcoef(profile, template)[0, 1]
            if score > best[1]:
                best = (f"{PITCH_CLASSES[tonic]} {mode}", score)
    return best[0], profile


def fold_tempo(bpm, low=70, high=160):
    """Halve or double bpm until it falls in [low, high]."""
    while bpm < low or bpm > high:
        if bpm > high:
            bpm /= 2
        else:
            bpm *= 2
    return bpm
