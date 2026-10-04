"""Read immutable generated PNG sources stored as bounded binary chunks."""
from hashlib import sha256
import json
from pathlib import Path

ARCHIVE = Path("art/characters/source-archive.json")


def source_bytes(root, source):
    root = Path(root)
    source = Path(source)
    path = source if source.is_absolute() else root / source
    if path.is_file():
        return path.read_bytes()
    try:
        source_key = path.relative_to(root).as_posix()
        archive = json.loads((root / ARCHIVE).read_text(encoding="utf-8"))
        record = archive["sources"][source_key]
        data = b"".join((root / part).read_bytes() for part in record["parts"])
    except (OSError, KeyError, ValueError) as exc:
        raise FileNotFoundError(f"generated source missing and not present in {ARCHIVE}: {source}") from exc
    if len(data) != record["bytes"] or sha256(data).hexdigest() != record["sha256"]:
        raise ValueError(f"generated source archive failed its size/SHA-256 check: {source_key}")
    return data


def write_source(root, source, target):
    Path(target).write_bytes(source_bytes(root, source))
