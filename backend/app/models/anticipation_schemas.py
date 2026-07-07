from typing import List, Optional
from pydantic import BaseModel, Field


class NoteEvent(BaseModel):
    time_sec: float
    dur_sec: float
    pitch: int
    instr: int = 25  # MIDI program; 25 = Acoustic Guitar Steel


class AnticipateRequest(BaseModel):
    recent_notes: List[NoteEvent] = Field(min_length=1)
    steps: int = Field(default=4, ge=1, le=16)
    top_p: float = Field(default=0.95, ge=0.0, le=1.0)


class Prediction(BaseModel):
    pitch: int
    instrument: int
    duration_ms: float
    time_offset_ms: float
    estimated_bpm: Optional[float] = None


class AnticipateResponse(BaseModel):
    predictions: List[Prediction]
