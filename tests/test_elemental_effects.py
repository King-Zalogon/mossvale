"""Material poses keep generous runtime gutters and are not tint variants of one silhouette."""
import json
import hashlib
from pathlib import Path
import unittest
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


class ElementalEffectsTests(unittest.TestCase):
    def test_frozen_internal_review_evidence(self):
        record=json.loads((ROOT/'art/effects/review/review.json').read_text())
        self.assertEqual(record['technical']['poses'],72)
        self.assertEqual(record['visual']['ownerTasteApproval'],'not-requested-or-inferred')
        for item in record['files']:
            self.assertEqual(hashlib.sha256((ROOT/item['path']).read_bytes()).hexdigest(),item['sha256'],item['path'])

    def test_complete_isolated_materials_and_center_pivots(self):
        meta=json.loads((ROOT/'art/effects/metadata.json').read_text())
        atlas=Image.open(ROOT/'dist/assets/props/effect-elemental-materials.png').convert('RGBA')
        self.assertEqual(len(meta['cells']),72)
        masks=[]
        for row in range(12):
            for col in range(6):
                with self.subTest(type=meta['types'][row],stage=meta['stages'][col]):
                    alpha=atlas.crop((col*128,row*128,(col+1)*128,(row+1)*128)).getchannel('A')
                    left,top,right,bottom=alpha.getbbox()
                    self.assertGreaterEqual(left,16)
                    self.assertGreaterEqual(128-right,16)
                    self.assertGreaterEqual(top,16)
                    self.assertEqual(bottom,122)
                    self.assertGreater(sum(alpha.histogram()[128:]),0)
                    self.assertAlmostEqual(meta['effectPivots'][row][col],(top+bottom)/2,delta=0.5)
                    if col==4: masks.append(alpha.point(lambda p:255 if p else 0).tobytes())
        self.assertEqual(len(set(masks)),12,'all twelve impact silhouettes are distinct without color')


if __name__=='__main__':
    unittest.main()
