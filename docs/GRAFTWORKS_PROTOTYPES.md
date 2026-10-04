# Optional authoring and systems prototypes

These modules are pure, opt-in building blocks. They do not change the current Mossvale pack, save schema, item tables, renderer, creature roster, or browser gameplay until a pack and UI explicitly adopt them.

## Terrain families (#96)

`domain/terrain-family.js` classifies cardinal edges and diagonal corners and chooses seeded source variants without unsafe transforms. The Map Workshop adds a Show topology overlay for the selected map and a 13 × 9 Verdant crossing fixture with grass/path/water recipes, an explicit two-cell bridge, corner overrides, and a seed control. The fixture checks walkability and both banks, and it stays outside `maps/index.json` so it cannot change shipped maps. Its vector colors, motifs and seams are an authoring prototype; production tile art and baked runtime variants are still pending.

## Optional bag and storage (#99)

`domain/inventory.js` validates pack-defined item/capacity tables and applies all-or-nothing move and valuable-sale transactions to caller-owned inventory state. Full destination, invalid quantity, unknown item, and non-saleable items leave state untouched. Existing supplies and saves continue using the established economy; this is not yet an adapter/migration for old saves, gather/drop tables, buying, healing effects, or UI.

## Event-driven objectives (#100)

`domain/objective-events.js` defines a small linear stage list triggered by typed events. Cycles are rejected, state can be checked after JSON reload, each event advances at most one stage, and a terminal reward is returned once in state. `domain/dialogue-choices.js` validates stable speaker/target IDs and filters choices using the existing objective conditions. These remain opt-in pure helpers: no shipped objective validator, gameplay event wiring, choice buttons/keyboard navigation, or browser UI is included.

## Compositional creatures (#101)

`domain/composition.js` compiles a plan and assigned tagged parts into flat `parts`, unique `abilities`, and bounded modifiers, reporting missing/incompatible/unknown slots, excluded tags, and aggregate modifier overflow. `art/characters/composition-prototypes.json` now proves three compositions, including a novel `reed-skimmer` body plan authored entirely as data. The focused suite verifies each flattened result with the ordinary pack species validator and generates a structured anatomy/identity brief with `createCompositionArtBrief`. Run `npm run composition:briefs` to print those art briefs. The examples remain outside the shipped roster: briefs guide human sprite work and do not assemble or generate artwork.

## Optional companion routes (#102)

`domain/companion-routes.js` checks optional ability/habitat requirements and verifies recovery for every starter. Map exits can now declare a route gate, player-facing hint, one-time reward and stable unlock event. The Reedfen-to-Lantern-Islet cut uses Brooklet's optional `cross-shallow-water`/`wetland` tags; once discovered it stays open after reload for any companion. The existing boardwalk remains available to all starters. The route is a data-driven portal shortcut with static sign art; it does not change global water physics or add movement animations.

Run the focused prototype suite with `node --test tests/graftworks-prototypes.test.mjs`. These modules are intentionally independent so the shared systems can be adopted gradually after pack and owner review.
