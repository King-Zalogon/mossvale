#!/usr/bin/env python3
"""Render named follower frames at their in-game size for visual review."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
DIRECTIONS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"]
SPECIES = ["emberkin", "fernling", "duskwing", "brooklet", "hushram", "voltkit", "mushmallow", "frostowl", "pebblit", "bramblebuck", "siltkip", "sunskitter", "sedgegnaw", "petalunge", "cindercurl", "sunsifter", "rillume", "lanternix"]
ROW_ORDER = {
    "emberkin": ["south", "southwest", "east", "northeast", "north", "northwest", "west", "southeast"],
    "fernling": DIRECTIONS,
    "duskwing": DIRECTIONS,
    "brooklet": ["north", "northwest", "west", "southwest", "south", "southeast", "east", "northeast"],
    "hushram": DIRECTIONS,
    "voltkit": DIRECTIONS,
    "mushmallow": DIRECTIONS,
    "frostowl": DIRECTIONS,
    "pebblit": DIRECTIONS,
    "bramblebuck": DIRECTIONS,
    "siltkip": DIRECTIONS,
    "sunskitter": DIRECTIONS,
    "sedgegnaw": DIRECTIONS,
    "petalunge": DIRECTIONS,
    "cindercurl": DIRECTIONS,
    "sunsifter": DIRECTIONS,
    "rillume": DIRECTIONS,
    "lanternix": DIRECTIONS,
}
FRAMES = ["idle", "walk-1", "walk-2", "walk-3", "walk-4"]
CELL, SIZE, GAP, LABEL = 200, 37, 8, 90
PANEL_W = LABEL + len(FRAMES) * (SIZE + GAP) + GAP
PANEL_H = 38 + len(DIRECTIONS) * (SIZE + GAP) + GAP
MARGIN, SPACE = 24, 24
WIDTH = MARGIN * 2 + PANEL_W * 4 + SPACE * 3
ROWS = (len(SPECIES) + 3) // 4
HEIGHT = MARGIN * 2 + PANEL_H * ROWS + SPACE * (ROWS - 1)

def font(size):
    candidate = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    return ImageFont.truetype(str(candidate), size) if candidate.exists() else ImageFont.load_default()

sheet = Image.new("RGBA", (WIDTH, HEIGHT), (24, 37, 31, 255))
draw = ImageDraw.Draw(sheet)
header = font(20); small = font(11); direction_font = font(10)
for index, name in enumerate(SPECIES):
    ox = MARGIN + (index % 4) * (PANEL_W + SPACE)
    oy = MARGIN + (index // 4) * (PANEL_H + SPACE)
    draw.rounded_rectangle((ox, oy, ox + PANEL_W, oy + PANEL_H), radius=10, fill=(43, 59, 50, 255))
    draw.text((ox + 12, oy + 7), name.title(), font=header, fill=(238, 245, 223, 255))
    draw.text((ox + 150, oy + 13), "37 px in-game width", font=small, fill=(202, 216, 190, 255))
    image = Image.open(ROOT / f"dist/assets/creatures/creature-{name}-follower.png").convert("RGBA")
    for row, direction in enumerate(ROW_ORDER[name]):
        y = oy + 38 + row * (SIZE + GAP)
        draw.text((ox + 10, y + 12), direction, font=direction_font, fill=(218, 231, 206, 255))
        for col, frame in enumerate(FRAMES):
            x = ox + LABEL + col * (SIZE + GAP)
            draw.rectangle((x - 2, y - 2, x + SIZE + 2, y + SIZE + 2), fill=(59, 78, 67, 255))
            sprite = image.crop((col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL))
            sprite = sprite.resize((SIZE, SIZE), Image.Resampling.NEAREST)
            sheet.alpha_composite(sprite, (x, y))
            if row == 0:
                draw.text((x + 1, y - 13), frame, font=font(8), fill=(202, 216, 190, 255))
output = ROOT / "art/characters/reviews/creature-follower-contact-sheet.png"
output.parent.mkdir(parents=True, exist_ok=True)
sheet.save(output, optimize=True)
print(f"wrote {output.relative_to(ROOT)} ({WIDTH}x{HEIGHT})")
