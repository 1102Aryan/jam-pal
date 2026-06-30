import random

from app.models.schemas import (
    Bar,
    BassEvent,
    DrumEvent,
    GenerateRequest,
    GenerateResponse,
)

# timeSig -> (steps per bar, steps per beat)
METERS = {
    "4/4": (16, 4),
    "3/4": (12, 4),
    "2/4": (8, 4),
    "6/8": (12, 2),
    "12/8": (24, 2),
}


class Generator:
    def generate(self, req: GenerateRequest) -> GenerateResponse:
        raise NotImplementedError


class PlaceholderGenerator(Generator):
    """Simple rule-based groove standing in for the transformer so the
    frontend buffer <-> backend pipeline works end to end. Swap with the model."""

    def generate(self, req: GenerateRequest) -> GenerateResponse:
        steps, spb = METERS.get(req.timeSig, (16, 4))
        beats = steps // spb
        e = max(0.0, min(1.0, req.context.energy))
        return GenerateResponse(bars=[self._bar(steps, spb, beats, e) for _ in range(req.bars)])

    def _bar(self, steps: int, spb: int, beats: int, e: float) -> Bar:
        events = []

        # kick on beat 1 and the middle beat
        for s in {0, (beats // 2) * spb}:
            events.append(DrumEvent(drum="kick", step=s, gain=0.6 + 0.3 * e))

        # snare backbeat on beats 2 and 4 (where they exist)
        for b in range(1, beats, 2):
            events.append(DrumEvent(drum="snare", step=b * spb, gain=0.5 + 0.4 * e))

        # hats on every eighth
        half = max(1, spb // 2)
        for s in range(0, steps, half):
            events.append(DrumEvent(drum="hat", step=s, gain=0.18 + 0.12 * e))

        # a little life: occasional open hat going into the next bar
        if random.random() < 0.3:
            events.append(DrumEvent(drum="openhat", step=steps - half, gain=0.2 + 0.1 * e))

        # bass: root on 1, fifth on the middle beat
        events.append(BassEvent(semi=0, step=0, gain=0.3 + 0.25 * e, sustainBeats=1.0))
        events.append(BassEvent(semi=7, step=(beats // 2) * spb, gain=0.28 + 0.22 * e, sustainBeats=0.8))

        return Bar(events=events)


_generator: Generator = PlaceholderGenerator()


def get_generator() -> Generator:
    return _generator
