"""Export optional creature resources using reviewed cells and shared anchors."""
from argparse import ArgumentParser
from io import BytesIO
import json
from pathlib import Path
import sys
from PIL import Image
from source_archive import source_bytes
from sprite_cells import extract_poses

ROOT = Path(__file__).resolve().parents[2]


def prepare(kind, spec):
    source = Image.open(BytesIO(source_bytes(ROOT, spec['source']))).convert('RGBA')
    if kind == 'portrait':
        source.putalpha(source.getchannel('A').point(lambda a: a if a >= 128 else 0))
        pose = source.crop(source.getchannel('A').getbbox())
        ratio = min(264 / pose.width, 264 / pose.height)
        return pose.resize((round(pose.width * ratio), round(pose.height * ratio)), Image.Resampling.NEAREST)
    cols, rows = spec['columns'], spec['rows']
    poses = extract_poses(source, cols, rows, 128, 4, spec.get('rowBounds'), spec.get('columnBounds'))
    size = spec['frameSize']
    ratio = min((size - 24) / max(p.width for p in poses), (size - 16) / max(p.height for p in poses))
    atlas = Image.new('RGBA', (cols * size, rows * size))
    for i, pose in enumerate(poses):
        pose = pose.resize((max(1, round(pose.width * ratio)), max(1, round(pose.height * ratio))), Image.Resampling.NEAREST)
        atlas.alpha_composite(pose, ((i % cols) * size + (size - pose.width) // 2, (i // cols) * size + size - 4 - pose.height))
    for row in range(rows):
        for col in range(cols):
            bounds = atlas.crop((col * size, row * size, (col + 1) * size, (row + 1) * size)).getchannel('A').getbbox()
            if not bounds or min(bounds[0], bounds[1], size - bounds[2], size - bounds[3]) < 4:
                raise ValueError(f'{kind} {row},{col}: missing pose or insufficient gutter')
    return atlas


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--species', choices=['parrocket', 'blastoucan'], default='parrocket')
    args = parser.parse_args()
    specs = json.loads((ROOT / f'art/characters/source/{args.species}/export.json').read_text())['exports']
    for kind, spec in specs.items():
        image = prepare(kind, spec)
        for path in [spec['output'], spec['editable']]:
            target = ROOT / path
            if args.check:
                if not target.exists() or Image.open(target).convert('RGBA').size != image.size or Image.open(target).convert('RGBA').tobytes() != image.tobytes():
                    raise ValueError(f'{path}: stale creature resource export')
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                image.save(target, optimize=True)
        print(f'{"verified" if args.check else "exported"} {args.species} {kind}: {image.width}x{image.height}')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError) as error:
        print(error, file=sys.stderr)
        raise SystemExit(1)
