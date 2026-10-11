#!/usr/bin/env python3
"""Import or verify third-party art whose exact license is recorded in registry.json."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import zipfile

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
REGISTRY = ROOT / "art/assets/third-party/registry.json"
METADATA = ROOT / "art/assets/metadata.json"
ASSET_MODULE = ROOT / "dist/src/data/assets.js"
ATLAS_RELATIVE = "third-party/reactorcore-nature-surface-atlas.png"
GUTTER = 16
SHEET_WIDTH = 1024


def digest(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def read_registry() -> tuple[dict, dict, list[dict], bytes]:
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    if registry.get("format") != 1 or len(registry.get("packages", [])) != 1:
        raise ValueError("expected registry format 1 with exactly one package")
    package = registry["packages"][0]
    if package.get("id") != "reactorcore-nature-surface":
        raise ValueError("unexpected source package ID")
    if package.get("license") != "CC0 1.0 Universal" or package.get("licenseUrl") != "https://creativecommons.org/publicdomain/zero/1.0/":
        raise ValueError("source license record must identify CC0 1.0 Universal")
    archive_path = ROOT / package["archive"]["path"]
    archive = archive_path.read_bytes()
    if digest(archive) != package["archive"]["sha256"]:
        raise ValueError("source archive SHA-256 does not match registry.json")
    ids: set[str] = set()
    members: set[str] = set()
    for asset in package["assets"]:
        name = asset["name"]
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name) or name in ids:
            raise ValueError(f"invalid or duplicate runtime asset ID: {name}")
        ids.add(name)
        if asset["kind"] not in {"prop", "item"}:
            raise ValueError(f"unsupported imported asset kind for {name}")
        if asset["kind"] == "item" and not name.startswith("item-"):
            raise ValueError(f"item ID must begin with item-: {name}")
        if asset["kind"] == "prop" and name.startswith(("item-", "creature-", "person-")):
            raise ValueError(f"prop ID uses a reserved prefix: {name}")
        member = asset["sourceMember"]
        if member in members or ".." in Path(member).parts or member.startswith("/"):
            raise ValueError(f"duplicate or unsafe source archive path: {member}")
        members.add(member)
        for field in ["description", "intendedUse", "limitations"]:
            if not str(asset.get(field, "")).strip():
                raise ValueError(f"{name}: {field} is required")
        if asset.get("usedInGame", False) not in {True, False}:
            raise ValueError(f"{name}: usedInGame must be boolean")
    return registry, package, sorted(package["assets"], key=lambda asset: asset["name"]), archive


def source_images(package: dict, assets: list[dict], archive: bytes) -> list[tuple[dict, bytes, Image.Image]]:
    found = []
    with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
        for asset in assets:
            try:
                content = bundle.read(asset["sourceMember"])
            except KeyError as error:
                raise ValueError(f"missing archive member for {asset['name']}: {asset['sourceMember']}") from error
            image = Image.open(io.BytesIO(content))
            if image.format != "PNG" or image.mode != "RGBA":
                raise ValueError(f"{asset['sourceMember']} must be an RGBA PNG, got {image.format} {image.mode}")
            if image.getchannel("A").getbbox() != (0, 0, image.width, image.height):
                raise ValueError(f"{asset['sourceMember']} has transparent outer padding; don't change crop silently")
            if digest(content) != asset.get("sourceSha256"):
                raise ValueError(f"source hash is missing or stale for {asset['name']}; run with --write")
            if [image.width, image.height] != asset.get("sourceDimensions"):
                raise ValueError(f"source dimensions are missing or stale for {asset['name']}; run with --write")
            found.append((asset, content, image.copy()))
    return found


def atlas_for(images: list[tuple[dict, bytes, Image.Image]]) -> tuple[Image.Image, dict[str, dict]]:
    placements = {}
    x = y = row_height = 0
    for asset, _content, image in images:
        if x and x + image.width > SHEET_WIDTH:
            x = 0
            y += row_height + GUTTER
            row_height = 0
        placements[asset["name"]] = {"x": x, "y": y}
        x += image.width + GUTTER
        row_height = max(row_height, image.height)
    width = max(cell["x"] + next(image.width for asset, _raw, image in images if asset["name"] == name) for name, cell in placements.items())
    height = max(cell["y"] + next(image.height for asset, _raw, image in images if asset["name"] == name) for name, cell in placements.items())
    sheet = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    for asset, _content, image in images:
        sheet.paste(image, (placements[asset["name"]]["x"], placements[asset["name"]]["y"]))
    return sheet, placements


def metadata_entry(asset: dict, image: Image.Image, cell: dict, profile_hash: str) -> dict:
    kind_folder = {"prop": "props", "item": "items"}[asset["kind"]]
    entry = {
        "name": asset["name"],
        "src": f"assets/{kind_folder}/{asset['name']}.png",
        "folder": kind_folder,
        "kind": asset["kind"],
        "width": image.width,
        "height": image.height,
        "anchor": "bottom-center",
        "sheet": ATLAS_RELATIVE,
        "cell": {**cell},
        "frames": None,
        "provenance": {
            "editablePixelSource": "art/assets/third-party/reactorcore-nature-surface-atlas.png cell",
            "originalGeneratedReferences": [],
            "originalGenerationSourceAvailable": False,
            "externalSourceId": "reactorcore-nature-surface",
        },
    }
    if asset["kind"] == "prop":
        entry["exportProfile"] = {"id": "prop-static-v1", "settingsSha256": profile_hash}
    return entry


def manifest_line(asset: dict, image: Image.Image) -> str:
    folder = {"prop": "props", "item": "items"}[asset["kind"]]
    required = bool(asset.get("usedInGame", False))
    return (
        f"  {{name: '{asset['name']}', kind: '{asset['kind']}', src: 'assets/{folder}/{asset['name']}.png', "
        f"w: {image.width}, h: {image.height}, anchor: 'bottom-center', required: {str(required).lower()}}}"
    )


def verify_manifest(assets: list[dict], images: list[tuple[dict, bytes, Image.Image]]) -> None:
    content = ASSET_MODULE.read_text(encoding="utf-8")
    image_by_id = {asset["name"]: image for asset, _raw, image in images}
    for asset in assets:
        expected = manifest_line(asset, image_by_id[asset["name"]])
        if expected not in content:
            raise ValueError(f"{asset['name']} is missing or incorrect in dist/src/data/assets.js")


def update_manifest(assets: list[dict], images: list[tuple[dict, bytes, Image.Image]]) -> None:
    content = ASSET_MODULE.read_text(encoding="utf-8")
    names = "|".join(re.escape(asset["name"]) for asset in assets)
    content = re.sub(rf"^\s*\{{name: '(?:{names})',.*\n", "", content, flags=re.M)
    close = content.rfind("];\n")
    if close < 0:
        raise ValueError("could not find the end of the asset manifest")
    block = "\n".join(manifest_line(asset, image) + "," for asset, _raw, image in images) + "\n"
    ASSET_MODULE.write_text(content[:close] + block + content[close:], encoding="utf-8")


def update_metadata_source_hashes() -> None:
    subjects_path = ROOT / "art/assets/subjects.json"
    subjects = json.loads(subjects_path.read_text(encoding="utf-8"))
    metadata_hash = digest(METADATA.read_bytes())
    for subject in subjects.get("subjects", []):
        record = subject.get("sourceNotes", {})
        if record.get("path") == "art/assets/metadata.json":
            record["sha256"] = metadata_hash
    subjects_path.write_text(json.dumps(subjects, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    reviews_path = ROOT / "art/characters/visual-reviews.json"
    reviews = json.loads(reviews_path.read_text(encoding="utf-8"))
    source_hashes = {
        "art/assets/metadata.json": metadata_hash,
        "art/assets/subjects.json": digest(subjects_path.read_bytes()),
    }
    for subject in reviews.get("subjects", []):
        for record in subject.get("reviewedFiles", []):
            if record.get("path") in source_hashes:
                record["sha256"] = source_hashes[record["path"]]
    reviews_path.write_text(json.dumps(reviews, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def update_registry(registry: dict, assets: list[dict], archive: bytes) -> None:
    package = registry["packages"][0]
    package["archive"]["sha256"] = digest(archive)
    with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
        for asset in assets:
            content = bundle.read(asset["sourceMember"])
            image = Image.open(io.BytesIO(content))
            asset["sourceSha256"] = digest(content)
            asset["sourceDimensions"] = [image.width, image.height]


def write_outputs(registry: dict, package: dict, assets: list[dict], archive: bytes, images: list[tuple[dict, bytes, Image.Image]], sheet: Image.Image, placements: dict[str, dict]) -> None:
    profiles = json.loads((ROOT / "art/characters/export-profiles.json").read_text(encoding="utf-8"))["profiles"]
    profile = profiles["prop-static-v1"]
    profile_hash = hashlib.sha256(json.dumps(profile, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    metadata = json.loads(METADATA.read_text(encoding="utf-8"))
    metadata.setdefault("sheets", {})[ATLAS_RELATIVE] = {"width": sheet.width, "height": sheet.height, "mode": "RGBA"}
    metadata["assets"] = [entry for entry in metadata["assets"] if entry.get("provenance", {}).get("externalSourceId") != package["id"]]
    for asset, _raw, image in images:
        metadata["assets"].append(metadata_entry(asset, image, placements[asset["name"]], profile_hash))
    metadata["assets"].sort(key=lambda entry: entry["name"])

    atlas_target = ROOT / "art/assets" / ATLAS_RELATIVE
    atlas_target.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(atlas_target, format="PNG", optimize=True)
    METADATA.write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    update_metadata_source_hashes()
    REGISTRY.write_text(json.dumps(registry, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    for asset, _raw, image in images:
        folder = {"prop": "props", "item": "items"}[asset["kind"]]
        target = ROOT / "dist/assets" / folder / f"{asset['name']}.png"
        target.parent.mkdir(parents=True, exist_ok=True)
        image.save(target, format="PNG", optimize=True)
    update_manifest(assets, images)


def check_outputs(package: dict, assets: list[dict], archive: bytes, images: list[tuple[dict, bytes, Image.Image]], sheet: Image.Image, placements: dict[str, dict]) -> None:
    atlas_path = ROOT / "art/assets" / ATLAS_RELATIVE
    if not atlas_path.exists():
        raise ValueError(f"missing {atlas_path.relative_to(ROOT)}; run with --write")
    with Image.open(atlas_path) as actual:
        actual = actual.convert("RGBA")
        if actual.size != sheet.size or actual.tobytes() != sheet.tobytes():
            raise ValueError("third-party editable atlas is stale; run with --write")
    metadata = json.loads(METADATA.read_text(encoding="utf-8"))
    listed = {asset["name"]: asset for asset in metadata.get("assets", [])}
    for asset, _raw, image in images:
        item = listed.get(asset["name"])
        if not item or item.get("provenance", {}).get("externalSourceId") != package["id"]:
            raise ValueError(f"{asset['name']} source metadata is missing; run with --write")
        expected = metadata_entry(asset, image, placements[asset["name"]], item.get("exportProfile", {}).get("settingsSha256", ""))
        for key in ["name", "src", "folder", "kind", "width", "height", "anchor", "sheet", "cell", "provenance"]:
            if item.get(key) != expected.get(key):
                raise ValueError(f"{asset['name']} source metadata field {key} is stale; run with --write")
        folder = {"prop": "props", "item": "items"}[asset["kind"]]
        output_path = ROOT / "dist/assets" / folder / f"{asset['name']}.png"
        if not output_path.exists():
            raise ValueError(f"missing runtime export {output_path.relative_to(ROOT)}; run with --write")
        with Image.open(output_path) as output:
            output = output.convert("RGBA")
            if output.size != image.size or output.tobytes() != image.tobytes():
                raise ValueError(f"runtime asset {asset['name']} differs from original source pixels")
    verify_manifest(assets, images)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--write", action="store_true", help="write source atlas, source metadata, source hashes and runtime pixel crops")
    group.add_argument("--check", action="store_true", help="verify source archive, license registry, atlas, runtime crops and manifest")
    args = parser.parse_args()
    registry, package, assets, archive = read_registry()
    if args.write:
        update_registry(registry, assets, archive)
        images = source_images(package, assets, archive)
        sheet, placements = atlas_for(images)
        write_outputs(registry, package, assets, archive, images, sheet, placements)
        print(f"Imported {len(assets)} pixel-preserved assets from {package['title']}")
        return
    if not args.check:
        parser.error("choose --write or --check")
    images = source_images(package, assets, archive)
    sheet, placements = atlas_for(images)
    check_outputs(package, assets, archive, images, sheet, placements)
    print(f"Verified {len(assets)} assets from {package['title']} ({package['license']})")


if __name__ == "__main__":
    main()
