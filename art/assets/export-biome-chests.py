#!/usr/bin/env python3
"""Prepare generated chest pairs; generic export.py preserves these editable pixels."""
import argparse
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "art/assets/source/chests/biomes"
VARIANTS = ("reed-rope", "sandstone-iron", "pine-frost")

def poses(variant):
    image = Image.open(SOURCE / f"{variant}.generated.png").convert("RGBA")
    for index, state in enumerate(("closed", "open-empty")):
        crop = image.crop((index * image.width // 2, 0, (index + 1) * image.width // 2, image.height))
        # The provider leaves low-alpha fringe/haze. Keep the opaque artwork only.
        alpha = crop.getchannel("A").point(lambda value: 255 if value >= 128 else 0)
        crop.putalpha(alpha)
        crop = crop.crop(alpha.getbbox())
        height = round(crop.height * 337 / crop.width)
        crop = crop.resize((337, height), Image.Resampling.NEAREST)
        canvas = Image.new("RGBA", (343, height + 4))
        # Clear RGB in transparent pixels as well, so image viewers cannot show hidden haze.
        canvas.paste(crop, (3, 2), crop)
        yield SOURCE / f"{variant}-{state}.png", canvas

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    for variant in VARIANTS:
        for path, image in poses(variant):
            if args.check:
                current = Image.open(path).convert("RGBA")
                if current.size != image.size or current.tobytes() != image.tobytes():
                    raise SystemExit(f"stale normalized chest source: {path.name}")
            else:
                image.save(path)
            print(f"{'verified' if args.check else 'prepared'} {path.name} {image.width}x{image.height}")
