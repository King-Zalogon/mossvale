# Character art identity and review workflow

Issues [#91](https://github.com/King-Zalogon/mossvale/issues/91), [#92](https://github.com/King-Zalogon/mossvale/issues/92), and [#93](https://github.com/King-Zalogon/mossvale/issues/93).

## Stable identities and provenance

The ten static discoveries added for #195 have separate generated-source provenance in `art/assets/source/landmarks/manifest.json`, use the versioned `prop-landmark-v1` export profile, and retain pixel-editable crops in the prop atlas. Their map-scale review captures are in `art/assets/reviews/landmarks/`; `art/assets/landmark-visual-review.json` records per-object readability and keeps owner taste review distinct from technical review. Re-run `npm run test:browser` after changing a target map, asset, or renderer.

`art/assets/subjects.json` gives the red-cap player and current creature art stable visual IDs, canonical reference asset paths and SHA-256 hashes, silhouette/body-plan notes, palette families, generated source hashes, runtime output hashes, and versioned export profile IDs with settings hashes. `npm run validate` checks those hashes and batch-to-reference links. Historical prompts that were not preserved, model versions not supplied by the tool, and absent seeds are marked unavailable instead of being guessed. A changed identity needs a new ID or an explicit revision.

Check provenance before a review or export:

```sh
npm run validate
```

## Non-destructive export

`art/characters/export-profiles.json` keeps versioned settings by category. Creature exporters read their profile, preserve exact generated source bytes, and preflight all species before staging outputs. Emberkin and Voltkit combat sheets and Hushram and Voltkit follower sheets use a 256-color indexed PNG palette without dithering to stay below the repository's safe transfer size; the archival inputs remain byte-identical. `--check` never creates or changes runtime files. `--preview-dir` writes an HTML comparison with raw sources, segmented cells, anchored candidates, and runtime outputs. Synthetic regression art checks a one-pixel tail, a distinct identity-color pixel, and an enclosed transparent hole.

The follower exporter has its own `creature-follower-v1` profile and keeps each generated 5×8 source atlas unchanged. Its synthetic regression checks that repeated exports match, a tail/identity pixel survives, enclosed alpha holes remain open, and every cell shares the configured foot line. `art:check` verifies all eighteen runtime outputs against their generated sources. The contact sheet shows all five frames in all eight directions at the 37 px gameplay width.

```sh
python3 art/characters/export-creature-combat.py --check --preview-dir /tmp/mossvale-export-stages
# Open /tmp/mossvale-export-stages/index.html to compare all four stages.
python3 art/characters/export-creature-combat.py # export only after inspecting the stages
```

The wider runtime source atlas exporter remains pixel preserving: `python3 art/assets/export.py --check` verifies every atlas-backed cell against its runtime PNG. Prop source records pin `prop-static-v1` and its settings digest, and the exporter verifies that profile before reading or writing outputs. Generated originals and failed review fixtures live under `art/characters/`, outside `dist/assets/`; large art originals use the checked chunk archive described in `docs/ASSETS.md`.

## Separate technical and visual gates

`npm run validate` and `npm run art:check` check PNG bytes, source/output/profile hashes, frame dimensions, anchors, export settings, and review-record structure. Visual decisions are pinned to the exact current canonical references, runtime exports, and preview bytes, so changed files need a fresh review. These checks do not decide whether anatomy, pose, identity, or readability looks right.

For the player diagonal walk correction (#130), `tests/diagonal-walk.browser.mjs` drives all four diagonals through the real map renderer at the 52 × 84 px draw size. It checks ordered, repeatable walk/run cycles, rendered foot travel, stopping, turns, reverse movement, and reduced motion. `art/characters/reviews/diagonal-walk-before-after.png` records the old and revised poses at that scale; the unchanged Southeast row is the control. The character exporter also synchronizes the player crop in `art/assets/source/people-atlas.png`; `--check` verifies both copies without writing.

`art/characters/visual-reviews.json` records a separate `accept`, `rework`, or `quarantine` decision with a reason. Its deterministic fixtures include technically valid wrong-anatomy and palette-drift examples that stay quarantined, plus a valid NE turned pose accepted despite a changed outline. The #85 contact sheet covers all eighteen combat rosters at 115 px. The #90 contact sheet covers all eighteen follower rosters at 37 px. Owner taste and in-game acceptance remain pending and are not inferred from these technical reviews. Static portraits remain the fallback when an optional animation sheet cannot load; every current species has directional-art coverage. Run `python3 art/characters/make-review-fixtures.py` only when deliberately regenerating those authoring-only examples.

Open `dist/character-preview.html` for player and NPC facing art and `dist/creature-combat-preview.html` for the creature reference beside its combat rows at the 115 px gameplay width. The captured contact sheet is `art/characters/reviews/creature-combat-contact-sheet.png`. Sedgegnaw, Petalunge, Cindercurl, Sunsifter and Rillume records pin their generated portrait, combat and follower sources, normalized output atlases and gameplay-scale contact sheets. Internal visual review is separate from the owner taste decision, which remains pending for all new creatures.

No visual score proves player enjoyment. Model-assisted review is optional authoring support; the recorded reason and human decision remain authoritative.

## Scene quality and delivery standard

See [the source-backed gameplay quality audit](QUALITY_REVIEW.md) and #245 for the next playable-slice quality bar. Evaluate ground, props, actors, animation and interface together at normal gameplay scale. Repeated noisy texture, mismatched source styles, unreadable action feedback or obstructive HUD can make a technically valid asset/scene unsuitable for delivery. PR #233's terrain compiler preview remains a prototype in draft; the owner's first-version acceptance does not establish production visual quality. Keep technical verification, visual judgment and full playable-flow acceptance as separate reported results.
