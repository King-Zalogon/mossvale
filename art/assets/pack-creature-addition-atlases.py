"""Pack new creature animation exports into editable, verifiable RGBA source atlases."""
from argparse import ArgumentParser
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
GUTTER = 16
SPECIES = ["sedgegnaw", "petalunge", "cindercurl", "sunsifter", "rillume"]
ATLASES = {
    "source/creature-combat-new-atlas.png": ("combat", (1152, 1440)),
    "source/creature-follower-new-atlas.png": ("follower", (1000, 1600)),
}


def expected_atlas(kind, cell_size):
    cells = []
    for name in SPECIES:
        path = ROOT / f"dist/assets/creatures/creature-{name}-{kind}.png"
        with Image.open(path) as opened:
            cell = opened.convert("RGBA")
        if cell.size != cell_size:
            raise ValueError(f"{path.relative_to(ROOT)} is {cell.size}, expected {cell_size}")
        cells.append(cell)
    width = len(cells) * cell_size[0] + (len(cells) - 1) * GUTTER
    atlas = Image.new("RGBA", (width, cell_size[1]), (0, 0, 0, 0))
    for index, cell in enumerate(cells):
        atlas.alpha_composite(cell, (index * (cell_size[0] + GUTTER), 0))
    return atlas


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify the atlases without writing")
    args = parser.parse_args()
    for path, (kind, cell_size) in ATLASES.items():
        expected = expected_atlas(kind, cell_size)
        target = ROOT / "art/assets" / path
        target.parent.mkdir(parents=True, exist_ok=True)
        same = False
        if target.is_file():
            with Image.open(target) as opened:
                current = opened.convert("RGBA")
            same = current.size == expected.size and current.tobytes() == expected.tobytes()
        if args.check and not same:
            raise SystemExit(f"{path} does not match the new normalized runtime exports")
        if not args.check and not same:
            expected.save(target, optimize=True)
        print(f"{'verified' if args.check else 'packed'} art/assets/{path} ({expected.width}x{expected.height})")


if __name__ == "__main__":
    main()
