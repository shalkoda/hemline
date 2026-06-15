from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path

from .store import load_frames

app = FastAPI(title="hemline", description="Runway trend pipeline API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}


@app.get("/api/frames")
async def get_frames():
    """Return all trend frames."""
    return load_frames()


@app.post("/api/recompute")
async def recompute():
    """Rebuild frames from embeddings (Day 2 feature)."""
    return {"status": "not implemented", "message": "Recompute available in Day 2"}


# Mount frontend static files
frontend_path = Path(__file__).parent.parent.parent / "frontend"
if frontend_path.exists():
    app.mount("/", StaticFiles(directory=str(frontend_path), html=True), name="frontend")
