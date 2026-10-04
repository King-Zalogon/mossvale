"""Generated-source chunks reconstruct the immutable PNG bytes without truncation."""
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "art/characters"))
from source_archive import source_bytes  # noqa: E402


class SourceArchiveTests(unittest.TestCase):
    def test_every_source_reassembles_byte_identically_with_bounded_chunks(self):
        archive = json.loads((ROOT / "art/characters/source-archive.json").read_text(encoding="utf-8"))
        self.assertEqual(archive["format"], 1)
        for source, record in archive["sources"].items():
            with self.subTest(source=source):
                data = source_bytes(ROOT, source)
                self.assertEqual(len(data), record["bytes"])
                self.assertEqual(__import__("hashlib").sha256(data).hexdigest(), record["sha256"])
                self.assertGreaterEqual(len(record["parts"]), 3)
                self.assertTrue(all((ROOT / part).stat().st_size <= archive["chunkBytes"] for part in record["parts"]))
                self.assertFalse((ROOT / source).exists(), "the verified archive remains the canonical source")


if __name__ == "__main__":
    unittest.main()
