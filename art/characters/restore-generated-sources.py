#!/usr/bin/env python3
"""Reassemble the byte-identical generated PNG inputs from source-archive.json."""
from pathlib import Path
from source_archive import ARCHIVE, write_source
import json

ROOT = Path(__file__).resolve().parents[2]


def main():
    archive = json.loads((ROOT / ARCHIVE).read_text(encoding="utf-8"))
    for source in archive["sources"]:
        target = ROOT / source
        write_source(ROOT, source, target)
        print(f"restored {source} ({target.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
