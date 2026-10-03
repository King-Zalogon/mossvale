# Character art sources

Generated with the image generation tool on 2026-10-03, then exported to fixed 160 × 256 RGBA cells. The source PNGs are kept here with the exact brief summaries and reference asset IDs; the export script uses nearest-neighbor scaling, normalizes each sprite to a fixed height, and aligns its feet to y=250.

## Player

The runtime 5 × 8 atlas is assembled in direction order from four retained 5 × 2 generated source sheets:

- [`person-red-cap-motion-north-northeast.png`](source/person-red-cap-motion-north-northeast.png): N and NE rows.
- [`person-red-cap-motion-east-southeast.png`](source/person-red-cap-motion-east-southeast.png): E and SE rows.
- [`person-red-cap-motion-south-southwest.png`](source/person-red-cap-motion-south-southwest.png): S and SW rows.
- [`person-red-cap-motion-west-northwest.png`](source/person-red-cap-motion-west-northwest.png): W and NW rows.
- Runtime export: [`person-red-cap-motion.png`](../../dist/assets/people/person-red-cap-motion.png), 800 × 2048 px.
- Reference art: `person-red-cap-north.png`, `person-red-cap-east.png`, `person-red-cap-south.png`, and `person-red-cap-west.png`.

Each generation sheet used the same brief: create a transparent 5-column × 2-row sprite sheet of the existing red-cap adventurer, at the original isometric view, palette, pixel scale, clothing and lighting; use one direction per row, idle followed by four compact alternating walk poses; keep character size, torso, head, backpack and foot line fixed; leave gaps between sprites; no body bob, shadows, scenery, labels or background. The row directions for each source image are listed above. Diagonal references used the nearest cardinal reference with the prior generated batch as a style reference.

## NPCs

- Generated turnaround: [`person-traveler-gardener-turnaround-source.png`](source/person-traveler-gardener-turnaround-source.png), 4 columns × 2 rows.
- Runtime atlases: [`person-traveler.png`](../../dist/assets/people/person-traveler.png) and [`person-gardener.png`](../../dist/assets/people/person-gardener.png), each 640 × 256 px.
- Style references: the existing red-cap east and south sprites.

Generation brief: a transparent 4 × 2 isometric pixel-art turnaround sheet, N/E/S/W in each row, matching the existing upper-left warm light, dark outline and warm palette. The top row is a stocky, bearded, ochre-cap traveler with a green coat, rust shirt, broad backpack and bedroll. The lower row is a slender braided gardener with a pale kerchief, linen shirt, moss-green pocket apron and plum skirt/trousers. Four neutral full-body poses each, feet aligned; no labels, scenery, floor or shadow.

## Export and metadata

Run `python3 art/characters/export.py` with Pillow installed. `metadata.json` records frame order, dimensions, bottom-center anchors, and walk cadence. Open `dist/character-preview.html` to inspect every player pose and NPC facing at gameplay scale, including the production renderer fixture. The PNGs are flattened generated source sheets rather than layered Aseprite documents; use the retained source grids and export script for future edits.

## Creature animation treatment

The eight current creature portraits remain the generated source images in `art/assets/source/creatures-atlas.png`, cropped and recorded in `art/assets/metadata.json`. A shared animation treatment applies to every manifest creature, so newly added species inherit it without per-species code: idle breathing, distance-paced travel bob, event-driven hit recoil and capture draw-in. The treatment leaves the art pixels and ground anchor unchanged. State methods, cadence and reduced-motion behavior are recorded in [`creature-animation-metadata.json`](creature-animation-metadata.json).

## Creature combat frame milestone

- Fernling and Duskwing combat sheets were generated on 2026-10-03 with the current transparent creature PNGs as references. Raw generated images are retained in `source/creature-fernling-combat-generated.png` and `source/creature-duskwing-combat-generated.png`.
- Each sheet has four columns and five state rows: idle, attack, hit, faint and capture. The exporter crops equal grid cells, pads transparent pixels without resampling, and writes fixed frame sizes with bottom-center anchors: Fernling 288 × 288; Duskwing 328 × 304.
- Run `python3 art/characters/export-creature-combat.py` to recreate the runtime PNGs. `creature-combat-metadata.json` records source IDs, frame order, dimensions, anchor and cadence.
- The initial two-species batch proves the atlas contract; the other six current creatures still use their static portraits.

## Identity and quality records

`art/assets/subjects.json` assigns stable visual IDs and hashes canonical references, generated source sheets, and runtime outputs for the player, Fernling, and Duskwing; `npm run validate` verifies those links and digests. `export-profiles.json` records category-specific, versioned export settings. `visual-reviews.json` separates byte/frame checks from visual accept/rework/quarantine decisions; the captured creature contact sheet is under `reviews/`. See [`docs/ART_REVIEW.md`](../../docs/ART_REVIEW.md) for commands and the known pending visual/owner reviews.
