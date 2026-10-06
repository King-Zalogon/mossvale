# Optional authoring and systems work

Most modules in this document are pure, opt-in building blocks. The terrain-family authoring workflow is available in Map Workshop; it does not change shipped maps, the save schema, or browser-game collision.

## Terrain families (#96)

`domain/terrain-family.js` compiles a 32 × 20 grass/path/water fixture into deterministic per-cell records: exact cardinal and diagonal masks, shore edges, authored SVG sources, source anchors, lighting direction, seeded variants, bridge overlays and explicit walkability. The exported JSON stores row-aligned layers and shares source metadata between cells. Eight hand-authored northwest-lit SVG tiles cover grass, path, water and bridge materials. The compiler never rotates or mirrors them; a bridge must use art authored for its declared orientation. Water blocks movement, while only the two bridge-deck cells are walkable. The test fixture includes a long river crossing, narrow paths, junctions, corners, shorelines and a large repeated meadow.

The Map Workshop preview layers a narrow sandy lip and small land-side reed marks over detected shore edges. This is an experimental preview treatment only: it does not alter source SVGs, compiled records, collision, or shipped maps, and still needs visual review before any pack adopts the family.

Run `npm run terrain:bake` after changing the fixture, then `npm run validate`; validation checks the local SVG files, their tile bounds, safe contents and exact reproducibility of `dist/maps/terrain-family-fixture.baked.json`. In each baked layer, row/column indices are zero-based map y/x; recipe and surface rows are comma-separated IDs, walkability is a `1`/`0` string, and topology masks are hexadecimal digits with north/east/south/west bits `1/2/4/8`. In Map Workshop, use **Preview family art on map** to see the shared grass/path/water source family on the selected map. The separate family canvas previews all 640 fixture cells; changing the seed changes variants deterministically, and **Export baked data** downloads the current seed's compiler output. Existing map JSON and runtime collision rules remain unchanged until a game pack explicitly adopts a compiled family.

## Optional bag and storage (#99)

`domain/inventory.js` validates pack-defined item/capacity tables and applies all-or-nothing move and valuable-sale transactions to caller-owned inventory state. Full destination, invalid quantity, unknown item, and non-saleable items leave state untouched. Existing supplies and saves continue using the established economy; this is not yet an adapter/migration for old saves, gather/drop tables, buying, healing effects, or UI.

## Event-driven objectives (#100)

Event objectives and conditional dialogue choices are opt-in pack data. Stages respond to normal gameplay events, their completion markers share the bounded save event journal, and terminal rewards are paid once. Choices use stable speaker/target IDs and the existing flag/condition language inside the keyboard- and touch-accessible speech bubble. The shipped pack demonstrates two optional goals with existing artwork; packs without these fields retain their current simple objective and dialogue behavior. This does not add branching scripts, item conditions, a save-schema migration, or new art.

## Compositional creatures (#101)

`domain/composition.js` compiles a plan and assigned tagged parts into flat `parts`, unique `abilities`, and bounded modifiers, reporting missing/incompatible/unknown slots, excluded tags, and aggregate modifier overflow. `art/characters/composition-prototypes.json` now proves three compositions, including a novel `reed-skimmer` body plan authored entirely as data. The focused suite verifies each flattened result with the ordinary pack species validator and generates a structured anatomy/identity brief with `createCompositionArtBrief`. Run `npm run composition:briefs` to print those art briefs. The examples remain outside the shipped roster: briefs guide human sprite work and do not assemble or generate artwork.

## Optional companion routes (#102)

`domain/companion-routes.js` checks optional ability/habitat requirements and verifies recovery for every starter. Map exits can now declare a route gate, player-facing hint, one-time reward and stable unlock event. The Reedfen-to-Lantern-Islet cut uses Brooklet's optional `cross-shallow-water`/`wetland` tags; once discovered it stays open after reload for any companion. The existing boardwalk remains available to all starters. The route is a data-driven portal shortcut with static sign art; it does not change global water physics or add movement animations.

Run the focused prototype and terrain-family compiler suite with `node --test tests/graftworks-prototypes.test.mjs`. The other systems remain independently adoptable after pack and owner review.
