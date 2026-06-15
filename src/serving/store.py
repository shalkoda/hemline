import json
from pathlib import Path
from typing import Any

FRAMES_PATH = Path(__file__).parent.parent.parent / "data" / "frames.json"


def load_frames() -> list[dict[str, Any]]:
    """Load trend frames from JSON file."""
    if not FRAMES_PATH.exists():
        return []

    with open(FRAMES_PATH) as f:
        return json.load(f)
