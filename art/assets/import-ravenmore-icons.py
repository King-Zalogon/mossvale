#!/usr/bin/env python3
"""Verify the individually retained Ravenmore icons and their game-only use."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
REGISTRY = ROOT / "art/assets/third-party/registry.json"
METADATA = ROOT / "art/assets/metadata.json"
MANIFEST = ROOT / "dist/src/data/assets.js"
DIST_ASSETS = ROOT / "dist"
PACKAGE_ID = "ravenmore-survival-crafting-icons-01"
EXPECTED = {"wood-plank-stack", "wood-firewood-bundle", "straw-bundle"}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    package = next((item for item in registry.get("packages", []) if item.get("id") == PACKAGE_ID), None)
    if not package:
        raise ValueError(f"missing registry package {PACKAGE_ID}")
    if package.get("archive"):
        raise ValueError("do not retain or publish the complete source archive under the no-bundling terms")
    assets = package.get("assets", [])
    if {asset.get("name") for asset in assets} != EXPECTED:
        raise ValueError("the retained set must stay limited to the three map props reviewed for this issue")
    if package.get("permissions", {}).get("personalGameUse") != "permitted":
        raise ValueError("the record must preserve the creator's in-game permission")
    if package.get("permissions", {}).get("publicRepositoryRedistribution") != "game-embedded use only; no standalone pack redistribution":
        raise ValueError("the record must preserve the no-bundling limitation")
    metadata = json.loads(METADATA.read_text(encoding="utf-8"))
    metadata_by_name = {asset["name"]: asset for asset in metadata.get("assets", [])}
    manifest_text = MANIFEST.read_text(encoding="utf-8")
    retained_paths = set()
    for asset in assets:
        where = asset["name"]
        path = Path(asset["sourceFile"])
        if path.is_absolute() or ".." in path.parts or path.as_posix() in retained_paths:
            raise ValueError(f"{where}: unsafe or duplicate source path")
        retained_paths.add(path.as_posix())
        source = ROOT / "art/assets" / path
        data = source.read_bytes()
        if sha256(data) != asset.get("sourceSha256"):
            raise ValueError(f"{where}: retained source hash mismatch")
        with Image.open(source) as image:
            if image.format != "PNG" or image.mode != "RGBA" or list(image.size) != asset.get("sourceDimensions"):
                raise ValueError(f"{where}: source must match its recorded RGBA PNG dimensions")
        record = metadata_by_name.get(where)
        if not record or record.get("sourceFile") != path.as_posix() or record.get("sourceSha256") != asset["sourceSha256"]:
            raise ValueError(f"{where}: direct-source metadata is missing or stale")
        if record.get("sheet") is not None:
            raise ValueError(f"{where}: source image must not be repacked into a sprite sheet")
        manifest_entry = f"name: '{where}'"
        manifest_at = manifest_text.find(manifest_entry)
        manifest_end = manifest_text.find("}", manifest_at)
        if manifest_at < 0 or manifest_end < 0 or "portablePreviewAllowed: false" not in manifest_text[manifest_at:manifest_end]:
            raise ValueError(f"{where}: manifest entry must block portable preview export")
        output = DIST_ASSETS / "assets/props" / f"{where}.png"
        with Image.open(source) as source_image, Image.open(output) as output_image:
            source_image = source_image.convert("RGBA")
            output_image = output_image.convert("RGBA")
            if source_image.size != output_image.size or source_image.tobytes() != output_image.tobytes():
                raise ValueError(f"{where}: runtime prop differs from the original source pixels")
    source_dir = ROOT / "art/assets/third-party/ravenmore-resource-icons-01"
    allowed_files = {Path(x).name for x in retained_paths} | {"README.md"}
    extra = [path.name for path in source_dir.iterdir() if path.is_file() and path.name not in allowed_files]
    if extra:
        raise ValueError(f"do not retain non-selected pack files: {', '.join(sorted(extra))}")
    print(f"Verified {len(assets)} separate Ravenmore source icons and game-only distribution limits")


if __name__ == "__main__":
    main()
