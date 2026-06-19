#!/usr/bin/env python3
"""
Scraper for Vogue Runway fashion show images.

Usage:
    python scripts/scrape_runway.py --seasons SS2023,FW2023,SS2024 --designers-file data/scrape_targets.csv
"""

import argparse
import csv
import time
from pathlib import Path
from datetime import datetime
from typing import List, Dict
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin


class VogueRunwayScraper:
    """Scrapes runway looks from Vogue Runway."""

    BASE_URL = "https://www.vogue.com"
    HEADERS = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    }

    def __init__(self, output_dir: Path, delay: float = 2.0):
        """
        Initialize scraper.

        Args:
            output_dir: Directory to save images
            delay: Delay between requests in seconds (be respectful!)
        """
        self.output_dir = output_dir
        self.delay = delay
        self.session = requests.Session()
        self.session.headers.update(self.HEADERS)

    def scrape_show(
        self,
        designer: str,
        season: str,
        city: str,
        max_looks: int = 10
    ) -> List[Dict]:
        """
        Scrape looks from a single show.

        Args:
            designer: Designer name (e.g., "dior")
            season: Season code (e.g., "spring-2024")
            city: City code (e.g., "paris")
            max_looks: Maximum number of looks to scrape

        Returns:
            List of look dictionaries with metadata
        """
        # Construct show URL
        slug = designer.lower().replace(" ", "-")
        season_slug = self._format_season(season)
        city_slug = city.lower()

        url = f"{self.BASE_URL}/fashion-shows/{season_slug}/{city_slug}/{slug}"

        print(f"Scraping: {designer} {season} {city}")
        print(f"URL: {url}")

        try:
            response = self.session.get(url)
            response.raise_for_status()
        except requests.RequestException as e:
            print(f"Failed to fetch {url}: {e}")
            return []

        soup = BeautifulSoup(response.content, 'html.parser')
        looks = []

        # Find look images (this selector may need adjustment based on Vogue's current HTML)
        # NOTE: Vogue Runway's structure changes frequently - may need inspection
        gallery_items = soup.find_all('div', class_='gallery-slide')

        if not gallery_items:
            # Try alternative selector
            gallery_items = soup.find_all('picture')

        for idx, item in enumerate(gallery_items[:max_looks]):
            # Extract image URL
            img = item.find('img')
            if not img or not img.get('src'):
                continue

            image_url = img['src']
            if not image_url.startswith('http'):
                image_url = urljoin(self.BASE_URL, image_url)

            # Generate look ID
            look_id = f"{slug}-{season.replace(' ', '').lower()}-{idx + 1:03d}"

            look_data = {
                'look_id': look_id,
                'designer': designer,
                'season': season,
                'city': city,
                'look_number': idx + 1,
                'image_url': image_url,
                'captured_at': datetime.utcnow().isoformat(),
                'source': 'vogue_runway'
            }

            looks.append(look_data)

            # Download image
            self._download_image(image_url, look_id, season, designer)

            time.sleep(0.5)  # Small delay between images

        print(f"  → Scraped {len(looks)} looks")

        time.sleep(self.delay)  # Respectful delay between shows
        return looks

    def _download_image(self, url: str, look_id: str, season: str, designer: str):
        """Download and save image."""
        season_dir = self.output_dir / season
        designer_dir = season_dir / designer.lower().replace(" ", "_")
        designer_dir.mkdir(parents=True, exist_ok=True)

        filepath = designer_dir / f"{look_id}.jpg"

        if filepath.exists():
            print(f"  Skipping {look_id} (already exists)")
            return

        try:
            response = self.session.get(url, timeout=10)
            response.raise_for_status()

            with open(filepath, 'wb') as f:
                f.write(response.content)

            print(f"  Downloaded: {filepath}")
        except Exception as e:
            print(f"  Failed to download {url}: {e}")

    @staticmethod
    def _format_season(season: str) -> str:
        """Convert season code to Vogue URL format."""
        # SS2024 → spring-2024
        # FW2024 → fall-2024
        season = season.upper()
        if season.startswith('SS'):
            return f"spring-{season[2:]}"
        elif season.startswith('FW'):
            return f"fall-{season[2:]}"
        else:
            return season.lower()


def load_scrape_targets(filepath: Path) -> List[Dict]:
    """Load designer/season targets from CSV."""
    targets = []
    with open(filepath) as f:
        reader = csv.DictReader(f)
        for row in reader:
            targets.append(row)
    return targets


def save_manifest(looks: List[Dict], output_path: Path):
    """Save looks manifest to CSV."""
    if not looks:
        print("No looks to save")
        return

    fieldnames = ['look_id', 'source', 'designer', 'city', 'season',
                  'look_number', 'image_url', 'captured_at']

    with open(output_path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(looks)

    print(f"\nSaved manifest: {output_path}")
    print(f"Total looks: {len(looks)}")


def main():
    parser = argparse.ArgumentParser(description="Scrape runway images from Vogue")
    parser.add_argument('--targets', type=Path, default='data/scrape_targets.csv',
                        help='CSV file with designer/season targets')
    parser.add_argument('--output-dir', type=Path, default='data/images',
                        help='Directory to save images')
    parser.add_argument('--manifest', type=Path, default='data/looks_manifest.csv',
                        help='Output manifest CSV path')
    parser.add_argument('--delay', type=float, default=2.0,
                        help='Delay between requests (seconds)')

    args = parser.parse_args()

    # Load targets
    if not args.targets.exists():
        print(f"Error: Targets file not found: {args.targets}")
        print("Create data/scrape_targets.csv with columns: designer,season,city")
        return

    targets = load_scrape_targets(args.targets)
    print(f"Loaded {len(targets)} scrape targets")

    # Initialize scraper
    scraper = VogueRunwayScraper(args.output_dir, delay=args.delay)

    # Scrape all targets
    all_looks = []
    for target in targets:
        looks = scraper.scrape_show(
            designer=target['designer'],
            season=target['season'],
            city=target['city'],
            max_looks=int(target.get('max_looks', 10))
        )
        all_looks.extend(looks)

    # Save manifest
    save_manifest(all_looks, args.manifest)


if __name__ == '__main__':
    main()
