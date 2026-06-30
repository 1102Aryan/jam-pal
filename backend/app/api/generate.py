from fastapi import APIRouter

from app.models.schemas import GenerateRequest, GenerateResponse
from app.services.generator import get_generator

router = APIRouter()


@router.post("/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest) -> GenerateResponse:
    return get_generator().generate(req)
