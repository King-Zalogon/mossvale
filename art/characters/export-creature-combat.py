"""Export generated five-state creature sheets with versioned, category-specific settings."""
from argparse import ArgumentParser
from html import escape
import json
from pathlib import Path
from shutil import copyfile
from PIL import Image

DEFAULT_ROOT = Path(__file__).resolve().parents[2]
PROFILE_ID = "creature-combat-v1"
SPECS = {
    "fernling": {"source": "art/characters/source/creature-fernling-combat-generated.png", "target": "dist/assets/creatures/creature-fernling-combat.png"},
    "duskwing": {"source": "art/characters/source/creature-duskwing-combat-generated.png", "target": "dist/assets/creatures/creature-duskwing-combat.png"},
}


def bounds(length, count):
    return [round(i * length / count) for i in range(count + 1)]


def build(root, profile, spec, name):
    source_path = root / spec["source"]
    with Image.open(source_path) as original:
        source = original.convert("RGBA")
    grid = profile["sourceGrid"]
    columns, rows = grid["columns"], grid["rows"]
    frame_width, frame_height = profile["frameSizes"][name]
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
            opaque = cell.getchannel("A").point(lambda value: 255 if value > profile["alphaThreshold"] else 0).getbbox()
            if opaque is None:
                raise ValueError(f"source cell {column},{row} is fully transparent")
            y = frame_height - profile["footInset"] - opaque[3]
            if y + opaque[1] < 0:
                raise ValueError(f"source cell {column},{row} cannot fit at the common ground anchor")
            anchored.alpha_composite(cell, (column * frame_width + x, row * frame_height + y))
    return segmented, anchored


def write_preview(root, preview_dir, profile, prepared):
    preview_dir = preview_dir if preview_dir.is_absolute() else root / preview_dir
    preview_dir.mkdir(parents=True, exist_ok=True)
    cards = []
    for name, spec, target, segmented, anchored, _same in prepared:
        raw_name = f"{name}-raw.png"
        segmented_name = f"{name}-segmented.png"
        anchored_name = f"{name}-anchored.png"
        runtime_name = f"{name}-runtime.png"
        copyfile(root / spec["source"], preview_dir / raw_name)
        segmented.save(preview_dir / segmented_name, optimize=True)
        anchored.save(preview_dir / anchored_name, optimize=True)
        if target.is_file():
            copyfile(target, preview_dir / runtime_name)
        else:
            anchored.save(preview_dir / runtime_name, optimize=True)
        stages = [
            ("Raw source", raw_name),
            ("Segmented cells", segmented_name),
            ("Anchored candidate", anchored_name),
            ("Runtime output", runtime_name),
        ]
        figures = "".join(
            f'<figure><figcaption>{escape(label)}</figcaption><img src="{escape(filename)}" alt="{escape(name)} {escape(label)}"></figure>'
            for label, filename in stages
        )
        cards.append(f"<section><h2>{escape(name)}</h2><div class=\"stages\">{figures}</div></section>")
    body = "\n".join(cards)
    page = (
        "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        "<title>Creature combat export stages</title><style>body{font:14px system-ui;margin:2rem;background:#17202a;color:#f5f5f5}"
        "section{margin:2rem 0}h2{color:#bfe8c8}.stages{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1rem}"
        "figure{margin:0;padding:.75rem;background:#263442;border-radius:.5rem}figcaption{margin-bottom:.5rem}"
        "img{max-width:100%;height:auto;image-rendering:pixelated;background:repeating-conic-gradient(#777 0% 25%,#aaa 0% 50%) 50%/16px 16px}</style>"
        f"<h1>Creature combat export stages</h1><p>Profile {escape(PROFILE_ID)}; resampling: {escape(str(profile.get('resampling', 'unspecified')))}."
        " Inspect the raw, segmented, anchored and runtime files side by side.</p>"
        f"{body}</html>"
    )
    (preview_dir / "index.html").write_text(page, encoding="utf-8")


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify outputs without writing them")
    parser.add_argument("--preview-dir", type=Path, help="write raw, segmented, anchored and runtime stages here")
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT, help="repository root for isolated exports")
    args = parser.parse_args()
    root = args.root.resolve()
    profiles = json.loads((root / "art/characters/export-profiles.json").read_text())["profiles"]
    profile = profiles[PROFILE_ID]
    if profile.get("status", "implemented") != "implemented":
        raise SystemExit(f"profile {PROFILE_ID} is not available for export")

    # Build and validate every input before creating a directory or touching runtime outputs.
    prepared = []
    mismatches = []
    for name, spec in SPECS.items():
        segmented, anchored = build(root, profile, spec, name)
        target = root / spec["target"]
        current = None
        if target.exists():
            with Image.open(target) as existing:
                current = existing.convert("RGBA")
        same = current is not None and current.size == anchored.size and current.tobytes() == anchored.tobytes()
        if args.check and not same:
            mismatches.append(f"{spec['target']} does not match profile {PROFILE_ID}")
        prepared.append((name, spec, target, segmented, anchored, same))

    if not args.check:
        staged = []
        try:
            for name, spec, target, _segmented, anchored, same in prepared:
                if same:
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                temporary = target.with_suffix(".png.tmp")
                anchored.save(temporary, format="PNG", optimize=True)
                staged.append((temporary, target))
            for temporary, target in staged:
                temporary.replace(target)
        finally:
            for temporary, _target in staged:
                temporary.unlink(missing_ok=True)

    if args.preview_dir:
        write_preview(root, args.preview_dir, profile, prepared)
    if mismatches:
        raise SystemExit("; ".join(mismatches) + ("; review preview stages before exporting" if args.preview_dir else "; pass --preview-dir to inspect the candidate"))

    for _name, spec, _target, _segmented, anchored, _same in prepared:
        print(f"{'verified' if args.check else 'exported'} {spec['target']} via {PROFILE_ID} ({anchored.width}x{anchored.height})")


if __name__ == "__main__":
    main()
