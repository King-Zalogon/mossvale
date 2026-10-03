# Optional authoring and systems prototypes

These modules are pure, opt-in building blocks. They do not change the current Mossvale pack, save schema, item tables, renderer, creature roster, or browser gameplay until a pack and UI explicitly adopt them.

## Terrain families (#96)

`domain/terrain-family.js` classifies a grid cell by its cardinal and diagonal neighbors, produces a stable family key, and chooses seeded variants reproducibly. It defaults to no transform; rotational reuse is only labeled safe when the caller explicitly opts in. This provides topology/seed behavior for an authoring tool to bake. It does not add grass/path/water source art, bridge semantics, or editor previews.

## Optional bag and storage (#99)

`domain/inventory.js` validates pack-defined item/capacity tables and applies all-or-nothing move and valuable-sale transactions to caller-owned inventory state. Full destination, invalid quantity, unknown item, and non-saleable items leave state untouched. Existing supplies and saves continue using the established economy; this is not yet an adapter/migration for old saves, gather/drop tables, buying, healing effects, or UI.

## Event-driven objectives (#100)

`domain/objective-events.js` defines a small linear stage list triggered by typed events. Each event advances at most one stage, and a terminal reward is returned once in state. A pack can persist the returned state through its normal transaction layer. It does not yet extend the shipped objective validator, dialogue choices, gameplay event wiring, or browser UI.

## Compositional creatures (#101)

`domain/composition.js` compiles a plan and assigned tagged parts into flat `parts`, unique `abilities`, and bounded modifiers, reporting missing/incompatible/unknown slots. It changes no species definitions and does not compose artwork; generated visual identity briefs and a roster of sample compositions remain follow-up.

## Optional companion routes (#102)

`domain/companion-routes.js` checks whether a companion has a route's optional ability and habitat tags, and validates that each starter retains access to marked recovery routes. This is a route-offer data check only: no shipped maps, unlock persistence, route telegraph, discovery reward, or movement physics change yet.

Run the focused prototype suite with `node --test tests/graftworks-prototypes.test.mjs`. These modules are intentionally independent so the shared systems can be adopted gradually after pack and owner review.
