"""Export generated character turnarounds to fixed 160x256 RGBA animation cells.

Requires Pillow. Sources and prompts are documented in SOURCES.md.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'art/characters/source'
OUTPUT = ROOT / 'dist/assets/people'
CELL = (160, 256)
FOOT_Y = 250


def fit_person(source_cell, target_height, max_width=144):
    alpha = source_cell.getchannel('A').point(lambda value: 255 if value > 8 else 0)
    bounds = alpha.getbbox()
    if not bounds:
        raise ValueError('empty animation frame')
    sprite = source_cell.crop(bounds)
    scale = min(target_height / sprite.height, max_width / sprite.width)
    size = (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale)))
    sprite = sprite.resize(size, Image.Resampling.NEAREST)
    frame = Image.new('RGBA', CELL, (0, 0, 0, 0))
    frame.alpha_composite(sprite, ((CELL[0] - sprite.width) // 2, FOOT_Y - sprite.height))
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
                cell = fit_person(sheet.crop((x0, y0, x1, y1)), 224, max_width=152)
                out.alpha_composite(cell, (column * CELL[0], row * CELL[1]))
    out.save(OUTPUT / 'person-red-cap-motion.png', format='PNG', optimize=True)


def export_grid(source_name, output_name, columns, rows, source_rows=None, row_index=None):
    sheet = Image.open(SOURCE / source_name).convert('RGBA')
    out = Image.new('RGBA', (columns * CELL[0], rows * CELL[1]), (0, 0, 0, 0))
    selected = range(rows) if row_index is None else [row_index]
    target_row = 0
    for r in selected:
        y0, y1 = round(r * sheet.height / (source_rows or rows)), round((r + 1) * sheet.height / (source_rows or rows))
        for c in range(columns):
            x0, x1 = round(c * sheet.width / columns), round((c + 1) * sheet.width / columns)
            source_cell = sheet.crop((x0, y0, x1, y1))
            cell = normalize_player(source_cell) if source_rows is None else fit_person(source_cell, 220)
            out.alpha_composite(cell, (c * CELL[0], target_row * CELL[1]))
        target_row += 1
    out.save(OUTPUT / output_name, format='PNG', optimize=True)


export_player()
export_grid('person-traveler-gardener-turnaround-source.png', 'person-traveler.png', 4, 1, source_rows=2, row_index=0)
export_grid('person-traveler-gardener-turnaround-source.png', 'person-gardener.png', 4, 1, source_rows=2, row_index=1)
