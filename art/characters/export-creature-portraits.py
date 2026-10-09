"""Normalize generated creature portraits, then export tight, bottom-anchored RGBA sprites."""
from argparse import ArgumentParser
from html import escape
from io import BytesIO
import json
from pathlib import Path
from PIL import Image
try:
    from source_archive import source_bytes
except ModuleNotFoundError:
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from source_archive import source_bytes

ROOT = Path(__file__).resolve().parents[2]
PROFILE_ID = "creature-portrait-compact-v1"
FRAME = (288, 288)
MAX_SPRITE = (264, 264)
ALPHA_THRESHOLD = 8
FOOT_Y = 284
GUTTER = 16
SPECS = {
    "sedgegnaw": {
        "source": "art/characters/source/creature-sedgegnaw-portrait-generated.png",
        "target": "dist/assets/creatures/creature-sedgegnaw.png",
    },
    "petalunge": {
        "source": "art/characters/source/creature-petalunge-portrait-generated.png",
        "target": "dist/assets/creatures/creature-petalunge.png",
    },
    "cindercurl": {
        "source": "art/characters/source/creature-cindercurl-portrait-generated.png",
        "target": "dist/assets/creatures/creature-cindercurl.png",
    },
    "sunsifter": {
        "source": "art/characters/source/creature-sunsifter-portrait-generated.png",
        "target": "dist/assets/creatures/creature-sunsifter.png",
    },
    "rillume": {
        "source": "art/characters/source/creature-rillume-portrait-generated.png",
        "target": "dist/assets/creatures/creature-rillume.png",
    },
}
ATLAS = "art/assets/source/creature-additions-atlas.png"


def build(root, spec):
    with Image.open(BytesIO(source_bytes(root, spec["source"]))) as opened:
        source = opened.convert("RGBA")
    alpha = source.getchannel("A").point(lambda value: value if value > ALPHA_THRESHOLD else 0)
    source.putalpha(alpha)
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError(f"{spec['source']} has no opaque portrait pixels")
    sprite = source.crop(bounds)
    scale = min(MAX_SPRITE[0] / sprite.width, MAX_SPRITE[1] / sprite.height)
    size = (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale)))
    if size != sprite.size:
        sprite = sprite.resize(size, Image.Resampling.NEAREST)
    frame = Image.new("RGBA", FRAME, (0, 0, 0, 0))
    frame.alpha_composite(sprite, ((FRAME[0] - sprite.width) // 2, FOOT_Y - sprite.height))
    visible = frame.getchannel("A").getbbox()
    return frame.crop(visible)


def build_atlas(frames):
    width = sum(frame.width for frame in frames.values()) + (len(frames) - 1) * GUTTER
    height = max(frame.height for frame in frames.values())
    atlas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    x = 0
    for index, frame in enumerate(frames.values()):
        atlas.alpha_composite(frame, (x, height - frame.height))
        x += frame.width + GUTTER
    return atlas


def write_preview(root, preview_dir, prepared):
    preview_dir = preview_dir if preview_dir.is_absolute() else root / preview_dir
    preview_dir.mkdir(parents=True, exist_ok=True)
    sections = []
    for name, spec, frame, _same in prepared:
        source_name, runtime_name = f"{name}-source.png", f"{name}-runtime.png"
        (preview_dir / source_name).write_bytes(source_bytes(root, spec["source"]))
        frame.save(preview_dir / runtime_name, optimize=True)
        sections.append(
            f'<section><h2>{escape(name.title())}</h2><figure><figcaption>Generated RGBA source</figcaption>'
            f'<img src="{source_name}"></figure><figure><figcaption>Tightly cropped portrait with planted feet; 115 px gameplay preview</figcaption>'
            f'<img class="runtime" src="{runtime_name}"></figure></section>'
        )
    html = (
        '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>Creature portrait source review</title><style>body{font:16px system-ui;background:#102d28;color:#edf2d1;margin:2rem}'
        'section{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1rem;margin:2rem 0}'
        'h2{grid-column:1/-1}figure{margin:0;padding:1rem;background:#20473a}img{display:block;max-width:100%;height:auto;image-rendering:pixelated;'
        'background:repeating-conic-gradient(#293a32 0% 25%,#415649 0% 50%) 50%/12px 12px}.runtime{width:115px}</style>'
        '<h1>New creature portrait export review</h1>' + "\n".join(sections) + '</html>'
    )
    (preview_dir / "index.html").write_text(html, encoding="utf-8")


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify normalized portraits and source atlas without writing")
    parser.add_argument("--preview-dir", type=Path, help="write raw and normalized review images")
    parser.add_argument("--root", type=Path, default=ROOT, help="repository root for isolated exports")
    args = parser.parse_args()
    root = args.root.resolve()
    prepared, mismatches = [], []
    for name, spec in SPECS.items():
        frame = build(root, spec)
        target = root / spec["target"]
        same = False
        if target.is_file():
            with Image.open(target) as opened:
                current = opened.convert("RGBA")
            same = current.size == frame.size and current.tobytes() == frame.tobytes()
        if args.check and not same:
            mismatches.append(f"{spec['target']} does not match profile {PROFILE_ID}")
        prepared.append((name, spec, frame, same))

    atlas = build_atlas({name: frame for name, _spec, frame, _same in prepared})
    atlas_path = root / ATLAS
    atlas_same = False
    if atlas_path.is_file():
        with Image.open(atlas_path) as opened:
            current_atlas = opened.convert("RGBA")
        atlas_same = current_atlas.size == atlas.size and current_atlas.tobytes() == atlas.tobytes()
    if args.check and not atlas_same:
        mismatches.append(f"{ATLAS} does not match the normalized portrait cells")
    if not args.check:
        for _name, spec, frame, same in prepared:
            if same:
                continue
            target = root / spec["target"]
            target.parent.mkdir(parents=True, exist_ok=True)
            frame.save(target, optimize=True)
        atlas_path.parent.mkdir(parents=True, exist_ok=True)
        if not atlas_same:
            atlas.save(atlas_path, optimize=True)
    if args.preview_dir:
        write_preview(root, args.preview_dir, prepared)
    if mismatches:
        raise SystemExit("; ".join(mismatches))
    for name, spec, frame, _same in prepared:
        print(f"{'verified' if args.check else 'exported'} {spec['target']} via {PROFILE_ID} ({frame.width}x{frame.height})")
    print(f"{'verified' if args.check else 'wrote'} {ATLAS} ({atlas.width}x{atlas.height})")


if __name__ == "__main__":
    main()
