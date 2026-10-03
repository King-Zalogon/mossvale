"""Export generated five-state creature sheets into strict transparent frame grids."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SPECS = {
    "fernling": {"source": "art/characters/source/creature-fernling-combat-generated.png", "target": "dist/assets/creatures/creature-fernling-combat.png", "columns": 4, "rows": 5, "frame": (288, 288)},
    "duskwing": {"source": "art/characters/source/creature-duskwing-combat-generated.png", "target": "dist/assets/creatures/creature-duskwing-combat.png", "columns": 4, "rows": 5, "frame": (281, 281)},
}


def bounds(length, count):
    return [round(i * length / count) for i in range(count + 1)]


for spec in SPECS.values():
    source = Image.open(ROOT / spec["source"]).convert("RGBA")
    columns, rows = spec["columns"], spec["rows"]
    frame_width, frame_height = spec["frame"]
    xs, ys = bounds(source.width, columns), bounds(source.height, rows)
    sheet = Image.new("RGBA", (columns * frame_width, rows * frame_height), (0, 0, 0, 0))
    for row in range(rows):
        for column in range(columns):
            cell = source.crop((xs[column], ys[row], xs[column + 1], ys[row + 1]))
            if cell.width > frame_width or cell.height > frame_height:
                raise ValueError(f"source cell {column},{row} exceeds its exported frame")
            x = (frame_width - cell.width) // 2
            # Match the manifest validator's visible-alpha threshold while preserving every source pixel.
            opaque = cell.getchannel("A").point(lambda value: 255 if value > 8 else 0).getbbox()
            if opaque is None:
                raise ValueError(f"source cell {column},{row} is fully transparent")
            # The generated art varies its empty top/bottom padding by pose. Shift the whole
            # unchanged cell so its lowest visible pixel shares the fixed ground anchor.
            y = frame_height - 4 - opaque[3]
            if y + opaque[1] < 0:
                raise ValueError(f"source cell {column},{row} cannot fit at the common ground anchor")
            sheet.alpha_composite(cell, (column * frame_width + x, row * frame_height + y))
    target = ROOT / spec["target"]
    target.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(target, optimize=True)
    print(f"exported {target.relative_to(ROOT)} ({sheet.width}x{sheet.height})")
