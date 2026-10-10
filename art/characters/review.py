"""Validate review-record structure, frozen evidence hashes and fixture decodability."""
from argparse import ArgumentParser
import hashlib
import json
from pathlib import Path
from PIL import Image

DEFAULT_ROOT = Path(__file__).resolve().parents[2]
DECISIONS = {"accept", "rework", "quarantine"}
TEXT_SUFFIXES = {".css", ".html", ".js", ".json", ".md", ".mjs", ".py", ".txt"}
FOLLOWER_IDS = {
    "creature-emberkin",
    "creature-fernling",
    "creature-duskwing",
    "creature-brooklet",
    "creature-hushram",
    "creature-voltkit",
    "creature-mushmallow",
    "creature-frostowl",
    "creature-pebblit",
    "creature-bramblebuck",
    "creature-siltkip",
    "creature-sunskitter",
    "creature-sedgegnaw",
    "creature-petalunge",
    "creature-cindercurl",
    "creature-sunsifter",
    "creature-rillume",
    "creature-lanternix",
}
COMBAT_IDS = {
    "creature-fernling",
    "creature-emberkin",
    "creature-duskwing",
    "creature-brooklet",
    "creature-hushram",
    "creature-voltkit",
    "creature-mushmallow",
    "creature-frostowl",
    "creature-pebblit",
    "creature-bramblebuck",
    "creature-siltkip",
    "creature-sunskitter",
    "creature-sedgegnaw",
    "creature-petalunge",
    "creature-cindercurl",
    "creature-sunsifter",
    "creature-rillume",
    "creature-lanternix",
}


def validate_directional_coverage(data, reviewed_ids):
    coverage = next((item for item in data.get("coverage", []) if item.get("issue") == "#90"), None)
    contact_sheet = coverage.get("contactSheet") if coverage else None
    records = [
        record
        for record in data.get("subjects", [])
        if record.get("visualId") in FOLLOWER_IDS and contact_sheet in record.get("evidence", [])
    ]
    covered_ids = {record.get("visualId") for record in records}
    if (
        not coverage
        or coverage.get("status") != "full-roster-reviewed-at-scale"
        or coverage.get("followerWidth") != 37
        or coverage.get("contactSheet") != contact_sheet
        or not FOLLOWER_IDS.issubset(covered_ids & reviewed_ids)
    ):
        raise SystemExit("#90 review must cover its available directional follower sheets at 37 px")
    for record in records:
        if record.get("visual", {}).get("ownerTaste") not in {"pending", "approved", "rework"}:
            raise SystemExit(f"{record['visualId']}: owner taste review state must be explicit")
    return len(FOLLOWER_IDS)


def file_digest(path):
    content = path.read_bytes()
    if path.suffix.lower() in TEXT_SUFFIXES:
        content = content.replace(b"\r\n", b"\n")
    return hashlib.sha256(content).hexdigest()


def check_digest(root, record, where):
    path = root / record.get("path", "")
    expected = record.get("sha256", "")
    if len(expected) != 64 or any(char not in "0123456789abcdef" for char in expected):
        raise SystemExit(f"{where}: a lowercase SHA-256 digest is required")
    if not path.is_file():
        raise SystemExit(f"{where}: missing reviewed file {record.get('path')}")
    actual = file_digest(path)
    if actual != expected:
        raise SystemExit(f"{where}: reviewed evidence is stale for {record['path']}")


def check_image(root, path):
    with Image.open(path) as image:
        image.verify()
    with Image.open(path) as image:
        if image.mode != "RGBA" or image.getchannel("A").getbbox() is None:
            raise ValueError(f"{path.relative_to(root)} must be a visible RGBA PNG")


def validate_reviews(root):
    review_path = root / "art/characters/visual-reviews.json"
    data = json.loads(review_path.read_text())
    if data.get("technicalAndVisualGatesAreSeparate") is not True:
        raise SystemExit("technical and visual gates must remain separate")
    contact_sheet = data.get("evidence", {}).get("contactSheet")
    if not contact_sheet or not (root / contact_sheet).is_file():
        raise SystemExit(f"missing visual contact sheet: {contact_sheet}")
    contact_sheet_digest = data.get("evidence", {}).get("contactSheetDigest", {})
    if contact_sheet_digest.get("path") != contact_sheet:
        raise SystemExit("contact sheet digest must identify the reviewed contact sheet")
    check_digest(root, contact_sheet_digest, "contact sheet")
    provenance = json.loads((root / "art/assets/subjects.json").read_text())
    provenance_by_id = {subject["id"]: subject for subject in provenance.get("subjects", [])}
    for record in data.get("subjects", []):
        if record.get("technical", {}).get("status") != "pass":
            raise SystemExit(f"{record.get('visualId')}: technical result must be explicit")
        for evidence in record.get("evidence", []):
            if not (root / evidence).is_file():
                raise SystemExit(f"{record.get('visualId')}: missing visual evidence {evidence}")
        reviewed_files = record.get("reviewedFiles", [])
        if not reviewed_files:
            raise SystemExit(f"{record.get('visualId')}: reviewed file hashes are required")
        reviewed_paths = {item.get("path") for item in reviewed_files}
        visual_id = record.get("visualId")
        provenance_id = "player-red-cap-adventurer" if visual_id == "person-red-cap-adventurer" else visual_id
        subject = provenance_by_id.get(provenance_id)
        if not subject:
            raise SystemExit(f"{record.get('visualId')}: no stable identity/provenance record exists")
        required_paths = set(record.get("evidence", []))
        required_paths.update(ref.get("path") for ref in subject.get("canonicalReferences", []))
        required_paths.update(output.get("path") for output in subject.get("exports", []))
        if not required_paths.issubset(reviewed_paths):
            missing = sorted(required_paths - reviewed_paths)
            raise SystemExit(f"{record.get('visualId')}: review does not pin all references, outputs and evidence: {missing}")
        for reviewed_file in reviewed_files:
            check_digest(root, reviewed_file, record.get("visualId"))
        visual = record.get("visual", {})
        if visual.get("decision") not in DECISIONS or not visual.get("reason"):
            raise SystemExit(f"{record.get('visualId')}: visual decision and reason are required")
    expected = {"wrong-anatomy": "quarantine", "identity-drift": "quarantine", "valid-turned-pose": "accept"}
    for fixture in data.get("fixtures", []):
        check_image(root, root / fixture["path"])
        if fixture.get("technical", {}).get("status") != "pass":
            raise SystemExit(f"{fixture['id']}: fixture must pass the technical gate")
        visual = fixture.get("visual", {})
        if visual.get("decision") != expected.get(fixture["id"]) or not visual.get("reason"):
            raise SystemExit(f"{fixture['id']}: visual gate decision/reason regression")
        if fixture["id"] == "valid-turned-pose" and visual.get("silhouetteChanged") is not True:
            raise SystemExit("valid turned poses must remain acceptable when their silhouette changes")
    gaps = data.get("coverageGaps", [])
    follower_gap = next((item for item in gaps if item.get("issue") == "#90"), None)
    profiles = json.loads((root / "art/characters/export-profiles.json").read_text()).get("profiles", {})
    if (
        not follower_gap
        or follower_gap.get("status") != "pending-owner-review"
        or not follower_gap.get("reason")
        or profiles.get(follower_gap.get("profileId"), {}).get("status") != "implemented-seventh-batch"
    ):
        raise SystemExit("#90 must separate completed 18-species art coverage from pending owner review")
    reviewed_ids = {record.get("visualId") for record in data.get("subjects", [])}
    combat_coverage = next((item for item in data.get("coverage", []) if item.get("issue") == "#85"), None)
    if (
        not combat_coverage
        or combat_coverage.get("status") != "full-roster-reviewed-at-scale"
        or combat_coverage.get("creaturePortraitWidth") != 115
        or combat_coverage.get("contactSheet") != contact_sheet
        or not COMBAT_IDS.issubset(set(combat_coverage.get("visualIds", [])) & reviewed_ids)
    ):
        raise SystemExit("#85 combat review must cover every recorded species at 115 px using the pinned contact sheet")
    validate_directional_coverage(data, reviewed_ids)
    pending_gaps = [item for item in gaps if item.get("status") == "pending-art"]
    return data, len(pending_gaps)


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT, help="repository root for isolated review checks")
    args = parser.parse_args()
    root = args.root.resolve()
    data, pending_gaps = validate_reviews(root)
    print(f"checked {len(data['subjects'])} visual reviews, {len(data['fixtures'])} independent visual-gate fixtures and {pending_gaps} explicit coverage gaps")


if __name__ == "__main__":
    main()
