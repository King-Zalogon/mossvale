# Art assets: conventions and workflow

Issue [#32](https://github.com/King-Zalogon/mossvale/issues/32). The manifest is `dist/src/data/assets.js`; `npm run validate` checks it and the PNGs (`scripts/lib/assets-check.mjs`).

## What exists

24 PNGs in `dist/assets/{props,creatures,people,items}/`, named by what they look like:

| Kind | Folder | Name pattern | Examples |
| --- | --- | --- | --- |
| prop | `props/` | `<thing>-<detail>` | `tree-oak`, `tree-pine-snow`, `cottage-tiled`, `boulder-mossy`, `rock-spire-red`, `shrine-crystal-stone`, `signpost-wood`, `chest-wooden`, `grass-tuft`, `bush-flowering` |
| creature | `creatures/` | `creature-<species>` | `creature-fernling` … `creature-pebblit` (eight) |
| person | `people/` | `person-<look>-<direction>` | `person-red-cap-south/north/west/east` (the four facings) |
| item | `items/` | `item-<thing>` | `item-capture-orb` (reserved, optional) |

Names never describe a story role. The ranger is a map landmark (`kind: ranger`, `name`, `tag`) that happens to use `person-red-cap-south`; another adventure can give the same art a different name and lines, and a cottage or tree can be reused on any map by its name, with no engine change. Content refers to art only by name (`spriteId('creature-fernling')`, `"sprite": "tree-oak"` in map JSON).

## Conventions (checked)

- **Format**: 8-bit RGBA PNG with real transparency, non-interlaced.
- **Crop**: tight. At most 8 px of empty space on the sides and top, and at most 6 px under the feet, so the anchor is predictable. All current sprites are within 3 px.
- **Anchor**: `bottom-center`. A sprite stands with its bottom-centre on the point it represents (a tile position, the feet of a character). Draw width is set where it is used (`w` in map data; 105–110 for portraits in menus and battle) and height follows the aspect ratio.
- **Perspective and scale**: 2:1 isometric tiles of 56 × 28 px (`config.js`); sources are about 140–430 px tall and are drawn smaller with image smoothing off, so one source pixel is roughly 3–10 screen pixels. Keep a new asset's apparent pixel size and viewing angle consistent with its neighbours.
- **Frames**: one image per sprite today. Characters have four facing images; walk-cycle frames come with #36.
- **Palette**: terrain palettes per region are in `data/regions.js`; sprite colours follow the existing warm, saturated look.
- **Required vs optional**: `required: true` blocks play until the image loads (with retry); `required: false` falls back silently.

## Adding or replacing art

1. Export a cropped RGBA PNG to `dist/assets/<kind-folder>/<name>.png`.
2. Add one line to the manifest (`name`, `kind`, `src`, `w`, `h`, `anchor: 'bottom-center'`, `required`). Use `spriteId('name')` or the name in map JSON.
3. `npm run validate`. It fails on a wrong size, missing transparency, loose crop, bad name or folder, duplicate, a story-role name, an unlisted PNG, and warns about a required asset nothing uses.
4. `npm run map:preview -- <map>` and play it.

## Source and provenance

The current PNGs are crops exported from generated sprite sheets. The original sheets and any layered sources are **not in the repository**, so there is no editable source for them here. For new art, keep the editable file (e.g. an Aseprite or layered file) outside `dist/` in a folder such as `art/` and name it in the commit message or in this document, so later edits do not start from a flat PNG. Rights and attribution for distribution are tracked separately (deferred in the roadmap).
