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

- Fernling and Duskwing were generated on 2026-10-03 as the first combat-sheet milestone. Brooklet and Hushram were added on 2026-10-03 as the next art batch. All four raw generated images are retained under `source/creature-*-combat-generated.png` and use their current transparent portrait as the identity reference.
- Each sheet has four columns and five state rows: idle, attack, hit, faint and capture. The exporter crops equal grid cells, pads transparent pixels without resampling, and writes fixed frame sizes with bottom-center anchors: Fernling, Brooklet and Hushram 288 × 288; Duskwing 281 × 281.
- Run `python3 art/characters/export-creature-combat.py` to recreate the runtime PNGs. `creature-combat-metadata.json` records source IDs, frame order, dimensions, anchor and cadence.
- The first four species now have animated combat frames; the remaining four current creatures still use their static portraits.

## Creature follower direction milestone (#90)

- Emberkin and Fernling overworld follower sheets were generated on 2026-10-03 from their current transparent creature portraits. The retained `*-follower-generated.png` sheets are the direction-preserving, margin-corrected generation outputs; `*-follower-initial.png` retains the first generated draft for review history.
- Duskwing and Brooklet follow-up sheets were generated on 2026-10-03 from their current transparent portraits, with the combat atlases used only as secondary identity references. The generated source sheets are retained as `creature-duskwing-follower-generated.png` and `creature-brooklet-follower-generated.png`; Brooklet's undersized second-row pose was revised before export. These are overworld sheets and remain separate from the combat art.
- Each runtime atlas is 5 columns × 8 rows: idle, walk-1…walk-4 across all eight directions. Fernling and Duskwing use the standard N, NE, E, SE, S, SW, W, NW row order. Emberkin and Brooklet record their generated pose order explicitly in `creature-follower-metadata.json` and the manifest; Brooklet’s two mirrored side rows map its generated left-facing profiles to both world directions. The exporter trims low-alpha noise, fits each complete cell silhouette to a 184 × 184 content box with nearest-neighbor scaling, and aligns the visible feet at y=196 in fixed 200 × 200 cells. Runtime PNGs are 1000 × 1600 and remain separate from the combat atlases.
- The browser preview at `dist/creature-follower-preview.html` displays all six species' frames beside the red-cap player at gameplay scale and runs diagonal-turn, stop, backtrack and depth/foreground scenarios. Follower facing and frame cadence use the follower's own sampled path displacement; stopping and reduced motion hold the last direction with idle frame 0.
- `python3 art/characters/export-creature-followers.py --check` verifies the normalized runtime sheets; `art/characters/creature-follower-metadata.json` records frame order, size, anchor, cadence, prompt summaries and reference species.
- Hushram and Voltkit are the next independent art batch. Their generated source sheets are `source/creature-hushram-follower-generated.png` and `source/creature-voltkit-follower-generated.png`; Voltkit is an original crystal-tailed species design, not a recolor of another creature. Both exports use the same 5 × 8 direction/frame layout and are listed separately in follower metadata. These sheets expand coverage to six species; six active species still need art and normal-game acceptance remains tracked by #90/#131.

## Additional combat art batch (#85)

- Emberkin and Voltkit combat generation sources are `source/creature-emberkin-combat-generated.png` and `source/creature-voltkit-combat-generated.png`. Each exports a 4 × 5 atlas of idle, attack, hit, faint and capture states, with source briefs and style references in `creature-combat-metadata.json`.
- `dist/creature-combat-preview.html` now includes these sheets beside existing combat art. This brings the combat preview to six species; the active roster's remaining sheets and owner gameplay acceptance are still open under #85.

## Terrain topology authoring preview (#96)

- The map editor topology toggle overlays deterministic edge/corner classifications and a topology key for the selected terrain. It helps authors inspect neighbor masks and connectivity while painting. It does not assign tile-family artwork or bake terrain variants; those remain the next #96 milestone.

## Optional inventory persistence (#99)

- A pack may declare an `inventory` registry with bounded item definitions, carry/storage caps and drops. The registry validator checks this optional section; save codecs created for that pack preserve known bag/storage stacks, coins and one-time reward claims within the declared caps. Existing packs without the section retain their prior save shape. Domain transactions and two-pack fixtures are covered by `tests/inventory.test.mjs`.
- Runtime menus, stash landmarks and capture/defeat reward wiring are still required before the inventory feature is integrated into gameplay; #99 remains open.

## Identity and quality records

`art/assets/subjects.json` assigns stable visual IDs and hashes canonical references, generated source sheets, and runtime outputs for the tracked art subjects; `npm run validate` verifies those links and digests. `export-profiles.json` records category-specific, versioned export settings. `visual-reviews.json` separates byte/frame checks from visual accept/rework/quarantine decisions; the follower contact sheet under `reviews/` now includes six species. See [`docs/ART_REVIEW.md`](../../docs/ART_REVIEW.md) for commands and the known pending visual/owner reviews.
