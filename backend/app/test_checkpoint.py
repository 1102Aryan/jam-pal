#!/usr/bin/env python3
"""
Anticipation checkpoint inference test.

Given a short sequence of recent guitar tokens, predicts:
  - The next note (MIDI pitch) the model expects
  - The time offset until that note (which drives tempo for drums/bass)
  - An estimated BPM from the recent note-onset pattern

Usage (on the cluster):
    python test_checkpoint.py --checkpoint /path/to/music_finetuned/checkpoint-25500

The script runs a smoke-test simulation (no live audio) so you can verify
the checkpoint loads and predicts something musical before wiring it into
the Guitar Jam Pal backend.
"""

import os
import json
import argparse
import statistics
import torch
from transformers import AutoModelForCausalLM

from anticipation import ops
from anticipation.sample import add_token
from anticipation.config import TIME_RESOLUTION, DELTA
from anticipation.vocab import (
    TIME_OFFSET, DUR_OFFSET, NOTE_OFFSET, MAX_PITCH,
    AUTOREGRESS,
)

# MIDI program 25 (0-indexed) = Acoustic Guitar Steel
GUITAR_INSTR = 25


# ---------------------------------------------------------------------------
# Token helpers
# ---------------------------------------------------------------------------

def note_to_tokens(time_sec, dur_sec, pitch, instr=GUITAR_INSTR):
    """Encode one note as the [time, dur, note] anticipation triplet."""
    t = TIME_OFFSET + int(TIME_RESOLUTION * time_sec)
    d = DUR_OFFSET  + int(TIME_RESOLUTION * dur_sec)
    n = NOTE_OFFSET + instr * MAX_PITCH + pitch
    return [t, d, n]


def chord_to_tokens(time_sec, dur_sec, pitches, instr=GUITAR_INSTR):
    tokens = []
    for p in pitches:
        tokens.extend(note_to_tokens(time_sec, dur_sec, p, instr))
    return tokens


def decode_note_token(note_tok):
    """Return (instrument, pitch) from a raw note token."""
    raw  = note_tok - NOTE_OFFSET
    instr = raw // MAX_PITCH
    pitch = raw  % MAX_PITCH
    return instr, pitch


# ---------------------------------------------------------------------------
# Tempo estimation from recent note onsets
# ---------------------------------------------------------------------------

def estimate_bpm(tokens):
    """
    Estimate BPM from the inter-onset intervals (IOIs) in the token sequence.
    Returns None if there are fewer than 2 events.
    """
    # raw time values in ticks (100 ticks = 1 second)
    times = [tok - TIME_OFFSET for tok in tokens[0::3]]
    times = sorted(set(times))          # unique onsets, sorted
    if len(times) < 2:
        return None

    # 20 ticks = 200 ms → filters out strumming staggers and keeps only real beat gaps
    MIN_BEAT_TICKS = 20
    iois = [times[i+1] - times[i] for i in range(len(times)-1)
            if times[i+1] - times[i] >= MIN_BEAT_TICKS]
    if not iois:
        return None

    # Use the median IOI as the beat estimate
    median_ticks = statistics.median(iois)
    beat_sec     = median_ticks / TIME_RESOLUTION
    bpm          = 60.0 / beat_sec if beat_sec > 0 else None
    return round(bpm, 1) if bpm else None


# ---------------------------------------------------------------------------
# Core prediction function (this is what the Guitar Jam Pal backend calls)
# ---------------------------------------------------------------------------

def predict_next(model, recent_tokens, top_p=0.95):
    """
    Given a flat list of recent anticipation tokens (multiples of 3),
    return a dict with the next predicted note and an estimated tempo.

    Args:
        model         : loaded AutoModelForCausalLM (already on device, eval mode)
        recent_tokens : list of int — recent [time, dur, note] triplets
        top_p         : nucleus sampling probability

    Returns:
        {
          "pitch":      int,    # MIDI pitch 0-127
          "instrument": int,    # MIDI program number 0-127
          "duration_ms": float, # predicted note duration in milliseconds
          "time_offset_ms": float, # ms until this note from the last event
          "estimated_bpm": float or None,
        }
    """
    assert len(recent_tokens) % 3 == 0 and len(recent_tokens) >= 3

    current_time = ops.max_time(recent_tokens, seconds=False)
    z = [AUTOREGRESS]

    new_tok = add_token(model, z, recent_tokens, top_p, current_time)
    # new_tok = [time_token, dur_token, note_token]

    pred_time_ticks = new_tok[0] - TIME_OFFSET
    last_time_ticks = current_time
    dt_ticks        = max(0, pred_time_ticks - last_time_ticks)
    dur_ticks       = new_tok[1] - DUR_OFFSET
    instr, pitch    = decode_note_token(new_tok[2])

    bpm = estimate_bpm(recent_tokens)

    return {
        "pitch":          pitch,
        "instrument":     instr,
        "duration_ms":    round(dur_ticks  / TIME_RESOLUTION * 1000, 1),
        "time_offset_ms": round(dt_ticks   / TIME_RESOLUTION * 1000, 1),
        "estimated_bpm":  bpm,
    }


# ---------------------------------------------------------------------------
# Smoke-test: simulate a guitarist playing a G major scale
# ---------------------------------------------------------------------------

def build_g_major_scale_tokens():
    """
    Simulate a guitarist playing a G major scale at ~120 BPM (eighth notes = 0.25s apart).
    Notes: G3 B3 D4 E4 G4 B4 D5 G5  (pitches: 55 59 62 64 67 71 74 79)
    """
    pitches    = [55, 59, 62, 64, 67, 71, 74, 79]
    step       = 0.25   # seconds between notes (120 BPM eighth notes)
    dur        = 0.20   # slightly shorter than the step

    tokens = []
    for i, pitch in enumerate(pitches):
        tokens.extend(note_to_tokens(i * step, dur, pitch))
    return ops.sort(tokens)


def build_e_minor_chord_progression():
    """
    Simulate strumming Em -> Am -> D -> G at ~90 BPM (one chord per beat = 0.67s).
    Chords are strummed so notes are slightly arpeggiating (5ms apart).
    """
    beat   = 60.0 / 90.0          # seconds per beat at 90 BPM
    dur    = beat * 0.9            # notes ring for most of the beat
    strum  = 0.005                 # 5ms arpeggio stagger

    chord_defs = [
        (0 * beat, [40, 47, 52, 55, 59, 64]),   # Em
        (1 * beat, [45, 52, 57, 60, 64]),         # Am
        (2 * beat, [50, 57, 62, 66]),             # D
        (3 * beat, [55, 59, 62, 67, 71]),         # G
    ]

    tokens = []
    for chord_time, pitches in chord_defs:
        for j, pitch in enumerate(pitches):
            tokens.extend(note_to_tokens(chord_time + j * strum, dur, pitch))
    return ops.sort(tokens)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(args):
    checkpoint = os.path.abspath(args.checkpoint)
    print(f"Checkpoint : {checkpoint}")

    if not os.path.isdir(checkpoint):
        print(f"ERROR: directory not found: {checkpoint}")
        return

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Device     : {device}")

    model = AutoModelForCausalLM.from_pretrained(checkpoint)
    model = model.to(device)
    model.eval()
    print("Model ready.\n")

    # -- choose seed sequence --
    if args.seed == "scale":
        seed = build_g_major_scale_tokens()
        desc = "G major scale (8 notes, 120 BPM eighth notes)"
    else:
        seed = build_e_minor_chord_progression()
        desc = "Em-Am-D-G chord progression (90 BPM)"

    print(f"Seed       : {desc}")
    print(f"Seed events: {len(seed)//3}")
    bpm_from_seed = estimate_bpm(seed)
    print(f"BPM in seed: {bpm_from_seed}\n")

    # -- run N prediction steps --
    print(f"Running {args.steps} prediction step(s) ...")
    tokens = seed[:]
    results = []

    for step in range(args.steps):
        pred = predict_next(model, tokens, top_p=args.top_p)
        results.append(pred)

        note_name = _midi_pitch_name(pred["pitch"])
        print(
            f"  Step {step+1:2d}: pitch={pred['pitch']:3d} ({note_name}), "
            f"dur={pred['duration_ms']:.0f}ms, "
            f"offset={pred['time_offset_ms']:.0f}ms, "
            f"bpm={pred['estimated_bpm']}"
        )

        # append the predicted token to rolling history so each step conditions on the last
        last_time = ops.max_time(tokens, seconds=False)
        next_time = last_time + int(pred["time_offset_ms"] / 1000 * TIME_RESOLUTION)
        next_dur  = int(pred["duration_ms"]  / 1000 * TIME_RESOLUTION)
        tokens.extend([
            TIME_OFFSET + next_time,
            DUR_OFFSET  + next_dur,
            NOTE_OFFSET + pred["instrument"] * MAX_PITCH + pred["pitch"],
        ])
        # keep only the last ~100 events so the context stays manageable
        if len(tokens) > 300:
            tokens = tokens[-300:]

    print()
    print("Summary JSON (first prediction):")
    print(json.dumps(results[0], indent=2))

    if args.json_out:
        with open(args.json_out, "w") as f:
            json.dump(results, f, indent=2)
        print(f"\nAll predictions written to: {args.json_out}")


def _midi_pitch_name(pitch):
    names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]
    return f"{names[pitch % 12]}{pitch // 12 - 1}"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Checkpoint inference test — next-note & tempo prediction")
    parser.add_argument(
        "--checkpoint", required=True,
        help="Path to checkpoint dir, e.g. /scratch/.../music_finetuned/checkpoint-25500",
    )
    parser.add_argument(
        "--seed", choices=["chords", "scale"], default="chords",
        help="Seed sequence type: 'chords' (Em-Am-D-G) or 'scale' (G major) (default: chords)",
    )
    parser.add_argument(
        "--steps", type=int, default=8,
        help="Number of next-note predictions to run (default: 8)",
    )
    parser.add_argument(
        "--top-p", type=float, default=0.95,
        help="Nucleus sampling probability (default: 0.95)",
    )
    parser.add_argument(
        "--json-out", default=None,
        help="Optional: save all prediction results to this JSON file",
    )
    main(parser.parse_args())
