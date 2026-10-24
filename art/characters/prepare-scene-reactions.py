"""Normalize generated scene-reaction sources to the shared 160x256 anchor."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).parent / "source" / "scene-reactions"
OUTPUT = Path(__file__).parents[2] / "dist" / "assets" / "people"


for pose in ("notice", "surprise", "happy"):
    image = Image.open(ROOT / f"{pose}-generated.png").convert("RGBA")
    # Generated previews can retain a nearly transparent matte around the
    # subject. Remove only that fringe; preserve antialiased pixels above the
    # threshold and the source's actual silhouette.
    alpha = image.getchannel("A").point(lambda value: 0 if value < 32 else value)
    image.putalpha(alpha)
    crop = image.crop(image.getbbox())
    scaled = crop.resize((round(crop.width * 256 / crop.height), 256), Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", (160, 256))
    canvas.paste(scaled, ((160 - scaled.width) // 2, 0), scaled)
    canvas.save(OUTPUT / f"person-scene-reaction-{pose}.png")
