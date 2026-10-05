"""Player motion source-row and walk-override export contract."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
EXPORTER_PATH = ROOT / "art/characters/export.py"
SPEC = importlib.util.spec_from_file_location("player_motion_export", EXPORTER_PATH)
EXPORTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EXPORTER)


class PlayerMotionExportTests(unittest.TestCase):
    def test_directional_walk_overrides_preserve_base_idle_and_other_rows(self):
        with tempfile.TemporaryDirectory(prefix="mossvale-player-motion-") as directory:
            source_dir = Path(directory)
            source_names = [
                "person-red-cap-motion-north-northeast.png",
                "person-red-cap-motion-east-southeast.png",
                "person-red-cap-motion-south-southwest.png",
                "person-red-cap-motion-west-northwest.png",
                "person-red-cap-motion-northeast-v2.png",
                "person-red-cap-motion-southwest-v2.png",
            ]
            file_ids = {name: index + 1 for index, name in enumerate(source_names)}
            for name, file_id in file_ids.items():
                sheet = Image.new("RGBA", (500, 200))
                for row in range(2):
                    for column in range(5):
                        color = (file_id * 20, 30 + row * 60, 40 + column * 30, 255)
                        sheet.paste(color, (column * 100, row * 100, (column + 1) * 100, (row + 1) * 100))
                sheet.save(source_dir / name)

            atlas = EXPORTER.export_player(source_dir)

            self.assertEqual(atlas.size, (800, 2048))
            row_sources = [
                (source_names[0], 0),
                (source_names[0], 1),
                (source_names[1], 0),
                (source_names[1], 1),
                (source_names[2], 0),
                (source_names[2], 1),
                (source_names[3], 0),
                (source_names[3], 1),
            ]
            override_sources = {1: source_names[4], 5: source_names[5]}
            for row, (base_name, base_source_row) in enumerate(row_sources):
                for column in range(5):
                    filename = override_sources.get(row, base_name) if column > 0 else base_name
                    source_row = 1 if column > 0 and row in override_sources else base_source_row
                    expected = (file_ids[filename] * 20, 30 + source_row * 60, 40 + column * 30, 255)
                    self.assertEqual(atlas.getpixel((column * 160 + 80, row * 256 + 200)), expected, f"row {row}, column {column}")

    def test_export_syncs_only_the_player_crop_in_the_editable_people_atlas(self):
        with tempfile.TemporaryDirectory(prefix="mossvale-player-source-atlas-") as directory:
            source_atlas_path = Path(directory) / "people-atlas.png"
            background = (17, 28, 39, 255)
            Image.new("RGBA", (900, 2100), background).save(source_atlas_path)
            player = Image.new("RGBA", (800, 2048), (80, 120, 160, 255))

            EXPORTER.sync_player_source_atlas(player, check_only=False, source_atlas_path=source_atlas_path)
            with Image.open(source_atlas_path) as updated:
                self.assertEqual(updated.crop((0, 0, 800, 2048)).tobytes(), player.tobytes())
                self.assertEqual(updated.getpixel((850, 2050)), background)

            EXPORTER.sync_player_source_atlas(player, check_only=True, source_atlas_path=source_atlas_path)
            with self.assertRaisesRegex(SystemExit, "player crop differs"):
                EXPORTER.sync_player_source_atlas(Image.new("RGBA", player.size, (1, 2, 3, 255)), check_only=True, source_atlas_path=source_atlas_path)


if __name__ == "__main__":
    unittest.main()
