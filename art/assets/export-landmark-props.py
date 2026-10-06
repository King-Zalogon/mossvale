#!/usr/bin/env python3
"""Prepare generated landmark sources once and append them to the editable prop atlas."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import os
import tempfile

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
MANIFEST = Path("art/assets/source/landmarks/manifest.json")
PROFILES = Path("art/characters/export-profiles.json")
METADATA = Path("art/assets/metadata.json")
ATLAS = Path("art/assets/source/props-atlas.png")
MAX_EDGE = 256
ALPHA_THRESHOLD = 32
GUTTER = 16


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inside(root: Path, relative: str) -> Path:
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError(f"path escapes repository: {relative}")
    return path


def profile_record(profile: dict) -> dict:
    if (
        profile.get("category") != "prop"
        or profile.get("status") != "implemented"
        or profile.get("maxPixelEdge") != MAX_EDGE
        or profile.get("alphaThreshold") != ALPHA_THRESHOLD
        or profile.get("resampling") != "nearest-neighbor fit to maxPixelEdge"
        or profile.get("palette") != "preserve 8-bit RGBA; no palette quantization"
        or profile.get("anchor") != "bottom-center"
    ):
        raise ValueError("prop-landmark-v1 profile settings are missing or unsupported")
    settings = json.dumps(profile, separators=(",", ":"), ensure_ascii=False).encode()
    return {"id": "prop-landmark-v1", "settingsSha256": hashlib.sha256(settings).hexdigest()}


def prepare(source: Path) -> Image.Image:
    with Image.open(source) as image:
        if image.mode != "RGBA":
            raise ValueError(f"{source} is {image.mode}; expected RGBA")
        sprite = image.copy()
    alpha = sprite.getchannel("A").point(lambda value: 0 if value <= ALPHA_THRESHOLD else value)
    bounds = alpha.getbbox()
    if not bounds:
        raise ValueError(f"{source} has no visible pixels above alpha threshold {ALPHA_THRESHOLD}")
    sprite.putalpha(alpha)
    sprite = sprite.crop(bounds)
    scale = min(1, MAX_EDGE / max(sprite.size))
    if scale < 1:
        size = (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale)))
        sprite = sprite.resize(size, Image.Resampling.NEAREST)
    return sprite


def stage_png(image: Image.Image, target: Path, staged: list[tuple[Path, Path]]) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor, filename = tempfile.mkstemp(prefix=f".{target.name}.", suffix=".tmp", dir=target.parent)
    os.close(descriptor)
    temporary = Path(filename)
    image.save(temporary, format="PNG", optimize=True)
    staged.append((temporary, target))


def load(root: Path) -> tuple[dict, dict, list[tuple[dict, Path, Image.Image]]]:
    manifest = json.loads(inside(root, str(MANIFEST)).read_text(encoding="utf-8"))
    profiles = json.loads(inside(root, str(PROFILES)).read_text(encoding="utf-8"))["profiles"]
    if manifest.get("version") != 1 or manifest.get("exportProfile") != "prop-landmark-v1":
        raise ValueError("unsupported landmark source manifest")
    if profiles.get("prop-landmark-v1") is None:
        raise ValueError("prop-landmark-v1 profile is missing")
    record = profile_record(profiles["prop-landmark-v1"])
    assets = []
    names = set()
    for entry in manifest.get("assets", []):
        name = entry.get("name")
        if not isinstance(name, str) or name in names:
            raise ValueError(f"landmark asset name is missing or duplicated: {name}")
        names.add(name)
        source = inside(root, entry.get("source", ""))
        if sha256(source) != entry.get("sourceSha256"):
            raise ValueError(f"generated source hash mismatch: {entry.get('source')}")
        if entry.get("reference"):
            reference = entry["reference"]
            if sha256(inside(root, reference["path"])) != reference.get("sha256"):
                raise ValueError(f"canonical art reference hash mismatch: {reference['path']}")
        assets.append((entry, source, prepare(source)))
    if len(assets) != 10:
        raise ValueError(f"expected exactly ten landmark sources, found {len(assets)}")
    return manifest, record, assets


def write(root: Path, manifest: dict, record: dict, assets: list[tuple[dict, Path, Image.Image]]) -> None:
    metadata_path = inside(root, str(METADATA))
    atlas_path = inside(root, str(ATLAS))
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    atlas_name = "source/props-atlas.png"
    dimensions = metadata["sheets"][atlas_name]
    existing = {item["name"] for item in metadata["assets"]}
    output_paths = [inside(root, f"dist/assets/props/{entry['name']}.png") for entry, _source, _image in assets]
    collisions = existing.intersection(entry["name"] for entry, _source, _image in assets)
    if collisions or any(path.exists() for path in output_paths):
        raise FileExistsError(f"refusing to overwrite existing landmark assets: {sorted(collisions)}")

    sheet_width, sheet_height = dimensions["width"], dimensions["height"]
    cells = []
    x, y, row_height = 0, sheet_height + GUTTER, 0
    for entry, source, sprite in sorted(assets, key=lambda item: item[0]["name"]):
        if sprite.width > sheet_width:
            raise ValueError(f"{entry['name']} is wider than the prop atlas")
        if x and x + sprite.width > sheet_width:
            x, y, row_height = 0, y + row_height + GUTTER, 0
        cells.append((entry, source, sprite, (x, y)))
        x += sprite.width + GUTTER
        row_height = max(row_height, sprite.height)
    new_height = y + row_height

    with Image.open(atlas_path) as original:
        if original.mode != "RGBA" or original.size != (sheet_width, sheet_height):
            raise ValueError("props source atlas does not match metadata")
        expanded = Image.new("RGBA", (sheet_width, new_height), (0, 0, 0, 0))
        expanded.paste(original, (0, 0))
    for entry, source, sprite, cell in cells:
        expanded.paste(sprite, cell)
        metadata["assets"].append(
            {
                "name": entry["name"],
                "src": f"assets/props/{entry['name']}.png",
                "folder": "props",
                "kind": "prop",
                "width": sprite.width,
                "height": sprite.height,
                "anchor": "bottom-center",
                "sheet": atlas_name,
                "cell": {"x": cell[0], "y": cell[1]},
                "frames": None,
                "provenance": {
                    "editablePixelSource": "art/assets/source atlas cell",
                    "originalGeneratedReferences": [entry["source"]],
                    "originalGenerationSourceAvailable": True,
                    "sourceSha256": entry["sourceSha256"],
                    "promptSummary": entry["promptSummary"],
                },
                "exportProfile": record,
            }
        )
    metadata["sheets"][atlas_name] = {"width": sheet_width, "height": new_height, "mode": "RGBA"}
    metadata["assets"].sort(key=lambda item: item["name"])

    staged: list[tuple[Path, Path]] = []
    try:
        for (entry, _source, sprite), target in zip(assets, output_paths):
            stage_png(sprite, target, staged)
        stage_png(expanded, atlas_path, staged)
        metadata_bytes = (json.dumps(metadata, indent=2, ensure_ascii=False) + "\n").encode()
        metadata_target = metadata_path
        metadata_target.parent.mkdir(parents=True, exist_ok=True)
        descriptor, filename = tempfile.mkstemp(prefix=f".{metadata_target.name}.", suffix=".tmp", dir=metadata_target.parent)
        os.close(descriptor)
        metadata_temporary = Path(filename)
        metadata_temporary.write_bytes(metadata_bytes)
        staged.append((metadata_temporary, metadata_target))
        for temporary, target in staged:
            temporary.replace(target)
    finally:
        for temporary, _target in staged:
            temporary.unlink(missing_ok=True)


def check(root: Path, record: dict, assets: list[tuple[dict, Path, Image.Image]]) -> None:
    metadata = json.loads(inside(root, str(METADATA)).read_text(encoding="utf-8"))
    by_name = {item["name"]: item for item in metadata["assets"]}
    atlas_path = inside(root, str(ATLAS))
    with Image.open(atlas_path) as atlas:
        if atlas.mode != "RGBA":
            raise ValueError("props source atlas must be RGBA")
        for entry, _source, expected in assets:
            item = by_name.get(entry["name"])
            if not item:
                raise ValueError(f"{entry['name']} is absent from art/assets/metadata.json")
            if item.get("exportProfile") != record:
                raise ValueError(f"{entry['name']} has missing or stale prop-landmark-v1 provenance")
            if item.get("provenance", {}).get("originalGeneratedReferences") != [entry["source"]]:
                raise ValueError(f"{entry['name']} generated source reference is missing")
            output_path = inside(root, f"dist/assets/props/{entry['name']}.png")
            with Image.open(output_path) as output:
                if output.mode != "RGBA" or output.size != expected.size or output.tobytes() != expected.tobytes():
                    raise ValueError(f"{entry['name']} differs from its generated-source preparation")
            x, y = item["cell"]["x"], item["cell"]["y"]
            crop = atlas.crop((x, y, x + item["width"], y + item["height"]))
            if crop.size != expected.size or crop.tobytes() != expected.tobytes():
                raise ValueError(f"{entry['name']} differs from its editable prop-atlas cell")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--write", action="store_true", help="prepare and add the ten new assets; refuses to overwrite existing art")
    group.add_argument("--check", action="store_true", help="verify source hashes and exact generated, atlas, and runtime pixels without writing")
    parser.add_argument("--root", type=Path, default=ROOT, help=argparse.SUPPRESS)
    args = parser.parse_args()
    manifest, record, assets = load(args.root)
    if args.write:
        write(args.root, manifest, record, assets)
        check(args.root, record, assets)
        print(f"prepared and registered {len(assets)} landmark props with {record['id']}")
    else:
        check(args.root, record, assets)
        print(f"verified {len(assets)} landmark sources, runtime sprites and editable atlas crops")


if __name__ == "__main__":
    main()
