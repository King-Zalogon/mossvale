# Character art identity and review workflow

Issues [#91](https://github.com/King-Zalogon/mossvale/issues/91), [#92](https://github.com/King-Zalogon/mossvale/issues/92), and [#93](https://github.com/King-Zalogon/mossvale/issues/93).

## Stable identities and provenance

`art/assets/subjects.json` gives the red-cap player, Fernling, and Duskwing stable visual IDs, canonical reference asset paths and SHA-256 hashes, silhouette/body-plan notes, palette families, generated source hashes, runtime output hashes, and versioned export profile IDs with settings hashes. `npm run validate` checks those hashes and batch-to-reference links. Historical prompts that were not preserved, model versions not supplied by the tool, and absent seeds are marked unavailable instead of being guessed. A changed identity needs a new ID or an explicit revision.

Check provenance before a review or export:

```sh
npm run validate
```

## Non-destructive export

`art/characters/export-profiles.json` keeps versioned settings by category. The creature combat exporter reads its profile, retains the generated source PNG unchanged, uses no resampling or palette quantization, preflights every species before staging outputs, and writes each staged PNG atomically. Its `--check` mode never creates or changes runtime files. `--preview-dir` writes an HTML comparison with byte-identical raw sources, segmented cells, anchored candidates, and runtime outputs. Synthetic regression art checks a one-pixel tail, a distinct identity-color pixel, and an enclosed transparent hole.

```sh
python3 art/characters/export-creature-combat.py --check --preview-dir /tmp/mossvale-export-stages
# Open /tmp/mossvale-export-stages/index.html to compare all four stages.
python3 art/characters/export-creature-combat.py # export only after inspecting the stages
```

The wider runtime source atlas exporter remains pixel preserving: `python3 art/assets/export.py --check` verifies every editable cell against its runtime PNG. Prop source records pin `prop-static-v1` and its settings digest, and the exporter verifies that profile before reading or writing outputs. Generated originals and failed review fixtures live under `art/characters/`, outside `dist/assets/`.

## Separate technical and visual gates

`npm run validate` and `npm run art:check` check PNG bytes, source/output/profile hashes, frame dimensions, anchors, export settings, and review-record structure. Visual decisions are pinned to the exact current canonical references, runtime exports, and preview bytes, so changed files need a fresh review. These checks do not decide whether anatomy, pose, identity, or readability looks right.

`art/characters/visual-reviews.json` records a separate `accept`, `rework`, or `quarantine` decision with a reason. Its deterministic fixtures include technically valid wrong-anatomy and palette-drift examples that stay quarantined, plus a valid NE turned pose accepted despite a changed outline. The reviewed #85 sheet covers the Fernling/Duskwing combat batch at actual battle scale. #90 follower direction art remains an explicit gap until its source frames exist; the portrait/path-motion fallback is not represented as a directional-art review. Run `python3 art/characters/make-review-fixtures.py` only when deliberately regenerating those authoring-only examples.

Open `dist/character-preview.html` for player and NPC facing art and `dist/creature-combat-preview.html` for the approved creature reference beside its combat rows at the 115 px gameplay width. The captured contact sheet is `art/characters/reviews/creature-combat-contact-sheet.png`. The Fernling faint row is recorded as rework because detached leaf/spark pixels remain visible; Duskwing passes this initial visual check. Owner taste review is pending for both.

No visual score proves player enjoyment. Model-assisted review is optional authoring support; the recorded reason and human decision remain authoritative.
