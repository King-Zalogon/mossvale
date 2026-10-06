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

Issue #130 found missing opposite-leg steps at game scale. The NE and SW v2 strips remain as the retained source; export order selects their walk cells as 1, 2, 4, 3 because generated cells 2 and 3 repeated the same leading leg. NE v3 was generated on 2026-10-06 from the v2 strip with the Southeast source strip as style/gait reference, retaining the 5 × 2 grid and transparent background. West v3 was generated on 2026-10-06 from its prior 5 × 2 strip with the explicit left-facing four-pose walk brief; its walk column 3 is replaced by the separately generated [`person-red-cap-motion-west-alternate-stride-v1.png`](source/person-red-cap-motion-west-alternate-stride-v1.png), a single transparent pose edited from the west-leading frame to reverse the leg and arm swing. Idle and NW rows remain from the west/northwest sheet. All revisions retain the red-cap identity, pixel palette and bottom anchor. The image tool did not report a provider, model version or seed; the prompt brief is captured here and source digests are maintained in `art/assets/subjects.json`.

Each generation sheet used the same brief: create a transparent 5-column × 2-row sprite sheet of the existing red-cap adventurer, at the original isometric view, palette, pixel scale, clothing and lighting; use one direction per row, idle followed by four compact alternating walk poses; keep character size, torso, head, backpack and foot line fixed; leave gaps between sprites; no body bob, shadows, scenery, labels or background. The row directions for each source image are listed above. Diagonal references used the nearest cardinal reference with the prior generated batch as a style reference.

## NPCs

- Generated turnaround: [`person-traveler-gardener-turnaround-source.png`](source/person-traveler-gardener-turnaround-source.png), 4 columns × 2 rows.
- Runtime atlases: [`person-traveler.png`](../../dist/assets/people/person-traveler.png) and [`person-gardener.png`](../../dist/assets/people/person-gardener.png), each 640 × 256 px.
- Style references: the existing red-cap east and south sprites.

Generation brief: a transparent 4 × 2 isometric pixel-art turnaround sheet, N/E/S/W in each row, matching the existing upper-left warm light, dark outline and warm palette. The top row is a stocky, bearded, ochre-cap traveler with a green coat, rust shirt, broad backpack and bedroll. The lower row is a slender braided gardener with a pale kerchief, linen shirt, moss-green pocket apron and plum skirt/trousers. Four neutral full-body poses each, feet aligned; no labels, scenery, floor or shadow.

## Export and metadata

Run `python3 art/characters/export.py` with Pillow installed. `metadata.json` records frame order, dimensions, bottom-center anchors, and walk cadence. Open `dist/character-preview.html` to inspect every player pose and NPC facing at gameplay scale, including the production renderer fixture. The PNGs are flattened generated source sheets rather than layered Aseprite documents; use the retained source grids and export script for future edits.

## Creature animation treatment

The twelve current creature portraits remain the generated source images in `art/assets/source/creatures-atlas.png`, cropped and recorded in `art/assets/metadata.json`. A shared animation treatment applies to every manifest creature, so newly added species inherit it without per-species code: idle breathing, distance-paced travel bob, event-driven hit recoil and capture draw-in. The treatment leaves the art pixels and ground anchor unchanged. State methods, cadence and reduced-motion behavior are recorded in [`creature-animation-metadata.json`](creature-animation-metadata.json).

## Creature combat frame milestone

- Fernling and Duskwing were generated on 2026-10-03 as the first combat-sheet milestone. Brooklet and Hushram were added on 2026-10-03 as the next art batch. All four raw generated images are retained under `source/creature-*-combat-generated.png` and use their current transparent portrait as the identity reference.
- Emberkin and Voltkit combat sheets add two more species. Their immutable generated PNG bytes are stored in bounded parts referenced by `source-archive.json`; `source_archive.py` verifies and streams those exact bytes to the exporter, and `restore-generated-sources.py` can reconstruct the original PNG files for editing.
- Mushmallow and Frostowl add the next two combat species. Their transparent source atlases use the same four-column, five-state grid and preserve their canonical mushroom-hedgehog and ice-owl identities; exact PNG bytes are retained as SHA-256-checked 600 KB archive chunks. The 256-color runtime exports use no dithering and keep the shared 288 × 288 frame and foot-anchor contract.
- Each sheet has four columns and five state rows: idle, attack, hit, faint and capture. The exporter crops equal grid cells, pads transparent pixels without resampling, and writes fixed frame sizes with bottom-center anchors: Fernling, Brooklet and Hushram 288 × 288; Duskwing 281 × 281.
- Emberkin and Voltkit runtime sheets use a 256-color indexed PNG palette with no dithering; their complete original RGBA source sheets remain unchanged in the archive. Run `python3 art/characters/export-creature-combat.py` to recreate runtime PNGs. `creature-combat-metadata.json` records source IDs, original hashes, frame order, dimensions, anchor and cadence.
- Pebblit, Bramblebuck, Siltkip and Sunskitter complete the combat roster. Their 4×5 transparent sources use species-specific frame profiles where needed to preserve the generated pixels and shared ground anchor. Fernling's revised faint row progressively lowers the creature to a lying pose; the prior detached leaf fragments are removed.
- All twelve species have five combat states. `make-combat-contact-sheet.py` inspects each source at 115 px beside its canonical portrait. The optional combat manifest IDs retain the static portrait as fallback; state timing and reduced-motion behavior remain renderer controlled.

## Creature follower direction milestone (#90)

- Emberkin and Fernling overworld follower sheets were generated on 2026-10-03 from their current transparent creature portraits. The retained `*-follower-generated.png` sheets are the direction-preserving, margin-corrected generation outputs; `*-follower-initial.png` retains the first generated draft for review history.
- Duskwing and Brooklet follow-up sheets were generated on 2026-10-03 from their current transparent portraits, with the combat atlases used only as secondary identity references. The generated source sheets are retained as `creature-duskwing-follower-generated.png` and `creature-brooklet-follower-generated.png`; Brooklet's undersized second-row pose was revised before export. These are overworld sheets and remain separate from the combat art.
- Hushram and Voltkit follower sheets extend the batch. Their exact generated PNG bytes are retained in `source-archive.json` chunks and verified by SHA-256 before export; use `restore-generated-sources.py` to reconstruct authoring PNGs. The source sheets stay independent from the runtime's indexed palette exports.
- Mushmallow and Frostowl add the third follower batch. Pebblit, Bramblebuck, Siltkip and Sunskitter complete the fourth batch; all generated sources are archived byte-for-byte in bounded chunks. Bramblebuck and Siltkip row segmentation uses a higher alpha threshold only for detecting row boundaries because isolated fringe pixels bridge adjacent rows; exported alpha cleanup still follows the shared profile.
- Each runtime atlas is 5 columns × 8 rows: idle, walk-1…walk-4 across all eight directions. Fernling and Duskwing use the standard N, NE, E, SE, S, SW, W, NW row order. Emberkin and Brooklet record their generated pose order explicitly in `creature-follower-metadata.json` and the manifest; Brooklet’s two mirrored side rows map its generated left-facing profiles to both world directions. The exporter trims low-alpha noise, fits each complete cell silhouette to a 184 × 184 content box with nearest-neighbor scaling, and aligns the visible feet at y=196 in fixed 200 × 200 cells. Runtime PNGs are 1000 × 1600 and remain separate from the combat atlases.
- The browser preview at `dist/creature-follower-preview.html` displays all twelve species' frames beside the red-cap player at gameplay scale and runs diagonal-turn, stop, backtrack and depth/foreground scenarios. Follower facing and frame cadence use the follower's own sampled path displacement; each walk frame advances at 0.56 world units, matching the player's stride distance. Walking keeps the authored feet planted without an extra subpixel bob; stopping and reduced motion hold the last direction with idle frame 0. The #131 direction audit corrected the Emberkin west/northwest swap; Brooklet east/southeast swap; Voltkit's south/southeast and west/southwest/northwest rows; Hushram's west/northwest/southeast/southwest rows; and Mushmallow south/southeast rows. These mappings are recorded in both the exporter and runtime manifest.
- `python3 art/characters/export-creature-followers.py --check` verifies all twelve normalized runtime sheets; `art/characters/creature-follower-metadata.json` records frame order, size, anchor, cadence, prompt summaries and reference species. The static portraits remain fallback if an optional sheet cannot load. The 37 px contact sheet keeps technical visual review separate from pending owner taste and gameplay acceptance.

## Identity and quality records

`art/assets/subjects.json` assigns stable visual IDs and hashes canonical references, generated source sheets, and runtime outputs; `npm run validate` verifies those links and digests, including reconstruction of archived sources. `export-profiles.json` records category-specific, versioned export settings for the current player, NPC, portrait, combat and follower families. `visual-reviews.json` separates byte/frame checks from visual accept/rework/quarantine decisions; the captured twelve-species creature contact sheets are under `reviews/`. Terrain-transition exports remain pending because the game has no authored terrain sprite family. See [`docs/ART_REVIEW.md`](../../docs/ART_REVIEW.md) for commands and the pending visual/owner review items.
