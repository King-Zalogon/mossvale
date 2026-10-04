"""Synthetic detail, alpha-hole and anchor checks for the follower exporter."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
EXPORTER_PATH = ROOT / "art/characters/export-creature-followers.py"
SPEC = importlib.util.spec_from_file_location("follower_export", EXPORTER_PATH)
EXPORTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EXPORTER)


class FollowerExportTests(unittest.TestCase):
    def test_identifying_details_holes_and_foot_anchor_survive_repeatable_export(self):
        with tempfile.TemporaryDirectory(prefix="mossvale-follower-export-") as folder:
            source_path = Path(folder) / "synthetic-follower.png"
            cell, row_gap = 20, 4
            source = Image.new("RGBA", (cell * 5, cell * 8 + row_gap * 7), (0, 0, 0, 0))
            draw = ImageDraw.Draw(source)
            for row in range(8):
                for column in range(5):
                    x, y = column * cell, row * (cell + row_gap)
                    draw.rectangle((x + 4, y + 2, x + 15, y + 17), fill=(58, 173, 91, 255))
                    draw.point((x + 2, y + 11), fill=(222, 74, 136, 255))  # Thin tail detail.
                    draw.point((x + 13, y + 5), fill=(250, 218, 74, 255))  # Eye/crest detail.
                    draw.point((x + 9, y + 10), fill=(0, 0, 0, 0))  # Enclosed transparent hole.
            source.save(source_path)

            first, _ = EXPORTER.build(source_path, 20, 16, 18, 8, 1, {})
            second, _ = EXPORTER.build(source_path, 20, 16, 18, 8, 1, {})

            self.assertEqual(first.size, (100, 160))
            self.assertEqual(first.tobytes(), second.tobytes(), "same inputs/profile export byte-identically")
            for row in range(8):
                for column in range(5):
                    cell_image = first.crop((column * 20, row * 20, (column + 1) * 20, (row + 1) * 20))
                    pixels = cell_image.load()
                    self.assertEqual(pixels[3, 11], (222, 74, 136, 255), "tail pixel survives normalization")
                    self.assertEqual(pixels[14, 5], (250, 218, 74, 255), "identity pixel survives normalization")
                    self.assertEqual(pixels[10, 10][3], 0, "enclosed transparent hole remains open")
                    self.assertEqual(cell_image.getchannel("A").getbbox()[3], 18, "visible feet share a fixed row anchor")


if __name__ == "__main__":
    unittest.main()
