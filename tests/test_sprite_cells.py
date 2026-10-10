"""Packed poses retain thin anatomy/effects and never borrow adjacent-frame pixels."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'art/characters'))
from sprite_cells import extract_poses, validate_gutters

SPEC = importlib.util.spec_from_file_location('combat_export', ROOT / 'art/characters/export-creature-combat.py')
EXPORT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EXPORT)


class SpriteCellTests(unittest.TestCase):
    def source(self):
        source = Image.new('RGBA', (200, 200))
        draw = ImageDraw.Draw(source)
        colors = [(220, 20, 30, 255), (20, 220, 30, 255), (20, 30, 220, 255), (220, 200, 20, 255)]
        for index, color in enumerate(colors):
            x = 20 + (index % 2) * 100
            y = 50 if index < 2 else 140
            draw.rectangle((x, y, x + 40, y + (62 if index < 2 else 40)), fill=color)
            draw.line((x + 40, y + 15, x + 69, y + 15), fill=color, width=1)
            draw.rectangle((x + 47, y + 5, x + 49, y + 7), fill=color)  # detached spark
            draw.rectangle((x + 15, y + 15, x + 18, y + 18), fill=(0, 0, 0, 0))  # preserve a hole
        source.putpixel((1, 1), (255, 255, 255, 6))  # transparent noise
        return source, colors

    def test_nonuniform_rows_restore_full_poses_thin_tails_detached_sparks_and_holes(self):
        source, colors = self.source()
        poses = extract_poses(source, 2, 2, 8, row_bounds=[0, 120, 200])
        self.assertEqual(len(poses), 4)
        before = sum(alpha > 8 for alpha in source.getchannel('A').getdata())
        after = sum(sum(alpha > 8 for alpha in pose.getchannel('A').getdata()) for pose in poses)
        self.assertEqual(after, before, 'each foreground pixel is retained exactly once')
        for pose, color in zip(poses, colors):
            self.assertEqual({pixel for pixel in pose.getdata() if pixel[3]}, {color}, 'neighbor anatomy is never borrowed')
            self.assertEqual(pose.width, 70, 'the one-pixel tail is restored')
            self.assertEqual(pose.getpixel((48, 6)), color, 'detached effect survives')
            self.assertEqual(pose.getpixel((16, 16))[3], 0, 'internal transparency survives')
        self.assertEqual(poses[0].height, 63, 'first row extends beyond the old uniform cut at y=100')

    def test_reviewed_barrier_separates_touching_poses_without_eroding_the_exports(self):
        source = Image.new('RGBA', (200, 100))
        draw = ImageDraw.Draw(source)
        draw.rectangle((20, 20, 70, 80), fill='red')
        draw.rectangle((130, 20, 170, 80), fill='blue')
        draw.line((70, 50, 130, 50), fill='yellow')
        poses = extract_poses(source, 2, 1, 8, column_bounds=[[0, 110, 200]], barriers=[(110, 0, 100)])
        self.assertEqual(poses[0].width, 90)
        self.assertEqual(poses[1].width, 61)
        self.assertEqual(sum(sum(a > 8 for a in p.getchannel('A').getdata()) for p in poses),
                         sum(a > 8 for a in source.getchannel('A').getdata()))

    def test_missing_poses_and_invalid_authored_bounds_fail_before_export(self):
        source, _ = self.source()
        for kwargs in [{'row_bounds': [0, 120, 199]}, {'row_bounds': [0, 120, 120, 200]},
                       {'column_bounds': [[0, 100, 199], [0, 100, 200]]}]:
            with self.assertRaises(ValueError):
                extract_poses(source, 2, 2, 8, **kwargs)
        with self.assertRaises(ValueError):
            extract_poses(Image.new('RGBA', (100, 100)), 2, 2, 8)

    def test_new_sources_require_blank_gutters_and_complete_populated_cells(self):
        source = Image.new('RGBA', (200, 100))
        draw = ImageDraw.Draw(source)
        draw.rectangle((20, 20, 79, 79), fill='red')
        draw.rectangle((120, 20, 179, 79), fill='blue')
        validate_gutters(source, 2, 1, 8)
        source.putpixel((0, 20), (255, 0, 0, 255))
        with self.assertRaisesRegex(ValueError, 'gutter'):
            validate_gutters(source, 2, 1, 8)
        with self.assertRaises(ValueError):
            validate_gutters(Image.new('RGBA', (200, 100)), 2, 1, 8)

    def test_export_uses_one_scale_and_shared_ground_line_with_four_pixel_gutters(self):
        source, _ = self.source()
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source.save(root / 'source.png')
            profile = {'sourceGrid': {'columns': 2, 'rows': 2}, 'frameSizes': {'synthetic': [80, 80]},
                       'poseSegmentation': 'seeded-subjects-v1', 'alphaThreshold': 8, 'transparentGutter': 4,
                       'footInset': 4, 'sourceRowBounds': {'synthetic': [0, 120, 200]}}
            _, result = EXPORT.build(root, profile, {'source': 'source.png'}, 'synthetic')
            boxes = [result.crop((x * 80, y * 80, (x + 1) * 80, (y + 1) * 80)).getbbox() for y in range(2) for x in range(2)]
            self.assertEqual({box[2] - box[0] for box in boxes}, {70}, 'smaller faint frames are not inflated')
            self.assertEqual({box[3] for box in boxes}, {76})
            self.assertTrue(all(min(box[0], box[1], 80 - box[2], 80 - box[3]) >= 4 for box in boxes))

    def test_every_shipped_combat_cell_has_clear_gutters_and_a_common_baseline(self):
        profile = json.loads((ROOT / 'art/characters/export-profiles.json').read_text())['profiles']['creature-combat-v1']
        for name, (width, height) in profile['frameSizes'].items():
            with Image.open(ROOT / f'dist/assets/creatures/creature-{name}-combat.png') as source:
                alpha = source.convert('RGBA').getchannel('A').point(lambda a: 255 if a > 8 else 0)
                for row in range(5):
                    for column in range(4):
                        box = alpha.crop((column * width, row * height, (column + 1) * width, (row + 1) * height)).getbbox()
                        self.assertIsNotNone(box, f'{name}:{row},{column}')
                        self.assertGreaterEqual(min(box[0], box[1], width - box[2], height - box[3]), 4, f'{name}:{row},{column}')
                        self.assertLessEqual(abs(box[3] - (height - profile['footInset'])), 1, f'{name}:{row},{column}')


if __name__ == '__main__':
    unittest.main()
