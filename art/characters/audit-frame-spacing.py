"""Audit every shipped creature animation cell without changing any pixels."""
from argparse import ArgumentParser
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'art/characters/reviews/frame-spacing-347.json'


def audit():
    profiles = json.loads((ROOT / 'art/characters/export-profiles.json').read_text())['profiles']
    normal = profiles['creature-combat-v1']
    follower = profiles['creature-follower-v1']
    guardian = profiles['creature-guardian-combat-v1']
    sheets = []
    for name, size in normal['frameSizes'].items():
        sheets.append((f'creature-{name}-combat', size, 4, 5, normal['alphaThreshold'], size[1] - normal['footInset']))
        sheets.append((f'creature-{name}-follower', follower['frame'], 5, 8, follower['alphaThreshold'], follower['footY']))
    for name, size in guardian['frameSizes'].items():
        sheets.append((f'creature-{name}-combat', size, 4, 5, guardian['alphaThreshold'], guardian['footY']))
    records = []
    for name, (width, height), columns, rows, threshold, ground in sheets:
        path = ROOT / f'dist/assets/creatures/{name}.png'
        with Image.open(path) as image:
            if image.size != (columns * width, rows * height):
                raise ValueError(f'{name}: incorrect fixed grid dimensions')
            alpha = image.convert('RGBA').getchannel('A').point(lambda a: 255 if a > threshold else 0)
        margin = min(width, height)
        for row in range(rows):
            for column in range(columns):
                box = alpha.crop((column * width, row * height, (column + 1) * width, (row + 1) * height)).getbbox()
                if box is None:
                    raise ValueError(f'{name}:{row},{column}: empty pose')
                clear = min(box[0], box[1], width - box[2], height - box[3])
                if clear < 4 or abs(box[3] - ground) > 1:
                    raise ValueError(f'{name}:{row},{column}: gutter {clear} / baseline {box[3]} (expected {ground})')
                margin = min(margin, clear)
        records.append({'asset': name, 'path': path.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                        'frame': [width, height], 'cells': columns * rows, 'minimumClearMargin': margin, 'ground': ground})
    return {'format': 1, 'purpose': 'Technical frame spacing audit; does not certify anatomy, identity or visual taste.',
            'totalCells': sum(record['cells'] for record in records), 'assets': records}


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='verify the saved audit without writing')
    args = parser.parse_args()
    report = audit()
    if args.check:
        if not OUTPUT.exists() or json.loads(OUTPUT.read_text()) != report:
            raise SystemExit('Frame spacing audit is stale: review the cells and regenerate audit-frame-spacing.py')
    else:
        OUTPUT.write_text(json.dumps(report, indent=2) + '\n')
    print(f"{'verified' if args.check else 'audited'} {len(report['assets'])} atlases / {report['totalCells']} cells with clear gutters and shared baselines")


if __name__ == '__main__':
    main()
