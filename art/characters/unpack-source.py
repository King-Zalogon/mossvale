"""View a chunked generated source: `npm run art:unpack -- <repo-relative source path> [--out FILE]`.

Reassembles the PNG from art/characters/source-archive.json (size and SHA-256 verified) into .unpacked/<path>
(git-ignored) unless --out is given, and prints the path. Sources that exist as plain files are copied unchanged.
"""
import argparse
from pathlib import Path

from source_archive import write_source

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", help="repo-relative path of the source image, e.g. art/characters/source/blastoucan/combat-generated.png")
    parser.add_argument("--out", help="output file (default: .unpacked/<source>)")
    args = parser.parse_args()
    target = Path(args.out) if args.out else ROOT / ".unpacked" / args.source
    target.parent.mkdir(parents=True, exist_ok=True)
    write_source(ROOT, args.source, target)
    print(target)


if __name__ == "__main__":
    main()
