"""Export guardian forms through the shared four-by-five combat cell pipeline.

Retains generated originals and packs exact RGBA runtime pixels into a dedicated
editable atlas. Preflights every source before writing any output.
"""
from argparse import ArgumentParser
from importlib.util import module_from_spec, spec_from_file_location
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PROFILE_ID = "creature-guardian-combat-v1"
FORMS = {
    "mushmallow": "thorn-mantle",
    "pebblit": "crystal-ridge",
    "frostowl": "ice-mantle",
    "siltkip": "tide-sail",
}
module_spec = spec_from_file_location("combat_export", ROOT / "art/characters/export-creature-followers.py")
combat = module_from_spec(module_spec)
module_spec.loader.exec_module(combat)


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    profile = json.loads((ROOT / "art/characters/export-profiles.json").read_text())["profiles"][PROFILE_ID]
    prepared = []
    for species, form in FORMS.items():
        name = f"{species}-{form}"
        spec = {"source": f"art/characters/source/creature-{name}-combat-generated.png"}
        with Image.open(ROOT / spec["source"]) as opened:
            source = opened.convert("RGBA")
        combat.remove_small_components(source, profile["alphaThreshold"], profile["minimumComponentPixels"])
        xs = combat.generated_row_bounds(source.transpose(Image.Transpose.TRANSPOSE), profile["alphaThreshold"], 4)
        ys = combat.generated_row_bounds(source, profile["alphaThreshold"], 5)
        cells = []
        for row in range(5):
            for column in range(4):
                cell = source.crop((xs[column], ys[row], xs[column + 1], ys[row + 1]))
                cell.putalpha(cell.getchannel("A").point(lambda v: v if v > profile["alphaThreshold"] else 0))
                combat.remove_small_components(cell, profile["alphaThreshold"], profile["minimumComponentPixels"])
                box = cell.getchannel("A").getbbox()
                if not box or min(box[0], box[1], cell.width - box[2], cell.height - box[3]) < 2:
                    raise ValueError(f"{name}: empty/crossing source cell {row},{column}")
                cells.append(cell.crop(box))
        # One scale for all states: individual faint/recoil cells never grow to fill the frame.
        ratio = profile["maxSprite"] / max(max(cell.size) for cell in cells)
        anchored = Image.new("RGBA", (1152, 1440), (0, 0, 0, 0))
        for index, cell in enumerate(cells):
            cell = cell.resize((round(cell.width * ratio), round(cell.height * ratio)), Image.Resampling.NEAREST)
            anchored.alpha_composite(cell, ((index % 4) * 288 + (288 - cell.width) // 2,
                                            (index // 4) * 288 + profile["footY"] - cell.height))
        prepared.append((name, anchored))
    atlas = Image.new("RGBA", (1152 * 2, 1440 * 2), (0, 0, 0, 0))
    errors = []
    for i, (name, output) in enumerate(prepared):
        atlas.alpha_composite(output, ((i % 2) * 1152, (i // 2) * 1440))
        target = ROOT / f"dist/assets/creatures/creature-{name}-combat.png"
        if args.check:
            if not target.exists():
                errors.append(f"missing {target}")
            else:
                with Image.open(target) as existing:
                    if existing.size != output.size or existing.convert("RGBA").tobytes() != output.tobytes():
                        errors.append(f"{name}: runtime differs from generated source/profile")
        else:
            output.save(target, optimize=True)
    target = ROOT / "art/assets/source/creature-forms-atlas.png"
    if args.check:
        if not target.exists():
            errors.append("missing creature forms source atlas")
        else:
            with Image.open(target) as existing:
                if existing.size != atlas.size or existing.convert("RGBA").tobytes() != atlas.tobytes():
                    errors.append("creature forms source atlas differs from exact runtime pixels")
    elif not errors:
        atlas.save(target, optimize=True)
    if errors:
        raise SystemExit("; ".join(errors))
    print(f"{'verified' if args.check else 'exported'} four guardian forms and exact editable atlas")


if __name__ == "__main__":
    main()
