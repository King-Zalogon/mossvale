"""Create deterministic non-runtime fixtures for the visual review rubric."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "art/characters/reviews/fixtures"
OUT.mkdir(parents=True, exist_ok=True)
reference = Image.open(ROOT / "dist/assets/creatures/creature-fernling.png").convert("RGBA")

# A technically valid but obvious palette/identity drift negative.
hsv = reference.convert("HSV")
pixels = list(hsv.get_flattened_data())
hsv.putdata([((h + 88) % 256, s, v) if s > 20 else (h, s, v) for h, s, v in pixels])
hsv.convert("RGBA").save(OUT / "identity-drift.png", optimize=True)

# A technically valid anatomy negative: extra jointed limbs and paws added to the canonical silhouette.
wrong = reference.copy()
draw = ImageDraw.Draw(wrong)
for points in ([(68, 187), (43, 186), (26, 202)], [(179, 185), (205, 189), (221, 204)]):
    draw.line(points, fill=(80, 143, 38, 255), width=10)
    x, y = points[-1]
    draw.ellipse((x - 6, y - 2, x + 10, y + 10), fill=(63, 46, 26, 255))
wrong.save(OUT / "wrong-anatomy.png", optimize=True)

# A valid facing change taken from the red-cap player's NE idle cell.
player = Image.open(ROOT / "dist/assets/people/person-red-cap-motion.png").convert("RGBA")
player.crop((0, 256, 160, 512)).save(OUT / "valid-turned-pose.png", optimize=True)
