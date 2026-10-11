import hashlib
import json
import unittest
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
LIBRARY = ROOT / "art/assets/third-party/andhegames-creatures"


class CommunityAssetLibraryTests(unittest.TestCase):
    def test_registry_matches_source_files_and_local_index(self):
        registry = json.loads((LIBRARY / "registry.json").read_text(encoding="utf-8"))
        self.assertEqual(registry["license"], "CC0 1.0 Universal")
        self.assertEqual(registry["creator"], "AndHeGames")
        self.assertEqual(len(registry["assets"]), 3)
        self.assertEqual(registry["permissions"]["publicRepositoryRedistribution"], "permitted")
        self.assertFalse(registry["permissions"]["attributionRequired"])
        self.assertIn("reference library only", registry["suitability"].lower())

        index = (LIBRARY / "index.html").read_text(encoding="utf-8")
        for asset in registry["assets"]:
            path = LIBRARY / asset["path"]
            self.assertTrue(path.is_file(), asset["path"])
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), asset["sha256"])
            with Image.open(path) as image:
                self.assertEqual(list(image.size), asset["dimensions"])
            self.assertTrue(asset["source"].startswith("https://opengameart.org/content/"))
            self.assertEqual(urlparse(asset["sourceDownload"]).scheme, "https")
            self.assertIn(asset["path"], index)
            self.assertIn(asset["source"], index)

    def test_library_assets_are_not_shipped_or_runtime_registered(self):
        registry = json.loads((LIBRARY / "registry.json").read_text(encoding="utf-8"))
        runtime_manifest = (ROOT / "dist/src/data/assets.js").read_text(encoding="utf-8")
        for asset in registry["assets"]:
            self.assertFalse((ROOT / "dist/assets" / asset["path"]).exists())
            self.assertNotIn(asset["id"], runtime_manifest)


if __name__ == "__main__":
    unittest.main()
