# Art assets: conventions and workflow

Issue [#32](https://github.com/King-Zalogon/mossvale/issues/32). The manifest is `dist/src/data/assets.js`; `npm run validate` checks it and the PNGs (`scripts/lib/assets-check.mjs`).

## What exists

40 PNGs in `dist/assets/{props,creatures,people,items}/`, named by what they look like:

| Kind | Folder | Name pattern | Examples |
| --- | --- | --- | --- |
| prop | `props/` | `<thing>-<detail>` | `tree-oak`, `tree-pine-snow`, `cottage-tiled`, `boulder-mossy`, `rock-spire-red`, `shrine-crystal-stone`, `signpost-wood`, `chest-wooden`, `grass-tuft`, `bush-flowering` |
| creature | `creatures/` | `creature-<species>` (portraits, `-combat`, and `-follower` atlases) | `creature-fernling` … `creature-pebblit` (eight); follower sheets for Fernling, Emberkin, Duskwing and Brooklet |
| person | `people/` | `person-<look>` (with frame metadata for atlases) | `person-red-cap-motion`, `person-traveler`, `person-gardener`; legacy `person-red-cap-south/north/west/east` |
| item | `items/` | `item-<thing>` | `item-capture-orb` (reserved, optional) |

Names never describe a story role. A ranger is a map landmark (`kind: ranger`, `name`, `tag`) that can use `person-gardener`; another adventure can give the same art a different name and lines, and a cottage or tree can be reused on any map by its name, with no engine change. Content refers to art only by name (`spriteId('creature-fernling')`, `"sprite": "tree-oak"` in map JSON).

## Conventions (checked)

- **Format**: 8-bit RGBA PNG with real transparency, non-interlaced.
- **Crop**: tight. At most 8 px of empty space on the sides and top, and at most 6 px under the feet, so the anchor is predictable. All current sprites are within 3 px.
- **Anchor**: `bottom-center`. A sprite stands with its bottom-centre on the point it represents (a tile position, the feet of a character). Draw width is set where it is used (`w` in map data; 105–110 for portraits in menus and battle) and height follows the aspect ratio.
- **Perspective and scale**: 2:1 isometric tiles of 56 × 28 px (`config.js`); sources are about 140–430 px tall and are drawn smaller with image smoothing off, so one source pixel is roughly 3–10 screen pixels. Keep a new asset's apparent pixel size and viewing angle consistent with its neighbours.
- **Frames**: single images remain tightly cropped. Animation atlases declare `frames` in the manifest: fixed `frameWidth`/`frameHeight`, `columns`/`rows`, and row/column order. Every cell shares the same bottom-center anchor; validation checks each cell is visible and has at most 6 px beneath its feet. Padding inside a fixed cell is intentional and keeps animation size stable.
- **Palette**: terrain palettes per region are in `data/regions.js`; sprite colours follow the existing warm, saturated look.
- **Required vs optional**: `required: true` blocks play until the image loads (with retry); `required: false` falls back silently.

## Adding or replacing art

1. Export a cropped RGBA PNG to `dist/assets/<kind-folder>/<name>.png` (or a fixed-cell sheet for animation).
2. Add the manifest entry (`name`, `kind`, `src`, `w`, `h`, `anchor: 'bottom-center'`, `required`; atlases also declare the cell grid and order). Use `spriteId('name')` or the name in map JSON.
3. `npm run validate`. It fails on a wrong size, missing transparency, loose crop, bad name or folder, duplicate, a story-role name, an unlisted PNG, and warns about a required asset nothing uses.
4. `npm run map:preview -- <map>` and play it.

## Source and provenance

Every runtime PNG now has a pixel-preserving editable cell in an RGBA source atlas under `art/assets/source/`. `art/assets/metadata.json` maps each named asset to its sheet, cell rectangle, dimensions, anchor and animation frame order. `art/assets/export.py` crops those cells back into `dist/assets/` without resizing or changing their pixels:

```sh
python3 art/assets/export.py --check # confirm source cells exactly match the runtime files
python3 art/assets/export.py        # export source cells after editing an atlas
npm run validate
```

## Subject identity and provenance

`art/assets/subjects.json` gives stable visual IDs and explicit revisions to the current player, Fernling and Duskwing sample. Each record describes the visible silhouette, palette and distinguishing features; hashes the canonical reference and exported runtime file; and records the source batches, references and export workflow. The validator checks these hashes and verifies that asset IDs, source-atlas cells, directions and batch outputs still resolve to the manifest. A changed identity needs a reviewed new revision; a retry or sibling frame must keep the existing subject ID and revision.

Generation history distinguishes retained evidence from missing history. The red-cap source notes retain a brief summary and the directional reference assets, but not an exact prompt, provider, model version, seed or masks. The current Fernling and Duskwing source atlas cells are their canonical references for the original portraits; those portraits' original generation prompts, references, provider, model version, seed and masks were not retained. Separate combat sheets were generated from those current portraits: their raw source images, brief summaries, five state rows, exporter and runtime PNGs are linked and hashed in `subjects.json`. The combat sheets have different art pixels. Idle, attack, hit, faint and capture use the combat frames when present; static portraits retain the CSS treatment as a fallback. The other six creatures do not yet have combat sheets.

Run `npm run validate` to check identity records and the SHA-256 digests alongside the normal asset checks. These hashes detect accidental mismatch and are not signatures or proof of origin.

The optional `--pack` command bootstraps atlases from the current runtime PNGs and refuses to overwrite existing source work. Use `--pack --force` only when intentionally rebuilding all source atlases from `dist/`.

The original generation sheets and briefs are retained for the red-cap motion, traveler and gardener art in `art/characters/source/`; those original references are linked from `art/characters/metadata.json` and `art/characters/SOURCES.md`. Fernling and Duskwing combat source sheets are also retained there with brief prompt summaries and their canonical portrait references; provider, model, seed and mask history were not retained. The older prop, creature and legacy-person atlases are reconstructed from the exact existing runtime crops, so their original generation prompts were not recovered. This distinction is recorded per asset in the source metadata and subject provenance registry.

All assets use `bottom-center` anchors. World objects set their deliberate apparent size in map data, the player uses a 36 px world width, and creature portraits share the 85–110 px UI widths in `render/sprites.js` and the menu/battle callers. Frames with multiple poses declare the fixed cell size and direction order in the manifest and source metadata. When a sheet's row for a direction repeats another direction's pose (Emberkin's southeast repeats its southwest; the red-cap's northwest repeats its northeast), `frames.mirror` maps that direction to the source direction and the renderer draws the source row flipped (`directionPose` in `domain/exploration.js`). The browser preview at `dist/character-preview.html` shows the generated character batch at gameplay scale. `dist/creature-combat-preview.html` shows the Fernling and Duskwing combat atlases at gameplay scale; the optional `*-combat` manifest IDs fall back to each creature’s static portrait until a sheet exists. `dist/creature-follower-preview.html` shows four 5×8 direction/walk atlases and follower-path motion at gameplay scale; the remaining species retain the static fallback. Frame timing and source briefs are in `art/characters/creature-combat-metadata.json`, `art/characters/creature-follower-metadata.json`, and `art/characters/SOURCES.md`.

See [ART_REVIEW.md](ART_REVIEW.md) for stable identity records, source hashes, versioned category export profiles, contact sheets, and separate technical and visual review. The follower profile now covers Emberkin, Fernling, Duskwing and Brooklet; #90 remains open for the eight remaining active species and owner gameplay review. Terrain-transition art remains pending.

Rights and attribution for distribution are tracked separately (deferred in the roadmap).
