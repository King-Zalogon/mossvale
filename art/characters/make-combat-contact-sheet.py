"""Render a deterministic combat-art contact sheet at battle scale."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SPECIES = ["fernling", "emberkin", "duskwing", "brooklet", "hushram", "voltkit", "mushmallow", "frostowl", "pebblit", "bramblebuck", "siltkip", "sunskitter", "sedgegnaw", "petalunge", "cindercurl", "sunsifter", "rillume"]
STATES = ["idle", "attack", "hit", "faint", "capture"]
OUT = ROOT / "art/characters/reviews/creature-combat-contact-sheet.png"
CARD_W, CARD_H = 730, 950
SHEET_W = 2 * CARD_W + 36
SHEET_H = 56 + ((len(SPECIES) + 1) // 2) * (CARD_H + 12)
BG = "#17392f"
CARD = "#20473a"
PANEL = "#102d26"
TEXT = "#edf3da"
MUTED = "#b8c8ae"
CELL = 112


def main():
    sheet = Image.new("RGB", (SHEET_W, SHEET_H), BG)
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    draw.text((28, 20), "Creature combat frames · 115 px battle width", fill=TEXT, font=font)
    for index, name in enumerate(SPECIES):
        col, row = index % 2, index // 2
        x, y = 12 + col * (CARD_W + 12), 52 + row * (CARD_H + 12)
        draw.rounded_rectangle((x, y, x + CARD_W, y + CARD_H), radius=16, fill=CARD, outline="#527463", width=2)
        draw.text((x + 16, y + 14), name.title(), fill=TEXT, font=font)
        portrait_path = ROOT / f"dist/assets/creatures/creature-{name}.png"
        with Image.open(portrait_path) as portrait:
            portrait = portrait.convert("RGBA")
        scale = 115 / portrait.width
        portrait = portrait.resize((115, max(1, round(portrait.height * scale))), Image.Resampling.NEAREST)
        draw.rounded_rectangle((x + 16, y + 42, x + CARD_W - 16, y + 174), radius=8, fill=PANEL)
        sheet.paste(portrait, (x + 24, y + 50), portrait)
        draw.text((x + 158, y + 94), "Canonical reference · 115 px", fill=MUTED, font=font)
        atlas_path = ROOT / f"dist/assets/creatures/creature-{name}-combat.png"
        with Image.open(atlas_path) as atlas:
            atlas = atlas.convert("RGBA")
        for state_row, state in enumerate(STATES):
            sy = y + 192 + state_row * 148
            draw.text((x + 16, sy + 45), state.title(), fill=TEXT, font=font)
            for frame in range(4):
                sx = x + 142 + frame * 136
                draw.rounded_rectangle((sx, sy, sx + CELL, sy + 136), radius=8, fill=PANEL)
                from json import loads
                profile = loads((ROOT / "art/characters/export-profiles.json").read_text())["profiles"]["creature-combat-v1"]
                frame_width, frame_height = profile["frameSizes"][name]
                crop = atlas.crop((frame * frame_width, state_row * frame_height, (frame + 1) * frame_width, (state_row + 1) * frame_height))
                display_height = max(1, round(CELL * frame_height / frame_width))
                crop = crop.resize((CELL, display_height), Image.Resampling.NEAREST)
                sheet.paste(crop, (sx, sy + 8 + CELL - display_height), crop)
                label = str(frame + 1)
                draw.text((sx + CELL // 2 - 2, sy + 122), label, fill=MUTED, font=font)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    indexed = sheet.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    indexed.save(OUT, optimize=True)
    print(f"wrote {OUT.relative_to(ROOT)} ({sheet.width}x{sheet.height})")


if __name__ == "__main__":
    main()
