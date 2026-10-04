# Optional authoring and systems prototypes

These modules are pure, opt-in building blocks. They do not change the current Mossvale pack, save schema, item tables, renderer, creature roster, or browser gameplay until a pack and UI explicitly adopt them.

## Terrain families (#96)

`domain/terrain-family.js` classifies a grid cell by cardinal edges and diagonal corners, labels isolated/end/straight/corner/tee/cross shapes, and chooses seeded variants reproducibly. Corner-specific art can override a cardinal mask. Missing edge art returns `null` instead of falling back to a center tile. It defaults to no transform; rotational reuse is only labeled safe when the caller explicitly opts in. This is still topology data for an authoring tool to bake: no grass/path/water source art, bridge semantics, map compiler integration, or editor previews are included.

## Optional bag and storage (#99)

`domain/inventory.js` validates pack-defined item/capacity tables and applies all-or-nothing move and valuable-sale transactions to caller-owned inventory state. Full destination, invalid quantity, unknown item, and non-saleable items leave state untouched. Existing supplies and saves continue using the established economy; this is not yet an adapter/migration for old saves, gather/drop tables, buying, healing effects, or UI.

## Event-driven objectives (#100)

Event objectives and conditional dialogue choices are opt-in pack data. Stages respond to normal gameplay events, their completion markers share the bounded save event journal, and terminal rewards are paid once. Choices use stable speaker/target IDs and the existing flag/condition language inside the keyboard- and touch-accessible speech bubble. The shipped pack demonstrates two optional goals with existing artwork; packs without these fields retain their current simple objective and dialogue behavior. This does not add branching scripts, item conditions, a save-schema migration, or new art.

## Compositional creatures (#101)

`domain/composition.js` compiles a plan and assigned tagged parts into flat `parts`, unique `abilities`, and bounded modifiers, reporting missing/incompatible/unknown slots, excluded tags, and aggregate modifier overflow. It changes no species definitions and does not compose artwork; generated visual identity briefs and a roster of sample compositions remain follow-up.

## Optional companion routes (#102)

`domain/companion-routes.js` checks whether a companion has a route's optional ability and habitat tags, filters route offers, validates route IDs/requirements, and ensures each starter can reach at least one recovery route. This is a route-offer data check only: no shipped maps, unlock persistence, route telegraph, discovery reward, or movement physics change yet.

Run the focused prototype suite with `node --test tests/graftworks-prototypes.test.mjs`. These modules are intentionally independent so the shared systems can be adopted gradually after pack and owner review.
