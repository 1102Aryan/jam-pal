from fastapi import APIRouter, HTTPException, Request

from app.models.anticipation_schemas import AnticipateRequest, AnticipateResponse, Prediction
from app.services.anticipation_model import AnticipationModel, note_to_tokens
from anticipation import ops

router = APIRouter()


@router.post("/anticipate", response_model=AnticipateResponse)
def anticipate(req: AnticipateRequest, request: Request) -> AnticipateResponse:
    model: AnticipationModel | None = getattr(request.app.state, "model", None)
    if model is None:
        raise HTTPException(503, "Model not loaded — check checkpoint path on startup")

    tokens = []
    for note in req.recent_notes:
        tokens.extend(note_to_tokens(note.time_sec, note.dur_sec, note.pitch, note.instr))
    tokens = ops.sort(tokens)

    preds = model.predict_steps(tokens, steps=req.steps, top_p=req.top_p)
    return AnticipateResponse(predictions=[Prediction(**p) for p in preds])
