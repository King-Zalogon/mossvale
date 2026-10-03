"""Validate review-record structure and fixture image decodability, not artistic taste."""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
REVIEW = ROOT / "art/characters/visual-reviews.json"
DECISIONS = {"accept", "rework", "quarantine"}


def check_image(path):
    with Image.open(path) as image:
        image.verify()
    with Image.open(path) as image:
        if image.mode != "RGBA" or image.getchannel("A").getbbox() is None:
            raise ValueError(f"{path.relative_to(ROOT)} must be a visible RGBA PNG")


def main():
    data = json.loads(REVIEW.read_text())
    if data.get("technicalAndVisualGatesAreSeparate") is not True:
        raise SystemExit("technical and visual gates must remain separate")
    contact_sheet = data.get("evidence", {}).get("contactSheet")
    if not contact_sheet or not (ROOT / contact_sheet).is_file():
        raise SystemExit(f"missing visual contact sheet: {contact_sheet}")
    for record in data.get("subjects", []):
        if record.get("technical", {}).get("status") != "pass":
            raise SystemExit(f"{record.get('visualId')}: technical result must be explicit")
        for evidence in record.get("evidence", []):
            if not (ROOT / evidence).is_file():
                raise SystemExit(f"{record.get('visualId')}: missing visual evidence {evidence}")
        visual = record.get("visual", {})
        if visual.get("decision") not in DECISIONS or not visual.get("reason"):
            raise SystemExit(f"{record.get('visualId')}: visual decision and reason are required")
    expected = {"wrong-anatomy": "quarantine", "identity-drift": "quarantine", "valid-turned-pose": "accept"}
    for fixture in data.get("fixtures", []):
        check_image(ROOT / fixture["path"])
        if fixture.get("technical", {}).get("status") != "pass":
            raise SystemExit(f"{fixture['id']}: fixture must pass the technical gate")
        visual = fixture.get("visual", {})
        if visual.get("decision") != expected.get(fixture["id"]) or not visual.get("reason"):
            raise SystemExit(f"{fixture['id']}: visual gate decision/reason regression")
        if fixture["id"] == "valid-turned-pose" and visual.get("silhouetteChanged") is not True:
            raise SystemExit("valid turned poses must remain acceptable when their silhouette changes")
    print(f"checked {len(data['subjects'])} visual reviews and {len(data['fixtures'])} independent visual-gate fixtures")


if __name__ == "__main__":
    main()
