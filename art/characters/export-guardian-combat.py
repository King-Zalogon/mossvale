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
module_spec = spec_from_file_location("combat_export", ROOT / "art/characters/export-creature-combat.py")
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
        _segmented, anchored = combat.build(ROOT, profile, spec, name)
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
