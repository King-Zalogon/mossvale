"""Fixed-cell portrait normalization keeps transparent padding and planted feet."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
EXPORTER_PATH = ROOT / "art/characters/export-creature-portraits.py"
SPEC = importlib.util.spec_from_file_location("creature_portrait_export", EXPORTER_PATH)
EXPORTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EXPORTER)


class CreaturePortraitExportTests(unittest.TestCase):
    def test_portraits_fit_fixed_cell_with_transparency_and_shared_ground_anchor(self):
        with tempfile.TemporaryDirectory(prefix="mossvale-creature-portrait-") as folder:
            root = Path(folder)
            source_path = root / "source.png"
            source = Image.new("RGBA", (100, 120), (0, 0, 0, 0))
            draw = ImageDraw.Draw(source)
            draw.rectangle((20, 10, 78, 98), fill=(60, 150, 72, 255))
            source.putpixel((21, 11), (246, 195, 63, 255))
            source.save(source_path)
            result = EXPORTER.build(root, {"source": "source.png"})

            self.assertEqual(result.size, (175, 264))
            self.assertEqual(result.getchannel("A").getbbox(), (0, 0, 175, 264), "runtime portraits are tightly cropped")
            self.assertEqual(result.getpixel((4, 4)), (246, 195, 63, 255), "nearest-neighbor identity detail survives")

    def test_addition_atlas_has_even_cells_and_transparent_gutters(self):
        frames = {name: Image.new("RGBA", EXPORTER.FRAME, (index + 1, 2, 3, 255)) for index, name in enumerate(["first", "second", "third"])}
        atlas = EXPORTER.build_atlas(frames)
        self.assertEqual(atlas.size, (896, 288))
        self.assertEqual(atlas.getpixel((0, 0)), (1, 2, 3, 255))
        self.assertEqual(atlas.getpixel((288, 0))[3], 0)
        self.assertEqual(atlas.getpixel((304, 0)), (2, 2, 3, 255))


if __name__ == "__main__":
    unittest.main()
