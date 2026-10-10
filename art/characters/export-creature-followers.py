"""Normalize generated eight-direction creature sheets to fixed follower atlases."""
from argparse import ArgumentParser
from collections import deque
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
PROFILE_ID = "creature-follower-v1"
SPECS = {
    "emberkin": {
        "source": "art/characters/source/creature-emberkin-follower-generated.png",
        "target": "dist/assets/creatures/creature-emberkin-follower.png",
        "rowOrder": ["south", "southwest", "east", "northeast", "north", "northwest", "west", "southeast"],
    },
    "fernling": {
        "source": "art/characters/source/creature-fernling-follower-generated.png",
        "target": "dist/assets/creatures/creature-fernling-follower.png",
    },
    "duskwing": {
        "source": "art/characters/source/creature-duskwing-follower-generated.png",
        "target": "dist/assets/creatures/creature-duskwing-follower.png",
    },
    "brooklet": {
        "source": "art/characters/source/creature-brooklet-follower-generated.png",
        "target": "dist/assets/creatures/creature-brooklet-follower.png",
        "rowOrder": ["north", "northwest", "west", "southwest", "south", "southeast", "east", "northeast"],
        "mirrorRows": [5, 6],
    },
    "hushram": {
        "source": "art/characters/source/creature-hushram-follower-generated.png",
        "target": "dist/assets/creatures/creature-hushram-follower.png",
        "rowOrder": ["north", "northeast", "east", "west", "south", "northwest", "southeast", "southwest"],
    },
    "voltkit": {
        "source": "art/characters/source/creature-voltkit-follower-generated.png",
        "target": "dist/assets/creatures/creature-voltkit-follower.png",
        "rowOrder": ["north", "northeast", "east", "southeast", "south", "northwest", "southwest", "west"],
    },
    "mushmallow": {
        "source": "art/characters/source/creature-mushmallow-follower-generated.png",
        "target": "dist/assets/creatures/creature-mushmallow-follower.png",
        "rowOrder": ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"],
    },
    "frostowl": {
        "source": "art/characters/source/creature-frostowl-follower-generated.png",
        "target": "dist/assets/creatures/creature-frostowl-follower.png",
    },
    "pebblit": {
        "source": "art/characters/source/creature-pebblit-follower-generated.png",
        "target": "dist/assets/creatures/creature-pebblit-follower.png",
    },
    "bramblebuck": {
        "source": "art/characters/source/creature-bramblebuck-follower-generated.png",
        "target": "dist/assets/creatures/creature-bramblebuck-follower.png",
        "rowAlphaThreshold": 128,
    },
    "siltkip": {
        "source": "art/characters/source/creature-siltkip-follower-generated.png",
        "target": "dist/assets/creatures/creature-siltkip-follower.png",
        "rowAlphaThreshold": 128,
    },
    "sunskitter": {
        "source": "art/characters/source/creature-sunskitter-follower-generated.png",
        "target": "dist/assets/creatures/creature-sunskitter-follower.png",
    },
    "sedgegnaw": {
        "source": "art/characters/source/creature-sedgegnaw-follower-generated.png",
        "target": "dist/assets/creatures/creature-sedgegnaw-follower.png",
    },
    "petalunge": {
        "source": "art/characters/source/creature-petalunge-follower-generated.png",
        "target": "dist/assets/creatures/creature-petalunge-follower.png",
    },
    "cindercurl": {
        "source": "art/characters/source/creature-cindercurl-follower-generated.png",
        "target": "dist/assets/creatures/creature-cindercurl-follower.png",
    },
    "sunsifter": {
        "source": "art/characters/source/creature-sunsifter-follower-generated.png",
        "target": "dist/assets/creatures/creature-sunsifter-follower.png",
    },
    "rillume": {
        "source": "art/characters/source/creature-rillume-follower-generated.png",
        "target": "dist/assets/creatures/creature-rillume-follower.png",
    },
    "lanternix": {"source": "art/characters/source/creature-lanternix-follower-generated.png", "target": "dist/assets/creatures/creature-lanternix-follower.png"},

}


def remove_small_components(cell, alpha_threshold, minimum):
    alpha = cell.getchannel("A").point(lambda value: 255 if value > alpha_threshold else 0)
    pixels = alpha.load()
    width, height = alpha.size
    seen = bytearray(width * height)
    removed = Image.new("L", (width, height), 0)
    removed_pixels = removed.load()
    for y in range(height):
        for x in range(width):
            start = y * width + x
            if not pixels[x, y] or seen[start]:
                continue
            queue = deque([(x, y)])
            seen[start] = 1
            component = []
            while queue:
                cx, cy = queue.popleft()
                component.append((cx, cy))
                for ny in range(max(0, cy - 1), min(height, cy + 2)):
                    for nx in range(max(0, cx - 1), min(width, cx + 2)):
                        index = ny * width + nx
                        if pixels[nx, ny] and not seen[index]:
                            seen[index] = 1
                            queue.append((nx, ny))
            if len(component) < minimum:
                for px, py in component:
                    removed_pixels[px, py] = 255
    if removed.getbbox():
        mask = removed.point(lambda value: 0 if value else 255)
        cell.putalpha(Image.composite(cell.getchannel("A"), Image.new("L", cell.size, 0), mask))


def bounds(length, count):
    return [round(i * length / count) for i in range(count + 1)]


def generated_row_bounds(source, alpha_threshold, rows):
    alpha = source.getchannel("A")
    pixels = alpha.load()
    projection = [sum(pixels[x, y] > alpha_threshold for x in range(source.width)) for y in range(source.height)]
    bands, start = [], None
    for y, count in enumerate(projection + [0]):
        if count > 8 and start is None:
            start = y
        elif count <= 8 and start is not None:
            bands.append([start, y - 1])
            start = None
    merged = []
    for band in bands:
        if merged and band[0] - merged[-1][1] - 1 <= 4:
            merged[-1][1] = band[1]
        else:
            merged.append(band)
    if len(merged) != rows:
        raise ValueError(f"expected {rows} separated generated row bands, found {len(merged)}")
    separators = [0]
    separators.extend(round((merged[i][1] + merged[i + 1][0]) / 2) for i in range(rows - 1))
    separators.append(source.height)
    return separators


def build(source_path, frame_size, content_size, foot_y, alpha_threshold, minimum_component, spec, root=None):
    source_data = source_bytes(root, source_path.relative_to(root)) if root else Path(source_path).read_bytes()
    with Image.open(BytesIO(source_data)) as opened:
        source = opened.convert("RGBA")
    columns, rows = 5, 8
    xs, ys = bounds(source.width, columns), generated_row_bounds(source, spec.get("rowAlphaThreshold", alpha_threshold), rows)
    source_rows = spec.get("sourceRows", list(range(rows)))
    if len(source_rows) != rows or sorted(source_rows) != list(range(rows)):
        raise ValueError(f"{source_path}: sourceRows must map each source row exactly once")
    mirror_rows = set(spec.get("mirrorRows", []))
    sheet = Image.new("RGBA", (columns * frame_size, rows * frame_size), (0, 0, 0, 0))
    footprints = []
    for row in range(rows):
        for column in range(columns):
            source_row = source_rows[row]
            cell = source.crop((xs[column], ys[source_row], xs[column + 1], ys[source_row + 1]))
            if row in mirror_rows:
                cell = cell.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            cell.putalpha(cell.getchannel("A").point(lambda value: value if value > alpha_threshold else 0))
            remove_small_components(cell, alpha_threshold, minimum_component)
            bbox = cell.getchannel("A").getbbox()
            if bbox is None:
                raise ValueError(f"empty generated cell {row},{column}: {source_path}")
            sprite = cell.crop(bbox)
            ratio = min(content_size / sprite.width, content_size / sprite.height)
            if abs(ratio - 1) > 1e-6:
                sprite = sprite.resize((max(1, round(sprite.width * ratio)), max(1, round(sprite.height * ratio))), Image.Resampling.NEAREST)
            x = column * frame_size + (frame_size - sprite.width) // 2
            y = row * frame_size + foot_y - sprite.height
            sheet.alpha_composite(sprite, (x, y))
            footprints.append({"row": row, "column": column, "x": x - column * frame_size, "y": y - row * frame_size, "width": sprite.width, "height": sprite.height})
    return sheet, footprints


def write_preview(root, preview_dir, prepared, frame_size):
    preview_dir = preview_dir if preview_dir.is_absolute() else root / preview_dir
    preview_dir.mkdir(parents=True, exist_ok=True)
    cards = []
    for name, source_path, target, sheet, runtime, _same, _footprints in prepared:
        source_name, output_name = f"{name}-generated-source.png", f"{name}-normalized.png"
        (preview_dir / source_name).write_bytes(source_bytes(root, source_path.relative_to(root)))
        runtime.save(preview_dir / output_name, optimize=True)
        cards.append(
            f'<section><h2>{escape(name)}</h2><div class="images"><figure><figcaption>Generated source</figcaption><img src="{source_name}"></figure>'
            f'<figure><figcaption>Normalized 5×8 atlas · {frame_size}px cells</figcaption><img src="{output_name}"></figure></div></section>'
        )
    html = (
        '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>Creature follower art review</title><style>body{font:16px system-ui;background:#19251f;color:#eef5df;margin:2rem}'
        'section{margin:2rem 0}.images{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem}'
        'figure{margin:0;padding:1rem;background:#2b3b32}img{display:block;max-width:100%;height:auto;image-rendering:pixelated;'
        'background:repeating-conic-gradient(#789 0% 25%,#adc 0% 50%) 50%/16px 16px}</style>'
        '<h1>Creature follower sheet review</h1><p>Raw generated grids beside fixed-cell, bottom-center anchored candidates.</p>'
        + "\n".join(cards)
        + "</html>"
    )
    (preview_dir / "art-review.html").write_text(html, encoding="utf-8")


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--preview-dir", type=Path)
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args()
    root = args.root.resolve()
    profile = json.loads((root / "art/characters/export-profiles.json").read_text())["profiles"][PROFILE_ID]
    if not profile.get("status", "").startswith("implemented"):
        raise SystemExit(f"profile {PROFILE_ID} is not available for export")
    frame_w, frame_h = profile["frame"]
    content = profile["maxSprite"]
    palette = profile.get("indexedOutput", {})
    prepared, errors = [], []
    for name, spec in SPECS.items():
        source = root / spec["source"]
        target = root / spec["target"]
        sheet, footprints = build(source, frame_w, content[0], profile["footY"], profile["alphaThreshold"], profile["minimumComponentPixels"], spec, root=root)
        runtime = sheet.quantize(colors=palette.get("colors", 256), method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE) if name in palette.get("species", []) else sheet
        same = False
        if target.is_file():
            with Image.open(target) as opened:
                current = opened.convert("RGBA")
            same = current.size == runtime.size and current.tobytes() == runtime.convert("RGBA").tobytes()
        if args.check and not same:
            errors.append(f"{spec['target']} differs from {PROFILE_ID} export")
        prepared.append((name, source, target, sheet, runtime, same, footprints))
    if not args.check:
        for _name, _source, target, _sheet, runtime, same, _footprints in prepared:
            if not same:
                target.parent.mkdir(parents=True, exist_ok=True)
                runtime.save(target, optimize=True)
    if args.preview_dir:
        write_preview(root, args.preview_dir, prepared, frame_w)
    for name, _source, target, _sheet, runtime, _same, _footprints in prepared:
        print(f"{'verified' if args.check else 'exported'} {target.relative_to(root)} ({runtime.width}x{runtime.height})")
    if errors:
        raise SystemExit("; ".join(errors))


if __name__ == "__main__":
    main()
