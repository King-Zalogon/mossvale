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
    @staticmethod
    def red_boot_span(cell):
        pixels = cell.load()
        points = []
        for y in range(round(cell.height * 0.86), cell.height):
            for x in range(cell.width):
                red, green, blue, alpha = pixels[x, y]
                if alpha > 80 and red > 70 and red > green * 1.25 and red > blue * 1.2:
                    points.append(x)
        return max(points) - min(points) + 1 if points else 0

    def test_neutral_idle_poses_narrow_the_rest_stance_and_keep_one_foot_line(self):
        atlas = EXPORTER.export_player()
        narrower_directions = 0
        for row, (source_name, source_row, _) in enumerate(EXPORTER.PLAYER_ROWS):
            sheet = Image.open(EXPORTER.SOURCE / source_name).convert("RGBA")
            y0, y1 = round(source_row * sheet.height / 2), round((source_row + 1) * sheet.height / 2)
            original = EXPORTER.fit_person(
                sheet.crop((0, y0, round(sheet.width / 5), y1)),
                EXPORTER.PLAYER_PROFILE["maxSprite"][1],
                max_width=EXPORTER.PLAYER_PROFILE["maxSprite"][0],
                alpha_threshold=EXPORTER.PLAYER_PROFILE["alphaThreshold"],
            )
            current = atlas.crop((0, row * EXPORTER.CELL[1], EXPORTER.CELL[0], (row + 1) * EXPORTER.CELL[1]))
            original_span = self.red_boot_span(original)
            current_span = self.red_boot_span(current)
            self.assertGreater(original_span, 0, f"direction row {row} has visible original boots")
            self.assertGreater(current_span, 0, f"direction row {row} has visible neutral boots")
            self.assertLessEqual(current_span, original_span + 1, f"direction row {row} does not widen the stance")
            narrower_directions += current_span + 4 < original_span
            bounds = current.getchannel("A").point(lambda value: 255 if value > 8 else 0).getbbox()
            self.assertIsNotNone(bounds, f"direction row {row} idle art is visible")
            self.assertEqual(bounds[3], EXPORTER.FOOT_Y, f"direction row {row} rests on the shared foot anchor")
        self.assertGreaterEqual(narrower_directions, 4, "the authored neutral pose visibly narrows the original stride-like stance in at least four facings")

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
                "person-red-cap-motion-west-alternate-stride-v1.png",
                "person-red-cap-neutral-idle-v1.png",
            ]
            file_ids = {name: index + 1 for index, name in enumerate(source_names)}
            for name, file_id in file_ids.items():
                idle_sheet = name == "person-red-cap-neutral-idle-v1.png"
                columns = 4 if idle_sheet else 5
                sheet = Image.new("RGBA", (columns * 100, 200))
                for row in range(2):
                    for column in range(columns):
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
            idle_source = source_names[7]
            for row, (base_name, base_source_row) in enumerate(row_sources):
                for column in range(5):
                    pose = EXPORTER.PLAYER_WALK_FRAME_OVERRIDES.get(row, {}).get(column) if column > 0 else None
                    if column == 0:
                        filename = idle_source
                        source_row, source_column = EXPORTER.PLAYER_IDLE_CELLS[row]
                    else:
                        filename = pose or override_sources.get(row, base_name)
                        source_row = 0 if pose else (1 if row in override_sources else base_source_row)
                        source_column = 2 if pose else EXPORTER.PLAYER_WALK_COLUMNS.get(row, range(5))[column]
                    expected = (file_ids[filename] * 20, 30 + source_row * 60, 40 + source_column * 30, 255)
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
