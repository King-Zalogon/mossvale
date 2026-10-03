"""Export generated character turnarounds to versioned fixed RGBA animation cells.

Requires Pillow. Sources and prompts are documented in SOURCES.md.
"""
import argparse
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'art/characters/source'
OUTPUT = ROOT / 'dist/assets/people'
PROFILES = json.loads((ROOT / 'art/characters/export-profiles.json').read_text())['profiles']
PLAYER_PROFILE = PROFILES['red-cap-motion-v1']
NPC_PROFILE = PROFILES['npc-turnaround-v1']
CELL = tuple(PLAYER_PROFILE['frame'])
FOOT_Y = PLAYER_PROFILE['footY']
NPC_CELL = tuple(NPC_PROFILE['frame'])


def fit_person(source_cell, target_height, max_width=144, alpha_threshold=8, cell=CELL, foot_y=FOOT_Y):
    alpha = source_cell.getchannel('A').point(lambda value: 255 if value > alpha_threshold else 0)
    bounds = alpha.getbbox()
    if not bounds:
        raise ValueError('empty animation frame')
    sprite = source_cell.crop(bounds)
    scale = min(target_height / sprite.height, max_width / sprite.width)
    size = (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale)))
    sprite = sprite.resize(size, Image.Resampling.NEAREST)
    frame = Image.new('RGBA', cell, (0, 0, 0, 0))
    frame.alpha_composite(sprite, ((cell[0] - sprite.width) // 2, foot_y - sprite.height))
    return frame


def export_player():
    batches = [
        'person-red-cap-motion-north-northeast.png',
        'person-red-cap-motion-east-southeast.png',
        'person-red-cap-motion-south-southwest.png',
        'person-red-cap-motion-west-northwest.png',
    ]
    out = Image.new('RGBA', (5 * CELL[0], 8 * CELL[1]), (0, 0, 0, 0))
    for batch_index, filename in enumerate(batches):
        sheet = Image.open(SOURCE / filename).convert('RGBA')
        for local_row in range(2):
            row = batch_index * 2 + local_row
            y0, y1 = round(local_row * sheet.height / 2), round((local_row + 1) * sheet.height / 2)
            for column in range(5):
                x0, x1 = round(column * sheet.width / 5), round((column + 1) * sheet.width / 5)
                cell = fit_person(
                    sheet.crop((x0, y0, x1, y1)),
                    PLAYER_PROFILE['maxSprite'][1],
                    max_width=PLAYER_PROFILE['maxSprite'][0],
                    alpha_threshold=PLAYER_PROFILE['alphaThreshold'],
                )
                out.alpha_composite(cell, (column * CELL[0], row * CELL[1]))
    return out


def export_grid(source_name, output_name, columns, rows, source_rows=None, row_index=None):
    sheet = Image.open(SOURCE / source_name).convert('RGBA')
    out = Image.new('RGBA', (columns * NPC_CELL[0], rows * NPC_CELL[1]), (0, 0, 0, 0))
    selected = range(rows) if row_index is None else [row_index]
    target_row = 0
    for r in selected:
        y0, y1 = round(r * sheet.height / (source_rows or rows)), round((r + 1) * sheet.height / (source_rows or rows))
        for c in range(columns):
            x0, x1 = round(c * sheet.width / columns), round((c + 1) * sheet.width / columns)
            source_cell = sheet.crop((x0, y0, x1, y1))
            cell = fit_person(
                source_cell,
                NPC_PROFILE['maxSpriteHeight'],
                alpha_threshold=NPC_PROFILE['alphaThreshold'],
                cell=NPC_CELL,
                foot_y=NPC_PROFILE['footY'],
            )
            out.alpha_composite(cell, (c * NPC_CELL[0], target_row * NPC_CELL[1]))
        target_row += 1
    return out


def save_or_check(name, image, check_only):
    target = OUTPUT / name
    same = False
    if target.exists():
        with Image.open(target) as current:
            same = current.mode == 'RGBA' and current.size == image.size and current.tobytes() == image.tobytes()
    if check_only and not same:
        raise SystemExit(f'{target.relative_to(ROOT)} differs from its editable source/profile')
    if not check_only and not same:
        temporary = target.with_suffix('.png.tmp')
        image.save(temporary, format='PNG', optimize=True)
        temporary.replace(target)
    print(f"{'verified' if check_only else 'exported'} {target.relative_to(ROOT)} via {PLAYER_PROFILE['category'] if 'motion' in name else NPC_PROFILE['category']}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='verify generated pixels without changing runtime files')
    args = parser.parse_args()
    outputs = [
        ('person-red-cap-motion.png', export_player()),
        ('person-traveler.png', export_grid('person-traveler-gardener-turnaround-source.png', 'person-traveler.png', 4, 1, source_rows=2, row_index=0)),
        ('person-gardener.png', export_grid('person-traveler-gardener-turnaround-source.png', 'person-gardener.png', 4, 1, source_rows=2, row_index=1)),
    ]
    for name, image in outputs:
        save_or_check(name, image, args.check)


if __name__ == '__main__':
    main()
