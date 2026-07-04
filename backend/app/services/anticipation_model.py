"""Wraps the anticipation transformer: load once, expose predict_steps()."""
import statistics
import torch
from transformers import AutoModelForCausalLM
from anticipation import ops
from anticipation.sample import add_token
from anticipation.config import TIME_RESOLUTION
from anticipation.vocab import TIME_OFFSET, DUR_OFFSET, NOTE_OFFSET, MAX_PITCH, AUTOREGRESS

GUITAR_INSTR = 25
MAX_CTX_TOKENS = 300  # keep rolling context to ~100 events (3 tokens each)


def note_to_tokens(time_sec: float, dur_sec: float, pitch: int, instr: int = GUITAR_INSTR) -> list:
    return [
        TIME_OFFSET + int(TIME_RESOLUTION * time_sec),
        DUR_OFFSET  + int(TIME_RESOLUTION * dur_sec),
        NOTE_OFFSET + instr * MAX_PITCH + pitch,
    ]


def _decode_note(note_tok: int) -> tuple[int, int]:
    raw = note_tok - NOTE_OFFSET
    return raw // MAX_PITCH, raw % MAX_PITCH  # (instr, pitch)


def _estimate_bpm(tokens: list) -> float | None:
    times = sorted(set(tok - TIME_OFFSET for tok in tokens[0::3]))
    if len(times) < 2:
        return None
    iois = [times[i+1] - times[i] for i in range(len(times)-1)
            if times[i+1] - times[i] >= 20]  # 20 ticks ≈ 200 ms — filters strum stagger
    if not iois:
        return None
    beat_sec = statistics.median(iois) / TIME_RESOLUTION
    return round(60.0 / beat_sec, 1) if beat_sec > 0 else None


class AnticipationModel:
    def __init__(self, checkpoint_path: str, device: str | None = None):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.model = AutoModelForCausalLM.from_pretrained(checkpoint_path).to(self.device)
        self.model.eval()

    def _predict_one(self, tokens: list, top_p: float) -> dict:
        current_time = ops.max_time(tokens, seconds=False)
        new_tok = add_token(self.model, [AUTOREGRESS], tokens, top_p, current_time)
        dt_ticks  = max(0, new_tok[0] - TIME_OFFSET - current_time)
        dur_ticks = new_tok[1] - DUR_OFFSET
        instr, pitch = _decode_note(new_tok[2])
        return {
            "pitch":          pitch,
            "instrument":     instr,
            "duration_ms":    round(dur_ticks / TIME_RESOLUTION * 1000, 1),
            "time_offset_ms": round(dt_ticks  / TIME_RESOLUTION * 1000, 1),
            "estimated_bpm":  _estimate_bpm(tokens),
        }

    def predict_steps(self, tokens: list, steps: int = 1, top_p: float = 0.95) -> list[dict]:
        """Run `steps` autoregressive prediction steps from `tokens`."""
        assert len(tokens) % 3 == 0 and len(tokens) >= 3
        ctx = list(tokens)
        results = []
        for _ in range(steps):
            pred = self._predict_one(ctx, top_p)
            results.append(pred)
            last_time = max(tok - TIME_OFFSET for tok in ctx[0::3])
            next_time = last_time + int(pred["time_offset_ms"] / 1000 * TIME_RESOLUTION)
            ctx.extend([
                TIME_OFFSET + next_time,
                DUR_OFFSET  + int(pred["duration_ms"] / 1000 * TIME_RESOLUTION),
                NOTE_OFFSET + pred["instrument"] * MAX_PITCH + pred["pitch"],
            ])
            if len(ctx) > MAX_CTX_TOKENS:
                ctx = ctx[-MAX_CTX_TOKENS:]
        return results
