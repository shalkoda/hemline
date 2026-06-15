from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field


class Designer(BaseModel):
    """Fashion designer or house with tier and prestige."""
    name: str
    tier: Literal["major", "emerging"]
    prestige: float = Field(ge=0.0, le=1.0, description="Prestige score 0-1")


class Look(BaseModel):
    """A single runway or street-style look."""
    look_id: str
    source: str
    designer: str
    city: str
    season: str
    image_url: str
    captured_at: datetime
    tier: str  # denormalized from designer


class EmbeddingRow(BaseModel):
    """Precomputed embedding and visual features for a look."""
    look_id: str
    vector: list[float]
    palette: list[str] = Field(description="Hex color palette")
    dominant_color: str = Field(description="Dominant hex color")
    silhouette_tags: list[str] = Field(default_factory=list)


class Trend(BaseModel):
    """A cluster of visually similar looks, with computed signals."""
    id: str = Field(description="Stable ID across seasons")
    name: str
    color: str = Field(description="Hex color")
    x: float = Field(ge=0.0, le=1.0, description="UMAP x coordinate, normalized")
    y: float = Field(ge=0.0, le=1.0, description="UMAP y coordinate, normalized")
    weight: float = Field(ge=0.0, le=1.0, description="Adoption: cluster mass")
    reach: float = Field(ge=0.0, le=1.0, description="Prestige-weighted mass")
    major_share: float = Field(ge=0.0, le=1.0, description="Fraction from major houses")
    momentum: float = Field(description="Change in weight vs previous season")
    look_count: int = Field(ge=0, description="Number of looks in cluster")


class TrendFrame(BaseModel):
    """All trends for a single season."""
    season: str = Field(description="Short season code, e.g. SS26")
    season_long: str = Field(description="Human-readable season, e.g. spring / summer 2026")
    trends: list[Trend]
