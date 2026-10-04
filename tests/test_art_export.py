"""Failure-path checks for the multi-species non-destructive combat exporter."""
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
import zlib
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
EXPORTER = ROOT / "art/characters/export-creature-combat.py"
SPECIES = ["emberkin", "voltkit", "fernling", "duskwing", "brooklet", "hushram", "mushmallow", "frostowl", "pebblit", "bramblebuck", "siltkip", "sunskitter"]


def png_chunk(name, payload):
    body = name + payload
    return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)


def source_png():
    width, height = 40, 40
    pixels = bytearray()
    for y in range(height):
        pixels.append(0)
        for x in range(width):
            cell_x, cell_y = x % 10, y % 8
            if cell_x == 1 and cell_y == 4:
                pixels.extend((245, 80, 160, 255))
            elif 2 <= cell_x < 8 and 2 <= cell_y < 7 and (cell_x, cell_y) != (4, 4):
                if (cell_x, cell_y) == (5, 3):
                    pixels.extend((255, 225, 40, 255))
                else:
                    pixels.extend((40, 180, 90, 255))
            else:
                pixels.extend((0, 0, 0, 0))
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", ihdr) + png_chunk(b"IDAT", zlib.compress(pixels)) + png_chunk(b"IEND", b"")


class CombatExportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="mossvale-art-export-")
        self.root = Path(self.temp.name)
        self.profile = {
            "schemaVersion": 1,
            "profiles": {
                "creature-combat-v1": {
                    "sourceGrid": {"columns": 4, "rows": 5},
                    "frameSizes": {
                        "emberkin": [12, 10],
                        "voltkit": [12, 10],
                        "fernling": [12, 10],
                        "duskwing": [12, 10],
                        "brooklet": [12, 10],
                        "hushram": [12, 10],
                        "mushmallow": [12, 10],
                        "frostowl": [12, 10],
                        "pebblit": [12, 10],
                        "bramblebuck": [12, 10],
                        "siltkip": [12, 10],
                        "sunskitter": [12, 10],
                    },
                    "resampling": "none",
                    "alphaThreshold": 8,
                    "footInset": 1,
                }
            },
        }
        profiles = self.root / "art/characters/export-profiles.json"
        profiles.parent.mkdir(parents=True)
        profiles.write_text(json.dumps(self.profile))
        self.source_dir = self.root / "art/characters/source"
        self.source_dir.mkdir(parents=True)
        self.target_dir = self.root / "dist/assets/creatures"
        self.sources = [self.source_dir / f"creature-{species}-combat-generated.png" for species in SPECIES]
        self.targets = [self.target_dir / f"creature-{species}-combat.png" for species in SPECIES]

    def tearDown(self):
        self.temp.cleanup()

    def write_sources(self, count=None):
        paths = self.sources if count is None else self.sources[:count]
        for path in paths:
            path.write_bytes(source_png())

    def run_export(self, *args):
        return subprocess.run(
            [sys.executable, str(EXPORTER), "--root", str(self.root), *args],
            capture_output=True,
            text=True,
            check=False,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
        )

    def test_source_failure_does_not_partially_replace_runtime_outputs(self):
        self.write_sources(count=1)
        self.target_dir.mkdir(parents=True)
        originals = [f"existing-{index}".encode() for index in range(len(self.targets))]
        for target, contents in zip(self.targets, originals):
            target.write_bytes(contents)

        result = self.run_export()

        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertEqual([path.read_bytes() for path in self.targets], originals)
        self.assertFalse(list(self.target_dir.glob("*.tmp")))

    def test_check_mode_does_not_create_missing_output_directories(self):
        self.write_sources()
        preview = self.root / "review/stages"

        result = self.run_export("--check", "--preview-dir", str(preview))

        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertFalse(self.target_dir.exists())
        self.assertTrue((preview / "index.html").is_file())
        self.assertTrue((preview / "fernling-runtime.png").is_file())

    def test_export_is_repeatable_and_successful_check_leaves_outputs_untouched(self):
        self.write_sources()
        exported = self.run_export()
        self.assertEqual(exported.returncode, 0, exported.stderr)
        before = [(path.read_bytes(), path.stat().st_mtime_ns) for path in self.targets]

        checked = self.run_export("--check")

        self.assertEqual(checked.returncode, 0, checked.stderr)
        self.assertEqual([(path.read_bytes(), path.stat().st_mtime_ns) for path in self.targets], before)

        with Image.open(self.targets[0]) as output:
            output = output.convert("RGBA")
            self.assertEqual(output.getpixel((2, 6)), (245, 80, 160, 255), "thin tail pixel must survive")
            self.assertEqual(output.getpixel((6, 5)), (255, 225, 40, 255), "identity detail pixel must survive")
            self.assertEqual(output.getpixel((5, 6))[3], 0, "enclosed transparent hole must survive")

    def test_stage_preview_keeps_raw_source_and_side_by_side_export_stages(self):
        self.write_sources()
        exported = self.run_export()
        self.assertEqual(exported.returncode, 0, exported.stderr)
        preview = self.root / "review/stages"

        checked = self.run_export("--check", "--preview-dir", str(preview))

        self.assertEqual(checked.returncode, 0, checked.stderr)
        self.assertEqual((preview / "fernling-raw.png").read_bytes(), self.sources[0].read_bytes())
        self.assertEqual((preview / "fernling-runtime.png").read_bytes(), self.targets[0].read_bytes())
        for species in SPECIES:
            for stage in ["raw", "segmented", "anchored", "runtime"]:
                self.assertTrue((preview / f"{species}-{stage}.png").is_file())
        page = (preview / "index.html").read_text()
        for stage in ["Raw source", "Segmented cells", "Anchored candidate", "Runtime output"]:
            self.assertIn(stage, page)
        self.assertIn("resampling: none", page)


if __name__ == "__main__":
    unittest.main()
