import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.generate import router as generate_router
from app.api.anticipate import router as anticipate_router
from app.services.anticipation_model import AnticipationModel

LOCAL_CHECKPOINT = os.path.join(os.path.dirname(__file__), "checkpoint-25500")
HF_CHECKPOINT = "1102Aryan/jam-pal-model"


@asynccontextmanager
async def lifespan(app: FastAPI):
    checkpoint = LOCAL_CHECKPOINT if os.path.isdir(LOCAL_CHECKPOINT) else HF_CHECKPOINT
    print(f"Loading model from {checkpoint} ...")
    try:
        app.state.model = AnticipationModel(checkpoint)
        print("Model ready.")
    except Exception as exc:
        print(f"WARNING: failed to load model from {checkpoint} ({exc}), /anticipate will return 503")
        app.state.model = None
    yield
    app.state.model = None


app = FastAPI(
    title="Jam Pal API",
    description="Transformer band brain — generates upcoming bars of drum/bass events",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://1102aryan.github.io",
        "https://jam-pal.co.uk",
        "https://www.jam-pal.co.uk",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(generate_router)
app.include_router(anticipate_router)


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": app.state.model is not None}
