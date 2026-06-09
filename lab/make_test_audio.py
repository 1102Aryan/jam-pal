"""Synthesises click_120.wav and riff_Amin.wav with known ground truth for detector testing."""

import numpy as np
import soundfile as sf
import os

SR = 22050
OUT = os.path.dirname(__file__)


def envelope(n, attack=0.005, decay=0.12):
    """Fast-attack, exponential-decay amplitude envelope."""
    t = np.arange(n) / SR
    a = np.clip(t / attack, 0, 1)
    d = np.exp(-(np.maximum(t - attack, 0)) / decay)
    return a * d


def tone(freq, dur, amp=0.5):
    """Additive sawtooth note with envelope."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    wave = sum((1.0 / k) * np.sin(2 * np.pi * freq * k * t) for k in range(1, 6))
    wave /= np.max(np.abs(wave))
    return amp * wave * envelope(n)


def click(dur=0.05, amp=0.8):
    """Short noise burst for metronome clicks."""
    n = int(dur * SR)
    noise = np.random.rand(n) * 2 - 1
    return amp * noise * envelope(n, attack=0.001, decay=0.03)


def make_click_track(bpm=120, beats=16):
    spb = 60.0 / bpm
    total = int(spb * beats * SR) + SR
    buf = np.zeros(total)
    onset_times = []
    c = click()
    for b in range(beats):
        start = int(b * spb * SR)
        buf[start:start + len(c)] += c
        onset_times.append(round(b * spb, 4))
    sf.write(os.path.join(OUT, "click_120.wav"), buf, SR)
    return {"bpm": bpm, "onset_times": onset_times}


NOTE_HZ = {
    "A2": 110.00, "C3": 130.81, "D3": 146.83, "E3": 164.81,
    "G3": 196.00, "A3": 220.00,
}

def make_riff(bpm=120):
    spb = 60.0 / bpm
    note_dur = spb / 2  # eighth notes
    phrase = ["A2", "C3", "E3", "D3", "A2", "E3", "G3", "A3"] * 2
    buf = np.array([], dtype=float)
    onset_times = []
    t = 0.0
    for i, name in enumerate(phrase):
        amp = 0.25 + 0.5 * (i / len(phrase))  # crescendo
        note = tone(NOTE_HZ[name], note_dur, amp=amp)
        slot = int(note_dur * SR)
        if len(note) < slot:
            note = np.pad(note, (0, slot - len(note)))
        else:
            note = note[:slot]
        buf = np.concatenate([buf, note])
        onset_times.append(round(t, 4))
        t += note_dur
    sf.write(os.path.join(OUT, "riff_Amin.wav"), buf, SR)
    return {"bpm": bpm, "key": "A minor", "root": "A",
            "onset_times": onset_times, "notes": phrase}


if __name__ == "__main__":
    click_info = make_click_track()
    riff_info = make_riff()
    print("Generated click_120.wav")
    print(f"  ground truth -> tempo: {click_info['bpm']} BPM, "
          f"{len(click_info['onset_times'])} onsets")
    print("Generated riff_Amin.wav")
    print(f"  ground truth -> tempo: {riff_info['bpm']} BPM, "
          f"key: {riff_info['key']}, {len(riff_info['onset_times'])} onsets")
