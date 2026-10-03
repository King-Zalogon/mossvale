"""The visual review gate rejects evidence that changed after its recorded decision."""
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
import zlib


ROOT = Path(__file__).resolve().parents[1]
REVIEWER = ROOT / "art/characters/review.py"


def png():
    pixel = bytes((40, 180, 90, 255))
    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0)

    def chunk(name, data):
        body = name + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(b"\x00" + pixel)) + chunk(b"IEND", b"")


class VisualReviewEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="mossvale-art-review-")
        self.root = Path(self.temp.name)
        self.contact = "art/characters/reviews/contact.png"
        self.contact_path = self.root / self.contact
        self.contact_path.parent.mkdir(parents=True)
        self.contact_path.write_bytes(png())
        self.preview = "dist/character-preview.html"
        preview_path = self.root / self.preview
        preview_path.parent.mkdir(parents=True)
        preview_path.write_bytes(b"<!doctype html>\r\n<main>review preview</main>\r\n")
        preview_hash = hashlib.sha256(b"<!doctype html>\n<main>review preview</main>\n").hexdigest()
        subjects = []
        reviews = []
        for species in ["creature-fernling", "creature-duskwing"]:
            ref = f"art/references/{species}.png"
            output = f"dist/assets/creatures/{species}-combat.png"
            for path in [ref, output]:
                file = self.root / path
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_bytes(png())
            subjects.append({"id": species, "canonicalReferences": [{"path": ref}], "exports": [{"path": output}]})
            paths = sorted({self.contact, self.preview, ref, output})
            reviews.append(
                {
                    "visualId": species,
                    "technical": {"status": "pass"},
                    "visual": {"decision": "accept", "reason": "Readable at the reviewed scale.", "ownerTaste": "pending"},
                    "evidence": [self.contact, self.preview],
                    "reviewedFiles": [
                        {
                            "path": path,
                            "sha256": preview_hash if path == self.preview else hashlib.sha256((self.root / path).read_bytes()).hexdigest(),
                        }
                        for path in paths
                    ],
                }
            )
        fixtures = []
        for fixture_id, decision in [("wrong-anatomy", "quarantine"), ("identity-drift", "quarantine"), ("valid-turned-pose", "accept")]:
            path = f"art/characters/reviews/fixtures/{fixture_id}.png"
            file = self.root / path
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(png())
            fixtures.append(
                {
                    "id": fixture_id,
                    "path": path,
                    "technical": {"status": "pass"},
                    "visual": {"decision": decision, "reason": "Fixture decision is recorded.", "silhouetteChanged": fixture_id == "valid-turned-pose"},
                }
            )
        profiles = {"creature-follower-v1": {"status": "pending-dedicated-direction-art"}}
        (self.root / "art/characters/export-profiles.json").write_text(json.dumps({"profiles": profiles}))
        subject_path = self.root / "art/assets/subjects.json"
        subject_path.parent.mkdir(parents=True, exist_ok=True)
        subject_path.write_text(json.dumps({"subjects": subjects}))
        data = {
            "technicalAndVisualGatesAreSeparate": True,
            "evidence": {
                "contactSheet": self.contact,
                "contactSheetDigest": {"path": self.contact, "sha256": hashlib.sha256(self.contact_path.read_bytes()).hexdigest()},
            },
            "subjects": reviews,
            "fixtures": fixtures,
            "coverage": [
                {"issue": "#85", "status": "reviewed-at-scale", "creaturePortraitWidth": 115, "contactSheet": self.contact, "visualIds": ["creature-fernling", "creature-duskwing"]}
            ],
            "coverageGaps": [
                {"issue": "#90", "profileId": "creature-follower-v1", "status": "pending-art", "reason": "Dedicated frames are not available."}
            ],
        }
        review_path = self.root / "art/characters/visual-reviews.json"
        review_path.parent.mkdir(parents=True, exist_ok=True)
        review_path.write_text(json.dumps(data))

    def tearDown(self):
        self.temp.cleanup()

    def run_reviewer(self):
        return subprocess.run([sys.executable, str(REVIEWER), "--root", str(self.root)], capture_output=True, text=True, check=False)

    def test_current_evidence_passes_then_stale_art_requires_a_new_visual_review(self):
        current = self.run_reviewer()
        self.assertEqual(current.returncode, 0, current.stderr)

        output = self.root / "dist/assets/creatures/creature-fernling-combat.png"
        output.write_bytes(png()[:-1] + b"\x00")
        stale = self.run_reviewer()

        self.assertNotEqual(stale.returncode, 0)
        self.assertIn("reviewed evidence is stale", stale.stderr)


if __name__ == "__main__":
    unittest.main()
