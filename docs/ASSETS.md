# Art assets: conventions and workflow

Issue [#32](https://github.com/King-Zalogon/mossvale/issues/32). The manifest is `dist/src/data/assets.js`; `npm run validate` checks it and the PNGs (`scripts/lib/assets-check.mjs`).

## What exists

32 PNGs in `dist/assets/{props,creatures,people,items}/`, named by what they look like:

| Kind | Folder | Name pattern | Examples |
| --- | --- | --- | --- |
| prop | `props/` | `<thing>-<detail>` | `tree-oak`, `tree-pine-snow`, `cottage-tiled`, `boulder-mossy`, `rock-spire-red`, `shrine-crystal-stone`, `signpost-wood`, `chest-wooden`, `grass-tuft`, `bush-flowering` |
| creature | `creatures/` | `creature-<species>` | `creature-fernling` … `creature-pebblit` (12, including four new biome residents) |
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

The older PNGs are crops exported from generated sprite sheets. Character artwork added for #36/#61 retains generated source sheets and prompts in `art/characters/source/`, with fixed-cell exports produced by `art/characters/export.py`; frame order, source references and walk cadence are in `art/characters/metadata.json` and `art/characters/SOURCES.md`. Open `dist/character-preview.html` to inspect every player pose and NPC facing at gameplay scale, including the production renderer fixture. Pillow is needed to re-export the generated sheets. Rights and attribution for distribution are tracked separately (deferred in the roadmap).

### Issue #24 additions

Four transparent creature sprites and a cattail prop were generated for this roster and cropped to tight RGBA PNGs. The sprite prompts used the existing Fernling art as a style reference and asked for an original creature design on a transparent background: a compact green meadow deer with leaf antlers and a seed-pod chest (Bramblebuck); a teal web-footed mudskipper with side gills and a ribbon tail (Siltkip); a sharp orange desert lizard with a glass-like crest (Sunskitter); and a round pale-blue snowy ram with curled frost horns (Hushram). The cattail prompt used the grass-tuft prop as its style reference and requested a small cluster of marsh reeds with seed heads on transparency. See [CREATURE_ROSTER.md](CREATURE_ROSTER.md) for roster and prompt provenance.
