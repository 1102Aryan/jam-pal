from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.generate import router as generate_router

app = FastAPI(
    title="Jam Pal API",
    description="Transformer band brain — generates upcoming bars of drum/bass events",
    version="0.1.0",
)

# allow the Vite dev server (and the deployed site) to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://1102aryan.github.io",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(generate_router)


@app.get("/health")
def health():
    return {"status": "ok"}
