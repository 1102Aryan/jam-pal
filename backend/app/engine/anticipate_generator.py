import random

from app.models.schemas import Bar, BassEvent, DrumEvent, GenerateRequest, GenerateResponse

METERS = {
    "4/4":  (16, 4),
    "3/4":  (12, 4),
    "2/4":  (8, 4),
    "6/8":  (12, 2),
    "12/8": (24, 2),
}

# BPM thresholds that determine groove style
BPM_SLOW = 85   # below → ballad feel
BPM_FAST = 115  # above → driving feel

# Kick step-offset patterns per groove style and tier (for 16-step / 4/4 bars).
# More patterns per tier = more bar-to-bar variation.
KICK_PATTERNS_4_4 = {
    "slow": {
        0: [[0]],
        1: [[0, 8], [0, 8]],
        2: [[0, 8, 12], [0, 6, 8]],
    },
    "mid": {
        0: [[0, 8]],
        1: [[0, 6, 8], [0, 8, 10]],
        2: [[0, 6, 8, 10], [0, 4, 8, 14]],
    },
    "fast": {
        0: [[0, 8]],
        1: [[0, 6, 8, 14], [0, 8, 10, 14]],
        2: [[0, 4, 8, 12], [0, 2, 8, 12]],   # four-on-the-floor variants
    },
}

# Hat step offsets per groove style and tier (16-step bars)
HAT_PATTERNS_4_4 = {
    "slow": {
        0: [0, 8],                              # quarter notes
        1: [0, 4, 8, 12],                       # quarter notes
        2: [0, 4, 8, 12],
    },
    "mid": {
        0: [0, 4, 8, 12],                       # quarter notes
        1: [0, 2, 4, 6, 8, 10, 12, 14],         # eighth notes
        2: [0, 2, 4, 6, 8, 10, 12, 14],
    },
    "fast": {
        0: [0, 4, 8, 12],
        1: [0, 2, 4, 6, 8, 10, 12, 14],
        2: list(range(16)),                      # 16th notes — full drive
    },
}


def _groove_style(bpm: float | None) -> str:
    if bpm is None:
        return "mid"
    if bpm < BPM_SLOW:
        return "slow"
    if bpm > BPM_FAST:
        return "fast"
    return "mid"


def _is_minor(recent_chords: list[str]) -> bool:
    """True when the most recent chord is minor (label ends with 'm')."""
    if not recent_chords:
        return False
    return recent_chords[-1].endswith("m")


class AnticipateGenerator:

    def generate(self, req: GenerateRequest) -> GenerateResponse:
        steps, spb = METERS.get(req.timeSig, (16, 4))
        beats = steps // spb
        e = max(0.0, min(1.0, req.context.energy))

        style = _groove_style(req.context.estimatedBpm)
        minor = _is_minor(req.context.recentChords)

        # low energy gates the tier downward
        tier = req.context.tier
        if e < 0.15:
            tier = 0
        elif e < 0.45 and tier > 1:
            tier = 1
        tier = max(0, min(2, tier))

        return GenerateResponse(
            bars=[self._bar(steps, spb, beats, e, style, tier, minor) for _ in range(req.bars)]
        )

    def _bar(self, steps: int, spb: int, beats: int, e: float,
             style: str, tier: int, minor: bool) -> Bar:
        events: list = []
        rng = random.Random()

        # kick — picked from the style+tier pool
        if steps == 16:
            pool = KICK_PATTERNS_4_4.get(style, KICK_PATTERNS_4_4["mid"])[tier]
            kick_steps = rng.choice(pool)
        else:
            # non-4/4: simple fallback — beat 1 and midpoint
            kick_steps = [0, steps // 2]
        for s in kick_steps:
            events.append(DrumEvent(drum="kick", step=s, gain=round(0.55 + 0.35 * e, 3)))

        # snare backbeat
        for b in range(1, beats, 2):
            events.append(DrumEvent(drum="snare", step=b * spb, gain=round(0.45 + 0.45 * e, 3)))

        # hats — style+tier driven
        if steps == 16:
            hat_steps = HAT_PATTERNS_4_4.get(style, HAT_PATTERNS_4_4["mid"])[tier]
        else:
            hat_steps = list(range(0, steps, max(1, spb // 2)))
        for s in hat_steps:
            events.append(DrumEvent(drum="hat", step=s, gain=round(0.14 + 0.12 * e, 3)))

        # open hat at bar end (tier 1+ only)
        if tier >= 1 and rng.random() < (0.2 + 0.15 * tier):
            half = max(1, spb // 2)
            events.append(DrumEvent(drum="openhat", step=steps - half, gain=round(0.18 + 0.10 * e, 3)))

        # bass — chord-quality-aware intervals
        mid = (beats // 2) * spb
        g = round(0.28 + 0.28 * e, 3)
        third = 3 if minor else 4          # minor 3rd vs major 3rd

        if tier == 0:
            events.append(BassEvent(semi=0, step=0, gain=g, sustainBeats=1.5))
        elif tier == 1:
            events.append(BassEvent(semi=0,  step=0,   gain=g,                sustainBeats=1.0))
            events.append(BassEvent(semi=7,  step=mid, gain=round(g*0.9, 3),  sustainBeats=0.8))
        else:
            events.append(BassEvent(semi=0,      step=0,               gain=g,               sustainBeats=1.0))
            events.append(BassEvent(semi=7,      step=mid,             gain=round(g*0.9, 3), sustainBeats=0.8))
            if beats >= 4:
                # approach tone: leading into the next bar using the chord's third
                events.append(BassEvent(semi=third, step=(beats-1)*spb, gain=round(g*0.7, 3), sustainBeats=0.5))

        return Bar(events=events)


_generator = AnticipateGenerator()


def get_generator() -> AnticipateGenerator:
    return _generator
