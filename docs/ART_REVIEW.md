# Character art identity and review workflow

Issues [#91](https://github.com/King-Zalogon/mossvale/issues/91), [#92](https://github.com/King-Zalogon/mossvale/issues/92), and [#93](https://github.com/King-Zalogon/mossvale/issues/93).

## Stable identities and provenance

`art/assets/subjects.json` gives the red-cap player, Fernling, and Duskwing stable visual IDs, canonical reference asset paths and SHA-256 hashes, silhouette/body-plan notes, palette families, generated source hashes, runtime output hashes, and export profile IDs. `npm run validate` checks hash integrity and batch-to-reference links. Historical prompts that were not preserved, model versions not supplied by the tool, and absent seeds are marked unavailable instead of being guessed. A changed identity needs a new ID or an explicit revision.

Check provenance before a review or export:

```sh
npm run validate
```

## Non-destructive export

`art/characters/export-profiles.json` keeps versioned settings by category. The creature combat exporter reads its profile, retains the generated source PNG unchanged, uses no resampling or palette quantization, and writes a staged PNG atomically. Its `--check` mode never changes runtime files; `--preview-dir` writes segmented-cell and anchored stages for comparison.

```sh
python3 art/characters/export-creature-combat.py --check --preview-dir /tmp/mossvale-export-stages
python3 art/characters/export-creature-combat.py # export only after inspecting the stages
```

The wider runtime source atlas exporter remains pixel preserving: `python3 art/assets/export.py --check` verifies every editable cell against its runtime PNG. Generated originals and failed review fixtures live under `art/characters/`, outside `dist/assets/`.

## Separate technical and visual gates

`npm run validate` and `npm run art:check` check PNG bytes, source/output hashes, frame dimensions, anchors, export settings, and review-record structure. These checks do not decide whether anatomy, pose, identity, or readability looks right.

`art/characters/visual-reviews.json` records a separate `accept`, `rework`, or `quarantine` decision with a reason. Its deterministic fixtures include technically valid wrong-anatomy and palette-drift examples that stay quarantined, plus a valid NE turned pose accepted despite a changed outline. Run `python3 art/characters/make-review-fixtures.py` only when deliberately regenerating those authoring-only examples.

Open `dist/character-preview.html` for player and NPC facing art and `dist/creature-combat-preview.html` for the approved creature reference beside its combat rows at the 115 px gameplay width. The captured contact sheet is `art/characters/reviews/creature-combat-contact-sheet.png`. The Fernling faint row is recorded as rework because detached leaf/spark pixels remain visible; Duskwing passes this initial visual check. Owner taste review is pending for both.

No visual score proves player enjoyment. Model-assisted review is optional authoring support; the recorded reason and human decision remain authoritative.
