# Adventure regression (#39)

## Routine check

Run `npm run verify` before integrating a content change. The suite combines deterministic domain tests with Playwright Chromium browser flows. Browser coverage uses desktop layouts and responsive viewport emulation; it does not certify a physical device or establish the owner's preferred browser.

The campaign regression in `tests/campaign.test.mjs` starts from a fresh save, checks that all eight maps connect and each roster creature has a home encounter, then uses ordinary battle actions to train, win each of the four shrine challenges, round-trip the save after every seal, and reach the ending condition. Existing tests cover the opening UI and the ending screen (`tests/startup.browser.mjs`), the first-chapter keyboard playthrough (`tests/playthrough.browser.mjs`), map travel and reload (`tests/biome-maps.browser.mjs`), interrupted battles, saves, backups and responsive layouts.

## Findings

- The automated campaign run found no progression lock, lost seal or duplicate seal reward.
- The newly integrated Frostveil Grove map had a stale SHA-256 entry in `dist/maps/index.json`, which blocked normal builds and map loading. The manifest now matches the merged map, and `npm run validate` passes.
- `npm run test:browser` passes, including save recovery, capture interruption and resumption, all eight-map travel coverage, the existing opening and ending flows, and the reduced-motion and renderer checks.
- `npm run verify` currently stops at `format:check` because six untouched files fail Prettier: `art/assets/metadata.json`, `art/assets/subjects.json`, `art/characters/creature-combat-metadata.json`, `art/characters/export-profiles.json`, `art/characters/visual-reviews.json` and `dist/creature-combat-preview.html`. Run `npm run lint`, `npm run validate`, `npm test` and `npm run test:browser` independently to exercise the checks beyond that gate.
- The separate art check reports stale reviewed evidence for `person-red-cap-adventurer` in `dist/character-preview.html`; the regression changes do not alter that artwork or review record.
- To reproduce the fresh-save progression check, run `node --test tests/campaign.test.mjs`.
- To reproduce the browser chapter and ending checks, run `node tests/playthrough.browser.mjs` and `node tests/startup.browser.mjs`.
- Owner feedback from playing the integrated adventure on their actual device and browser remains the acceptance check; Playwright emulation cannot replace it.
