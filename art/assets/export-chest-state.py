#!/usr/bin/env python3
"""Normalize the retained generated empty-chest reference for a stable prop export."""
import argparse
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "art/assets/source/chests/open-empty.generated.png"
OUTPUT = ROOT / "art/assets/source/chests/open-empty.png"

def render():
    image = Image.open(SOURCE).convert("RGBA")
    alpha = image.getchannel("A").point(lambda value: 255 if value >= 32 else 0)
    image.putalpha(alpha)
    image = image.crop(alpha.getbbox())
    height = round(image.height * 337 / image.width)
    image = image.resize((337, height), Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", (343, height + 4))
    canvas.paste(image, (3, 2))
    return canvas

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    image = render()
    if args.check:
        current = Image.open(OUTPUT).convert("RGBA")
        if image.size != current.size or image.tobytes() != current.tobytes():
            raise SystemExit("empty chest source export is stale")
    else:
        image.save(OUTPUT)
    print("verified empty chest source export" if args.check else "exported empty chest source")
