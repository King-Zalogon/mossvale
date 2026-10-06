"""Regressions for generated landmark source preparation and reproducible previews."""

import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
EXPORTER = ROOT / "art/assets/export-landmark-props.py"
SPEC = importlib.util.spec_from_file_location("landmark_export", EXPORTER)
LANDMARK_EXPORT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(LANDMARK_EXPORT)


class LandmarkExportTests(unittest.TestCase):
    def test_alpha_trim_nearest_fit_keeps_shape_holes_and_exact_rgba(self):
        with tempfile.TemporaryDirectory(prefix="mossvale-landmark-source-") as temp:
            source = Path(temp) / "synthetic.png"
            image = Image.new("RGBA", (500, 200), (0, 0, 0, 0))
            draw = ImageDraw.Draw(image)
            draw.rectangle((50, 20, 449, 179), fill=(90, 120, 70, 255))
            draw.rectangle((175, 70, 250, 130), fill=(0, 0, 0, 0))
            image.putpixel((5, 5), (0, 0, 0, 32))  # threshold-only cast haze must not enlarge the crop
            image.save(source)

            prepared = LANDMARK_EXPORT.prepare(source)

            self.assertEqual(prepared.mode, "RGBA")
            self.assertEqual(prepared.size, (256, 102))
            self.assertEqual(prepared.getpixel((0, 0))[3], 255)
            self.assertEqual(prepared.getpixel((104, 51))[3], 0, "enclosed transparent openings remain open")
            self.assertEqual(prepared.getchannel("A").getbbox(), (0, 0, 256, 102))

    def test_profile_digest_is_versioned_and_refuses_processing_drift(self):
        profile = {
            "category": "prop",
            "status": "implemented",
            "maxPixelEdge": 256,
            "alphaThreshold": 32,
            "resampling": "nearest-neighbor fit to maxPixelEdge",
            "palette": "preserve 8-bit RGBA; no palette quantization",
            "anchor": "bottom-center",
        }
        record = LANDMARK_EXPORT.profile_record(profile)
        self.assertEqual(record["id"], "prop-landmark-v1")
        changed = {**profile, "alphaThreshold": 8}
        with self.assertRaisesRegex(ValueError, "settings are missing or unsupported"):
            LANDMARK_EXPORT.profile_record(changed)

    def test_real_check_verifies_sources_and_outputs_without_writing(self):
        tracked = [
            ROOT / "art/assets/source/props-atlas.png",
            ROOT / "art/assets/metadata.json",
            *sorted((ROOT / "dist/assets/props").glob("prop-*.png")),
            ROOT / "dist/assets/props/tree-oak-hollow.png",
        ]
        before = [(path.read_bytes(), path.stat().st_mtime_ns) for path in tracked]
        result = subprocess.run([sys.executable, str(EXPORTER), "--check"], cwd=ROOT, capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("verified 10 landmark sources", result.stdout)
        self.assertEqual([(path.read_bytes(), path.stat().st_mtime_ns) for path in tracked], before)


if __name__ == "__main__":
    unittest.main()
