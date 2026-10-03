"""Export generated five-state creature sheets with versioned, category-specific settings."""
from argparse import ArgumentParser
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PROFILE_ID = "creature-combat-v1"
PROFILES = json.loads((ROOT / "art/characters/export-profiles.json").read_text())["profiles"]
PROFILE = PROFILES[PROFILE_ID]
GRID = PROFILE["sourceGrid"]
SPECS = {
    "fernling": {"source": "art/characters/source/creature-fernling-combat-generated.png", "target": "dist/assets/creatures/creature-fernling-combat.png"},
    "duskwing": {"source": "art/characters/source/creature-duskwing-combat-generated.png", "target": "dist/assets/creatures/creature-duskwing-combat.png"},
}


def bounds(length, count):
    return [round(i * length / count) for i in range(count + 1)]


def build(spec):
    source = Image.open(ROOT / spec["source"]).convert("RGBA")
    columns, rows = GRID["columns"], GRID["rows"]
    frame_width, frame_height = PROFILE["frameSizes"][Path(spec["source"]).stem.removeprefix("creature-").removesuffix("-combat-generated")]
    xs, ys = bounds(source.width, columns), bounds(source.height, rows)
    segmented = Image.new("RGBA", (columns * frame_width, rows * frame_height), (0, 0, 0, 0))
    anchored = Image.new("RGBA", segmented.size, (0, 0, 0, 0))
    for row in range(rows):
        for column in range(columns):
            cell = source.crop((xs[column], ys[row], xs[column + 1], ys[row + 1]))
            if cell.width > frame_width or cell.height > frame_height:
                raise ValueError(f"source cell {column},{row} exceeds its exported frame")
            x = (frame_width - cell.width) // 2
            segmented.alpha_composite(cell, (column * frame_width + x, row * frame_height))
            opaque = cell.getchannel("A").point(lambda value: 255 if value > PROFILE["alphaThreshold"] else 0).getbbox()
            if opaque is None:
                raise ValueError(f"source cell {column},{row} is fully transparent")
            y = frame_height - PROFILE["footInset"] - opaque[3]
            if y + opaque[1] < 0:
                raise ValueError(f"source cell {column},{row} cannot fit at the common ground anchor")
            anchored.alpha_composite(cell, (column * frame_width + x, row * frame_height + y))
    return segmented, anchored


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify outputs without writing them")
    parser.add_argument("--preview-dir", type=Path, help="write segmented-cell and anchored-stage sheets here")
    args = parser.parse_args()
    for name, spec in SPECS.items():
        segmented, anchored = build(spec)
        target = ROOT / spec["target"]
        target.parent.mkdir(parents=True, exist_ok=True)
        current = None
        if target.exists():
            current = Image.open(target).convert("RGBA")
        same = current is not None and current.size == anchored.size and current.tobytes() == anchored.tobytes()
        if args.check and not same:
            raise SystemExit(f"{spec['target']} does not match profile {PROFILE_ID}; inspect preview stages before exporting")
        if not args.check and not same:
            temporary = target.with_suffix(".png.tmp")
            anchored.save(temporary, format="PNG", optimize=True)
            temporary.replace(target)
        if args.preview_dir:
            args.preview_dir.mkdir(parents=True, exist_ok=True)
            segmented.save(args.preview_dir / f"{name}-segmented.png", optimize=True)
            anchored.save(args.preview_dir / f"{name}-anchored.png", optimize=True)
        print(f"{'verified' if args.check else 'exported'} {spec['target']} via {PROFILE_ID} ({anchored.width}x{anchored.height})")


if __name__ == "__main__":
    main()
