#!/usr/bin/env python3
"""Pack current sprites into editable source atlases, or export atlas cells to dist/assets."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ASSET_ROOT = ROOT / "dist" / "assets"
SOURCE_ROOT = ROOT / "art" / "assets" / "source"
METADATA = ROOT / "art" / "assets" / "metadata.json"
PROFILE_PATH = ROOT / "art" / "characters" / "export-profiles.json"
GUTTER = 16
SHEET_WIDTH = 2048
PROP_PROFILE_ID = "prop-static-v1"
EXPORT_PROFILES = json.loads(PROFILE_PATH.read_text())["profiles"]
LANDMARK_MANIFEST = SOURCE_ROOT / "landmarks" / "manifest.json"
LANDMARK_SOURCES = {
    entry["name"]: entry["source"]
    for entry in json.loads(LANDMARK_MANIFEST.read_text(encoding="utf-8")).get("assets", [])
} if LANDMARK_MANIFEST.exists() else {}


def profile_digest(profile: dict) -> str:
    serialized = json.dumps(profile, separators=(",", ":"), ensure_ascii=False).encode()
    return hashlib.sha256(serialized).hexdigest()


def validate_prop_profile(profile_id: str = PROP_PROFILE_ID) -> dict:
    profile = EXPORT_PROFILES.get(profile_id)
    if profile is None or profile.get("category") != "prop" or profile.get("status") != "implemented":
        raise ValueError(f"{profile_id} must be an implemented prop export profile")
    if profile_id == PROP_PROFILE_ID and (profile.get("resampling") != "none" or profile.get("palette") != "preserve RGBA"):
        raise ValueError(f"{PROP_PROFILE_ID} must preserve prop pixels without resampling")
    if profile_id == "prop-landmark-v1" and (
        profile.get("maxPixelEdge") != 256
        or profile.get("alphaThreshold") != 32
        or profile.get("resampling") != "nearest-neighbor fit to maxPixelEdge"
        or profile.get("palette") != "preserve 8-bit RGBA; no palette quantization"
    ):
        raise ValueError("prop-landmark-v1 settings do not match its deterministic source preparation")
    return {"id": profile_id, "settingsSha256": profile_digest(profile)}

FRAMES = {
    "person-red-cap-motion": {
        "columns": 5,
        "rows": 8,
        "frameWidth": 160,
        "frameHeight": 256,
        "rowOrder": ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"],
        "columnOrder": ["idle", "walk-1", "walk-2", "walk-3", "walk-4"],
    },
    "person-traveler": {
        "columns": 4,
        "rows": 1,
        "frameWidth": 160,
        "frameHeight": 256,
        "columnOrder": ["north", "east", "south", "west"],
    },
    "person-gardener": {
        "columns": 4,
        "rows": 1,
        "frameWidth": 160,
        "frameHeight": 256,
        "columnOrder": ["north", "east", "south", "west"],
    },
    **{
        f"creature-{name}-combat": {
            "columns": 4,
            "rows": 5,
            "frameWidth": 288,
            "frameHeight": 288,
            "columnOrder": [0, 1, 2, 3],
            "rowOrder": ["idle", "attack", "hit", "faint", "capture"],
        }
        for name in ["fernling", "brooklet", "hushram", "mushmallow", "frostowl"]
    },
    "creature-duskwing-combat": {
        "columns": 4,
        "rows": 5,
        "frameWidth": 281,
        "frameHeight": 281,
        "columnOrder": [0, 1, 2, 3],
        "rowOrder": ["idle", "attack", "hit", "faint", "capture"],
    },
}

GENERATED_SOURCES = {
    "person-red-cap-motion": ["art/characters/SOURCES.md"],
    "person-traveler": ["art/characters/SOURCES.md"],
    "person-gardener": ["art/characters/SOURCES.md"],
    "creature-fernling-combat": ["art/characters/source/creature-fernling-combat-generated.png"],
    "creature-duskwing-combat": ["art/characters/source/creature-duskwing-combat-generated.png"],
    "creature-brooklet-combat": ["art/characters/source/creature-brooklet-combat-generated.png"],
    "creature-hushram-combat": ["art/characters/source/creature-hushram-combat-generated.png"],
    "creature-mushmallow-combat": ["art/characters/source/creature-mushmallow-combat-generated.png"],
    "creature-frostowl-combat": ["art/characters/source/creature-frostowl-combat-generated.png"],
}
GENERATED_SOURCES.update({name: [source] for name, source in LANDMARK_SOURCES.items()})


def list_assets() -> list[dict]:
    entries = []
    for path in sorted(ASSET_ROOT.glob("*/*.png")):
        with Image.open(path) as source:
            source = source.convert("RGBA")
            width, height = source.size
        name = path.stem
        generated = GENERATED_SOURCES.get(name, [])
        entry = {
            "name": name,
            "src": path.relative_to(ROOT / "dist").as_posix(),
            "folder": path.parent.name,
            "kind": {"props": "prop", "creatures": "creature", "people": "person", "items": "item"}[path.parent.name],
            "width": width,
            "height": height,
            "anchor": "bottom-center",
            "sheet": f"source/{path.parent.name}-atlas.png",
            "cell": {"x": 0, "y": 0},
            "frames": FRAMES.get(name),
            "provenance": {
                "editablePixelSource": "art/assets/source atlas cell",
                "originalGeneratedReferences": generated,
                "originalGenerationSourceAvailable": bool(generated),
            },
        }
        if entry["kind"] == "prop":
            profile_id = "prop-landmark-v1" if name in LANDMARK_SOURCES else PROP_PROFILE_ID
            entry["exportProfile"] = validate_prop_profile(profile_id)
        entries.append(entry)
    return entries


def pack() -> None:
    if METADATA.exists() or SOURCE_ROOT.exists():
        raise FileExistsError("source atlases already exist; --pack would replace them (pass --force only to rebuild from dist)")
    entries = list_assets()
    if not entries:
        raise ValueError("no dist/assets PNGs found")
    SOURCE_ROOT.mkdir(parents=True)
    sheets = {}
    for folder in sorted({item["folder"] for item in entries}):
        group = [item for item in entries if item["folder"] == folder]
        x = y = row_height = 0
        for item in sorted(group, key=lambda asset: (-asset["height"], -asset["width"], asset["name"])):
            if x and x + item["width"] > SHEET_WIDTH:
                x = 0
                y += row_height + GUTTER
                row_height = 0
            item["cell"] = {"x": x, "y": y}
            x += item["width"] + GUTTER
            row_height = max(row_height, item["height"])
        sheet_width = max(item["cell"]["x"] + item["width"] for item in group)
        sheet_height = max(item["cell"]["y"] + item["height"] for item in group)
        sheet = Image.new("RGBA", (sheet_width, sheet_height), (0, 0, 0, 0))
        for item in group:
            with Image.open(ROOT / "dist" / item["src"]) as source:
                sheet.paste(source, tuple(item["cell"].values()))
        filename = f"{folder}-atlas.png"
        sheet.save(SOURCE_ROOT / filename, optimize=True)
        sheets[f"source/{filename}"] = {"width": sheet_width, "height": sheet_height, "mode": "RGBA"}
    metadata = {
        "version": 1,
        "pixelPreserving": True,
        "anchor": "bottom-center",
        "gutter": GUTTER,
        "sheets": sheets,
        "assets": sorted(entries, key=lambda asset: asset["name"]),
    }
    METADATA.write_text(json.dumps(metadata, indent=2) + "\n")
    print(f"packed {len(entries)} assets into {len(sheets)} editable RGBA source atlases")


def export(check_only: bool = False) -> None:
    metadata = json.loads(METADATA.read_text())
    if metadata.get("version") != 1 or metadata.get("pixelPreserving") is not True:
        raise ValueError("unsupported source atlas metadata")
    if not metadata.get("assets") or not metadata.get("sheets"):
        raise ValueError("source atlas metadata has no assets or sheets")
    for item in metadata["assets"]:
        if item.get("kind") == "prop":
            profile_id = item.get("exportProfile", {}).get("id", PROP_PROFILE_ID)
            if item.get("exportProfile") != validate_prop_profile(profile_id):
                raise ValueError(f"{item['name']} has missing or stale {profile_id} provenance")
    for sheet_name, dimensions in metadata["sheets"].items():
        with Image.open(ROOT / "art" / "assets" / sheet_name) as sheet:
            if sheet.mode != dimensions["mode"] or sheet.mode != "RGBA":
                raise ValueError(f"{sheet_name} must be RGBA")
            if list(sheet.size) != [dimensions["width"], dimensions["height"]]:
                raise ValueError(f"{sheet_name} dimensions do not match metadata")
    prepared = []
    for item in metadata["assets"]:
        x, y = item["cell"]["x"], item["cell"]["y"]
        width, height = item["width"], item["height"]
        with Image.open(ROOT / "art" / "assets" / item["sheet"]) as sheet:
            if min(x, y) < 0 or x + width > sheet.width or y + height > sheet.height:
                raise ValueError(f"{item['name']} cell is outside {item['sheet']}")
            crop = sheet.crop((x, y, x + width, y + height))
        destination = ROOT / "dist" / item["src"]
        same_pixels = False
        if destination.exists():
            with Image.open(destination) as current:
                current = current.convert("RGBA")
                same_pixels = current.size == crop.size and current.tobytes() == crop.tobytes()
        if check_only and not same_pixels:
            raise ValueError(f"{item['name']} differs from its source atlas cell; run export.py to update dist")
        prepared.append((item, destination, crop, same_pixels))
    if not check_only:
        staged = []
        try:
            for _item, destination, crop, same_pixels in prepared:
                if same_pixels:
                    continue
                destination.parent.mkdir(parents=True, exist_ok=True)
                temporary = destination.with_suffix(".png.tmp")
                crop.save(temporary, format="PNG", optimize=True)
                staged.append((temporary, destination))
            for temporary, destination in staged:
                temporary.replace(destination)
        finally:
            for temporary, _destination in staged:
                temporary.unlink(missing_ok=True)
    action = "verified" if check_only else "exported"
    print(f"{action} {len(metadata['assets'])} asset crops from editable source atlases")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--pack", action="store_true", help="bootstrap atlases from current dist PNGs; refuses to overwrite existing sources")
    group.add_argument("--check", action="store_true", help="verify that atlas cells exactly match the current dist PNGs")
    parser.add_argument("--force", action="store_true", help="allow --pack to replace existing source atlases")
    args = parser.parse_args()
    if args.force and not args.pack:
        parser.error("--force only applies to --pack")
    if args.pack:
        if args.force:
            for path in SOURCE_ROOT.glob("*.png") if SOURCE_ROOT.exists() else []:
                path.unlink()
            if METADATA.exists():
                METADATA.unlink()
            if SOURCE_ROOT.exists():
                SOURCE_ROOT.rmdir()
        pack()
    else:
        export(check_only=args.check)


if __name__ == "__main__":
    main()
