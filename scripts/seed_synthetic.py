#!/usr/bin/env python3
"""Generate synthetic trend frames for initial demo deployment."""

import json
import random
from pathlib import Path

# Set seed for reproducibility
random.seed(42)

# Seasons to generate
SEASONS = [
    ("FW23", "fall / winter 2023"),
    ("SS24", "spring / summer 2024"),
    ("FW24", "fall / winter 2024"),
    ("SS25", "spring / summer 2025"),
    ("FW25", "fall / winter 2025"),
    ("SS26", "spring / summer 2026"),
]

# Core trends that persist across multiple seasons
PERSISTENT_TRENDS = {
    "oversized-tailoring": {
        "name": "oversized tailoring",
        "color": "#2c2c3a",
        "base_x": 0.35,
        "base_y": 0.45,
        "base_weight": 0.85,
        "base_reach": 0.90,
        "major_share": 0.85,
        "variance": 0.05,
    },
    "quiet-luxury": {
        "name": "quiet luxury neutrals",
        "color": "#b8a896",
        "base_x": 0.50,
        "base_y": 0.60,
        "base_weight": 0.80,
        "base_reach": 0.95,
        "major_share": 0.92,
        "variance": 0.03,
    },
    "monochrome-black": {
        "name": "monochrome black",
        "color": "#1a1a1a",
        "base_x": 0.25,
        "base_y": 0.35,
        "base_weight": 0.70,
        "base_reach": 0.75,
        "major_share": 0.70,
        "variance": 0.04,
    },
}

# Seasonal trends (appear/fade based on season)
SEASONAL_TRENDS = {
    "butter-yellow": {
        "name": "butter yellow",
        "color": "#ffd86b",
        "base_x": 0.65,
        "base_y": 0.70,
        "ss_weight": 0.75,
        "fw_weight": 0.35,
        "major_share": 0.55,
    },
    "dopamine-brights": {
        "name": "dopamine brights",
        "color": "#ff4d6d",
        "base_x": 0.75,
        "base_y": 0.55,
        "ss_weight": 0.65,
        "fw_weight": 0.40,
        "major_share": 0.48,
    },
}

# Emerging trends (start small, grow over time)
EMERGING_TRENDS = {
    "y2k-metallics": {
        "name": "y2k metallics",
        "color": "#c0c0d8",
        "base_x": 0.80,
        "base_y": 0.40,
        "start_season": 1,  # SS24
        "peak_season": 3,  # FW24
        "major_share": 0.42,
    },
    "utility-technical": {
        "name": "utility technical",
        "color": "#556b2f",
        "base_x": 0.45,
        "base_y": 0.25,
        "start_season": 2,  # FW24
        "peak_season": 5,  # SS26
        "major_share": 0.50,
    },
}

# Fading trends (start high, decline)
FADING_TRENDS = {
    "barbiecore-pink": {
        "name": "barbiecore pink",
        "color": "#ff69b4",
        "base_x": 0.70,
        "base_y": 0.80,
        "start_weight": 0.70,
        "end_season": 2,  # FW24
        "major_share": 0.60,
    },
}


def generate_trend(trend_id, trend_data, season_idx, prev_weight=None):
    """Generate a single trend for a season."""
    trend = {
        "id": trend_id,
        "name": trend_data["name"],
        "color": trend_data["color"],
    }

    # Position with slight variance
    variance = trend_data.get("variance", 0.02)
    trend["x"] = max(0.0, min(1.0, trend_data["base_x"] + random.uniform(-variance, variance)))
    trend["y"] = max(0.0, min(1.0, trend_data["base_y"] + random.uniform(-variance, variance)))

    # Compute weight based on trend type
    if "base_weight" in trend_data:
        # Persistent trend
        weight = trend_data["base_weight"] + random.uniform(-trend_data["variance"], trend_data["variance"])
    elif "ss_weight" in trend_data:
        # Seasonal trend
        is_ss = season_idx % 2 == 1
        weight = trend_data["ss_weight"] if is_ss else trend_data["fw_weight"]
        weight += random.uniform(-0.05, 0.05)
    elif "start_season" in trend_data:
        # Emerging trend
        if season_idx < trend_data["start_season"]:
            weight = 0.0
        elif season_idx == trend_data["start_season"]:
            weight = 0.25
        elif season_idx < trend_data["peak_season"]:
            progress = (season_idx - trend_data["start_season"]) / (trend_data["peak_season"] - trend_data["start_season"])
            weight = 0.25 + progress * 0.55
        else:
            weight = 0.80 + random.uniform(-0.05, 0.05)
    elif "start_weight" in trend_data:
        # Fading trend
        if season_idx > trend_data["end_season"]:
            weight = 0.0
        else:
            decay = season_idx / trend_data["end_season"]
            weight = trend_data["start_weight"] * (1 - decay * 0.7)
    else:
        weight = 0.5

    weight = max(0.0, min(1.0, weight))
    trend["weight"] = round(weight, 3)

    # Reach (prestige-weighted, usually higher for major houses)
    reach_boost = 0.05 if trend_data["major_share"] > 0.7 else -0.05
    trend["reach"] = round(max(0.0, min(1.0, weight + reach_boost + random.uniform(-0.03, 0.03))), 3)

    # Major share
    trend["major_share"] = round(trend_data["major_share"] + random.uniform(-0.05, 0.05), 3)
    trend["major_share"] = max(0.0, min(1.0, trend["major_share"]))

    # Momentum (delta from previous season)
    if prev_weight is not None:
        trend["momentum"] = round(weight - prev_weight, 3)
    else:
        trend["momentum"] = 0.0

    # Look count (proportional to weight)
    base_looks = int(weight * 50)
    trend["look_count"] = max(5, base_looks + random.randint(-5, 10))

    return trend


def generate_frames():
    """Generate all trend frames."""
    frames = []
    prev_weights = {}

    for season_idx, (season, season_long) in enumerate(SEASONS):
        trends = []

        # Persistent trends
        for trend_id, trend_data in PERSISTENT_TRENDS.items():
            prev_weight = prev_weights.get(trend_id)
            trend = generate_trend(trend_id, trend_data, season_idx, prev_weight)
            if trend["weight"] > 0:
                trends.append(trend)
                prev_weights[trend_id] = trend["weight"]

        # Seasonal trends
        for trend_id, trend_data in SEASONAL_TRENDS.items():
            prev_weight = prev_weights.get(trend_id)
            trend = generate_trend(trend_id, trend_data, season_idx, prev_weight)
            if trend["weight"] > 0.2:  # Only include if significant
                trends.append(trend)
                prev_weights[trend_id] = trend["weight"]

        # Emerging trends
        for trend_id, trend_data in EMERGING_TRENDS.items():
            prev_weight = prev_weights.get(trend_id)
            trend = generate_trend(trend_id, trend_data, season_idx, prev_weight)
            if trend["weight"] > 0:
                trends.append(trend)
                prev_weights[trend_id] = trend["weight"]

        # Fading trends
        for trend_id, trend_data in FADING_TRENDS.items():
            prev_weight = prev_weights.get(trend_id)
            trend = generate_trend(trend_id, trend_data, season_idx, prev_weight)
            if trend["weight"] > 0:
                trends.append(trend)
                prev_weights[trend_id] = trend["weight"]

        frame = {
            "season": season,
            "season_long": season_long,
            "trends": trends,
        }
        frames.append(frame)

    return frames


def main():
    """Generate and save synthetic frames."""
    frames = generate_frames()

    output_path = Path(__file__).parent.parent / "data" / "frames.json"
    output_path.parent.mkdir(exist_ok=True)

    with open(output_path, "w") as f:
        json.dump(frames, f, indent=2)

    print(f"✓ Generated {len(frames)} trend frames")
    for frame in frames:
        print(f"  {frame['season']}: {len(frame['trends'])} trends")


if __name__ == "__main__":
    main()
