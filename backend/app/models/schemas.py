from typing import List, Literal, Union

from pydantic import BaseModel, Field


class Context(BaseModel):
    energy: float = 0.5
    playerOnsets: int = 4
    recentChords: List[str] = Field(default_factory=list)
    tier: int = 1


class GenerateRequest(BaseModel):
    genre: str = "rock"
    timeSig: str = "4/4"
    bars: int = Field(default=2, ge=1, le=8)
    context: Context = Field(default_factory=Context)


class DrumEvent(BaseModel):
    kind: Literal["drum"] = "drum"
    drum: str
    step: int
    gain: float
    dt: float = 0.0


class BassEvent(BaseModel):
    kind: Literal["bass"] = "bass"
    semi: Union[int, str]          # semitones from the chord root, or "third"
    step: int
    gain: float
    sustainBeats: float = 1.0      # note length in beats; client multiplies by beatSec
    dt: float = 0.0
    slide: bool = False


Event = Union[DrumEvent, BassEvent]


class Bar(BaseModel):
    events: List[Event]


class GenerateResponse(BaseModel):
    bars: List[Bar]
