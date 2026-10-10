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
PLAYER_SOURCE_ATLAS = ROOT / 'art/assets/source/people-atlas.png'
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
    # Nearest-neighbor downscaling can discard a faint source edge row. Re-align the
    # visible alpha bounds after scaling so every direction lands on the same foot line.
    bounds = frame.getchannel('A').point(lambda value: 255 if value > alpha_threshold else 0).getbbox()
    if bounds and bounds[3] != foot_y:
        aligned = Image.new('RGBA', cell, (0, 0, 0, 0))
        aligned.alpha_composite(frame, (0, foot_y - bounds[3]))
        frame = aligned
    return frame


PLAYER_ROWS = [
    # The original source row supplies walk cells unless a focused override is recorded. The neutral-rest
    # turnaround below supplies every idle cell so a stopped player never reuses a stride-like pose.
    ('person-red-cap-motion-north-northeast.png', 0, None),
    ('person-red-cap-motion-north-northeast.png', 1, ('person-red-cap-motion-northeast-v3.png', 1)),
    ('person-red-cap-motion-east-v2.png', 0, None),
    ('person-red-cap-motion-east-southeast.png', 1, None),
    ('person-red-cap-motion-south-southwest.png', 0, None),
    ('person-red-cap-motion-south-southwest.png', 1, ('person-red-cap-motion-southwest-v2.png', 1)),
    ('person-red-cap-motion-west-northwest.png', 0, None),
    ('person-red-cap-motion-northwest-v2.png', 0, None),
]

PLAYER_IDLE_SOURCE = 'person-red-cap-neutral-idle-v2.png'
PLAYER_IDLE_GRID = (4, 2)
# Source sheet order is S, SE, E, NE on row 0 then N, NW, W, SW on row 1.
# Export in the runtime N, NE, E, SE, S, SW, W, NW order.
PLAYER_IDLE_CELLS = [
    (1, 0),  # north
    (0, 3),  # northeast
    (0, 2),  # east
    (0, 1),  # southeast
    (0, 0),  # south
    (1, 3),  # southwest
    (1, 2),  # west
    (1, 1),  # northwest
]

# The retained Southwest strip repeats a middle-leg pose in source columns 2–3 and puts the opposite passing
# pose in column 4. Reorder those four walk cells to alternate the leading leg at runtime. East and Northwest
# v2 strips already contain a sequential idle + four-pose walk order; Northeast uses a diagonal-facing row with its feet paced by the North stride.
PLAYER_WALK_COLUMNS = {
    5: (0, 1, 2, 4, 3),
}
PLAYER_WALK_FRAME_OVERRIDES = {6: {3: 'person-red-cap-motion-west-alternate-stride-v1.png'}}


def export_player(source_dir=SOURCE):
    out = Image.new('RGBA', (5 * CELL[0], 8 * CELL[1]), (0, 0, 0, 0))
    sheets = {}
    idle_sheet = Image.open(source_dir / PLAYER_IDLE_SOURCE).convert('RGBA')
    idle_columns, idle_rows = PLAYER_IDLE_GRID
    for row, (base_name, base_row, walk_override) in enumerate(PLAYER_ROWS):
        for column in range(5):
            override = PLAYER_WALK_FRAME_OVERRIDES.get(row, {}).get(column) if column > 0 else None
            if column == 0:
                idle_row, idle_column = PLAYER_IDLE_CELLS[row]
                x0, x1 = round(idle_column * idle_sheet.width / idle_columns), round((idle_column + 1) * idle_sheet.width / idle_columns)
                y0, y1 = round(idle_row * idle_sheet.height / idle_rows), round((idle_row + 1) * idle_sheet.height / idle_rows)
                source_cell = idle_sheet.crop((x0, y0, x1, y1))
            elif override:
                source = Image.open(source_dir / override).convert('RGBA')
                source_cell = source
            else:
                filename, source_row = walk_override if walk_override else (base_name, base_row)
                if filename not in sheets:
                    sheets[filename] = Image.open(source_dir / filename).convert('RGBA')
                sheet = sheets[filename]
                y0, y1 = round(source_row * sheet.height / 2), round((source_row + 1) * sheet.height / 2)
                source_column = PLAYER_WALK_COLUMNS.get(row, range(5))[column]
                x0, x1 = round(source_column * sheet.width / 5), round((source_column + 1) * sheet.width / 5)
                source_cell = sheet.crop((x0, y0, x1, y1))
            cell = fit_person(
                source_cell,
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


def sync_player_source_atlas(image, check_only, source_atlas_path=PLAYER_SOURCE_ATLAS):
    label = source_atlas_path.relative_to(ROOT) if source_atlas_path.is_relative_to(ROOT) else source_atlas_path
    updated = None
    with Image.open(source_atlas_path) as current:
        if current.mode != 'RGBA' or current.width < image.width or current.height < image.height:
            raise SystemExit(f'{label} cannot hold the RGBA player atlas at (0, 0)')
        same = current.crop((0, 0, image.width, image.height)).tobytes() == image.tobytes()
        if not same and not check_only:
            current.paste(image, (0, 0))
            updated = current.copy()
    if updated:
        temporary = source_atlas_path.with_suffix('.png.tmp')
        updated.save(temporary, format='PNG', optimize=True)
        temporary.replace(source_atlas_path)
    if check_only and not same:
        raise SystemExit(f'{label} player crop differs from its editable character sources')
    print(f"{'verified' if check_only else 'synchronized'} {label} player crop")


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
        if name == 'person-red-cap-motion.png':
            sync_player_source_atlas(image, args.check)


if __name__ == '__main__':
    main()
