# Art assets: conventions and workflow

Issue [#32](https://github.com/King-Zalogon/mossvale/issues/32). The manifest is `dist/src/data/assets.js`; `npm run validate` checks it and the PNGs (`scripts/lib/assets-check.mjs`).

## What exists

66 PNGs in `dist/assets/{props,creatures,people,items}/`, named by what they look like:

| Kind | Folder | Name pattern | Examples |
| --- | --- | --- | --- |
| prop | `props/` | `<thing>-<detail>` | `tree-oak`, `tree-pine-snow`, `cottage-tiled`, `boulder-mossy`, `rock-spire-red`, `shrine-crystal-stone`, `signpost-wood`, `chest-wooden`, `grass-tuft`, `bush-flowering` |
| creature | `creatures/` | `creature-<species>` (portraits, `-combat`, and `-follower` atlases) | 12 species each have a static portrait, a five-state combat atlas and an eight-direction follower atlas |
| person | `people/` | `person-<look>` (with frame metadata for atlases) | `person-red-cap-motion`, `person-traveler`, `person-gardener`; legacy `person-red-cap-south/north/west/east` |
| item | `items/` | `item-<thing>` | `item-capture-orb` (reserved, optional) |

Names never describe a story role. A ranger is a map landmark (`kind: ranger`, `name`, `tag`) that can use `person-gardener`; another adventure can give the same art a different name and lines, and a cottage or tree can be reused on any map by its name, with no engine change. Content refers to art only by name (`spriteId('creature-fernling')`, `"sprite": "tree-oak"` in map JSON).

Secret place discoveries should show the place itself rather than an announcement. The ten landmark props introduced for #195 are `prop-well-ruined`, `tree-oak-hollow`, `prop-cider-press`, `prop-orchard-wall-broken`, `prop-heron-blind`, `prop-quarry-alcove`, `prop-rim-overlook`, `prop-icefall-ledge`, `prop-hanging-lantern` and `prop-sunstone-lookout`. Their original generated RGBA sources and prompt/provenance records are under `art/assets/source/landmarks/`; tree-oak-hollow also pins its existing tree reference. `art/assets/export-landmark-props.py` applies the versioned `prop-landmark-v1` profile, adds editable crops to the existing prop atlas, and checks source/output/atlas pixels. Runtime draw size stays authored per map landmark (`w`); the sources are capped at 256 px. The browser review uses a phone-sized viewport and saves per-landmark captures under `art/assets/reviews/landmarks/`.

## Conventions (checked)

- **Format**: 8-bit RGBA PNG with real transparency, non-interlaced.
- **Crop**: tight. At most 8 px of empty space on the sides and top, and at most 6 px under the feet, so the anchor is predictable. All current sprites are within 3 px.
- **Anchor**: `bottom-center`. A sprite stands with its bottom-centre on the point it represents (a tile position, the feet of a character). Draw width is set where it is used (`w` in map data; 105–110 for portraits in menus and battle) and height follows the aspect ratio.
- **Perspective and scale**: 2:1 isometric tiles of 56 × 28 px (`config.js`). Each map prop's authored `w` sets its gameplay size; source dimensions vary by category and versioned export profile. Keep a new asset's apparent pixel size and viewing angle consistent with its neighbours, and inspect it in the actual renderer rather than inferring scale from source pixels.
- **Frames**: single images remain tightly cropped. Animation atlases declare `frames` in the manifest: fixed `frameWidth`/`frameHeight`, `columns`/`rows`, and row/column order. Every cell shares the same bottom-center anchor; validation checks each cell is visible and has at most 6 px beneath its feet. Padding inside a fixed cell is intentional and keeps animation size stable.
- **Player idle pose**: the red-cap atlas keeps one `idle` cell followed by four distance-paced walk cells in each direction. Idle is authored as a calm planted stance from the separate source sheet in `art/characters/metadata.json`; walk frames remain tied to their gait-source rows. Stopping and reduced motion hold that neutral cell while preserving facing.
- **Palette**: terrain palettes per region are in `data/regions.js`; sprite colours follow the existing warm, saturated look.
- **Required vs optional**: `required: true` blocks play until the image loads (with retry); `required: false` falls back silently.

## Adding or replacing art

1. Export a cropped RGBA PNG to `dist/assets/<kind-folder>/<name>.png` (or a fixed-cell sheet for animation).
2. Add the manifest entry (`name`, `kind`, `src`, `w`, `h`, `anchor: 'bottom-center'`, `required`; atlases also declare the cell grid and order). Use `spriteId('name')` or the name in map JSON.
3. `npm run validate`. It fails on a wrong size, missing transparency, loose crop, bad name or folder, duplicate, a story-role name, an unlisted PNG, and warns about a required asset nothing uses.
4. `npm run map:preview -- <map>` and play it.

## Source and provenance

Runtime PNGs have either a pixel-preserving editable cell in an RGBA source atlas or a generated source sheet with a category-specific exporter. `art/assets/metadata.json` maps atlas-backed assets to their sheet, cell rectangle, dimensions, anchor and animation frame order. Generated combat and follower outputs instead point to archived source sheets in `art/characters/source-archive.json` and carry exporter profiles and hashes in `art/assets/subjects.json`. `art/assets/export.py` crops atlas-backed cells back into `dist/assets/` without resizing or changing their pixels:

```sh
python3 art/assets/export.py --check # confirm source cells exactly match the runtime files
python3 art/assets/export.py        # export source cells after editing an atlas
python3 art/assets/export-landmark-props.py --check # verify #195 landmark profile and exact atlas/output pixels
npm run validate
```

## Subject identity and provenance

`art/assets/subjects.json` gives stable visual IDs and explicit revisions to the player and all twelve creatures. Each record describes the visible silhouette, palette and distinguishing features; hashes the canonical reference and exported runtime file; and records the source batches, references and export workflow. The validator checks these hashes and verifies that asset IDs, source-atlas cells, directions and batch outputs still resolve to the manifest. A changed identity needs a reviewed new revision; a retry or sibling frame must keep the existing subject ID and revision.

Generation history distinguishes retained evidence from missing history. The red-cap source notes retain a brief summary and the directional reference assets, but not an exact prompt, provider, model version, seed or masks. The current creature source atlas cells are canonical references for the original portraits; their original prompts and provider/model/seed/mask history were not retained. Separate combat and directional follower sheets were generated from those current portraits. Source PNGs are retained byte-for-byte in bounded, SHA-256-checked archive chunks; prompt summaries, references, all output frames and category profiles are linked and hashed in `subjects.json`. Every species now has idle, attack, hit, faint and capture combat rows and idle plus four walk frames in eight directions. Static portraits remain the fallback when an optional animation atlas fails to load.

Run `npm run validate` to check identity records and the SHA-256 digests alongside the normal asset checks. These hashes detect accidental mismatch and are not signatures or proof of origin.

The optional `--pack` command bootstraps atlases from the current runtime PNGs and refuses to overwrite existing source work. Use `--pack --force` only when intentionally rebuilding all source atlases from `dist/`.

The original generation sheets and briefs are retained for the red-cap motion, traveler and gardener art in `art/characters/source/`; those original references are linked from `art/characters/metadata.json` and `art/characters/SOURCES.md`. Creature combat sources have brief prompt summaries and canonical portrait references; provider, model, seed and mask history were not retained. The newer larger combat source PNGs are preserved byte-for-byte in verified chunks. The older prop, creature and legacy-person atlases are reconstructed from the exact existing runtime crops, so their original generation prompts were not recovered. This distinction is recorded per asset in the source metadata and subject provenance registry.

All assets use `bottom-center` anchors. World objects set their deliberate apparent size in map data, the player uses a 36 px world width, and creature portraits share the 85–110 px UI widths in `render/sprites.js` and the menu/battle callers. Frames with multiple poses declare the fixed cell size and direction order in the manifest and source metadata. When a sheet's row for a direction repeats another direction's pose (Emberkin's southeast repeats its southwest; the red-cap's northwest repeats its northeast), `frames.mirror` maps that direction to the source direction and the renderer draws the source row flipped (`directionPose` in `domain/exploration.js`). The browser preview at `dist/character-preview.html` shows the generated character batch at gameplay scale. `dist/creature-combat-preview.html` shows eight creature combat atlases at gameplay scale; the optional `*-combat` manifest IDs fall back to each creature’s static portrait until a sheet exists. `dist/creature-follower-preview.html` shows eight 5×8 direction/walk atlases and follower-path motion at gameplay scale; four species retain the static fallback. Frame timing and source briefs are in `art/characters/creature-combat-metadata.json`, `art/characters/creature-follower-metadata.json`, and `art/characters/SOURCES.md`.

See [ART_REVIEW.md](ART_REVIEW.md) for stable identity records, source hashes, versioned category export profiles, contact sheets, and separate technical and visual review. Player motion, NPC turnarounds, creature portraits, combat sheets and follower sheets have export profiles and regression coverage. All 12 active species have combat and directional sheets. Visual taste and gameplay acceptance remain owner review items; terrain-transition art remains pending because no terrain sprite family has been authored.

Rights and attribution for distribution are tracked separately (deferred in the roadmap).
