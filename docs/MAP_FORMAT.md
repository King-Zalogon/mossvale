# Map and event data format (version 1)

The browser authoring tool is available at `dist/map-editor.html`. It edits terrain, spawn points, and whole existing or newly placed entity records while preserving extra pack fields. JSON imports are limited to 1 MB and oversized files are rejected before the browser reads them. “Play edited map” opens the selected map in the normal engine renderer in a fresh, read-only preview session. Run `npm run validate` after exporting; the CLI and game use the same map schema.

Issue [#14](https://github.com/King-Zalogon/mossvale/issues/14). Maps are JSON files in `dist/maps/`, listed in `dist/maps/index.json` (the adventure pack manifest, see [PACKS.md](PACKS.md)). The runtime reads them at startup (`services/maps.js`), validates them (`domain/mapdata.js`) and compiles them (`domain/adventure.js`). No rule code names a specific map: change the data, not the engine.

## Workflow

The Map Workshop’s Show topology toggle outlines neighboring terrain boundaries and reports the selected tile’s cardinal/corner key. **Preview family art on map** displays the shared authored grass/path/water source family while painting. The separate 32 × 20 Verdant crossing fixture exercises narrow paths, junctions, shorelines, a large repeated meadow, seeded source variants and an explicitly walkable bridge over blocked water. `dist/maps/terrain-family-fixture.baked.json` stores row-aligned recipe, topology and explicit walkability layers; the shared artwork table carries source paths, anchors and lighting. Run `npm run terrain:bake` after editing that fixture; `npm run validate` checks the baked data and local SVG sources. This compiler output is for Map Workshop and content review; existing maps keep their current format and gameplay renderer until a pack explicitly adopts it.

1. Edit `dist/maps/<id>.json`.
2. `npm run validate` checks every map; errors name the map, field and problem (e.g. `map meadow: exits[0] (east).to.spawn: map "amber-ridge" has no spawn "cellar"`).
3. `npm run map:preview -- meadow` prints an ASCII preview (terrain, solid objects, spawns, landmarks, exits, encounter pool).
4. `npm run maps:design-report` creates a spatial route report and annotated SVG for every shipped map; see [how to read and act on it](MAP_DESIGN_REPORT.md).
5. Open the game with `python3 -m http.server 8080 --directory dist` (or `npm start`) and walk it. Use `map-editor.html` for a visual editing and preview workflow.

Map files and `src/data/regions.js` are linked by `id`: each region needs a map with the same id (and vice versa). Region ids are saved and must never change.

## File shape

```jsonc
{
  "format": 1,
  "id": "meadow", // lowercase-kebab-case, unique, stable
  "name": "Mossvale Meadow",
  "preview": "tree-oak", // optional registered sprite for this map's Island card; no gameplay or save effect
  "size": { "w": 25, "h": 25 }, // each dimension 4..128; at most 16,384 tiles total
  "legend": { ".": "void", "g": "ground", "p": "path", "w": "water", "t": "tallgrass" },
  "terrain": ["...25 chars...", "..."], // exactly h rows of w characters
  "spawns": { "camp": [12, 13] }, // "camp" is required; other names can be exit targets
  "landmarks": [ ... ], "exits": [ ... ], "props": [ ... ], "zones": [ ... ], "triggers": [ ... ]
}
```

| Terrain | Meaning |
| --- | --- |
| `.` void | Outside the island: not drawn, not walkable |
| `g` ground | Walkable land |
| `p` path | Walkable land drawn as a trail |
| `w` water | Drawn, blocks walking |
| `t` tallgrass | Walkable; encounter zones usually use it |

Collection fields (`landmarks`, `exits`, `props`, `zones`, `triggers`) must be arrays when provided. Malformed values return a map/field error before compilation.

Coordinates are tile units; `[x, y]` may be fractional (props are offset from the grid).

An optional `preview` names one registered asset shown on this map's Island card. Choose a non-secret, recognizable landmark or habitat prop; the card still obeys its existing visibility and travel rules. This is presentation metadata only: it does not change map access, route discovery, or save data.

## Sections

**landmarks**: `{ id, kind, sprite, at, w, label?, solid?, flag?, ... }`. `kind` is one of `cottage`, `ranger`, `shrine`, `chest`, `sign`. `sprite` is a name from the asset manifest (`src/data/assets.js`), `w` its drawn width.
- `shrine`: needs `guardian: { species, level, tactic?, power? }` (tactics are listed in `src/data/tactics.js`, see [BATTLE.md](BATTLE.md)), `flag` (the milestone it completes, e.g. `meadow.seal`) and `reward: { coins, potions, xp }` (paid once when the seal is earned).
- `chest`: needs `flag` (e.g. `meadow.chest`, makes opening persistent) and `reward: { coins, potions, orbs }`. Existing region chests keep their legacy `<region>.chest` flag. Additional caches use a stable per-chest flag such as `meadow.chest:riverbend-cache`; it is stored independently in the existing optional `mapFlags` save field and does not change old save formats.
- `sign`: needs `text` (or `lines`). `ranger`: `name`, optional `tag` (the short label drawn above it). Any landmark may have `lines` (see [OBJECTIVES.md](OBJECTIVES.md)) or an optional `choices` list. A choice has stable `id`, `speaker` and `target` landmark IDs, `text`, `reply`, optional `when` condition, and optional typed `event`. Choices use the same speech bubble; buttons support Tab, arrow keys, Enter/Space and touch. Without `choices`, the existing short-dialogue flow is unchanged.

**secrets and map names** ([NAVIGATION.md](NAVIGATION.md)): any landmark may set `secret: true` (it stays off every map until the player walks within 2.5 tiles) and `mapLabel` (the name maps show). A sign can set `routeHint: "<route-id>"` to stay hidden with its companion route until that route is discovered. **quiet**: `[{ id, rect: [x0, y0, x1, y1], label? }]` marks corridors where no wild encounter starts, whatever the encounter zones say.

**exits**: `{ id, sprite, at, w, label, to: { map, spawn }, requires?, route? }`. `to` must name an existing map and a spawn defined there. `requires` is a milestone flag that must be done first. An optional companion `route` has `{ id, requires: { ability, habitat? }, hint, unlockedText, reward }`; it is concealed, including its linked `routeHint` signs and map markers, until the player moves within 2.5 tiles with a matching active companion. Discovery saves a stable `route-<id>` event and grants the capped reward once. After discovery the route stays marked and open for every companion, including on older saves whose exploration map had recorded the hidden exit before it was concealed. Keep an ordinary reachable exit as a recovery path; route gates never change global water/terrain physics.

**props**: groups of decoration: `{ sprite, kind: "scenery" | "grass" | "flower", w, solid?, at: [[x, y], ...] }`. `solid` is a collision radius.

**zones** (encounters): `{ id, terrain: ["t"], rect?: [x0, y0, x1, y1], pool: [speciesId | { species, weight?, behavior?, field? }...], level: [min, max], distance?: [min, max] }` (see [ENCOUNTERS.md](ENCOUNTERS.md)). `behavior` is one of `wary`, `territorial` or `curious`; it gives an existing species a bounded field cue and battle pattern while keeping the ordinary capture and recovery flow. Optional `field` values are `{ duration?: 0.5..5, radius?: 1..6, recovery?: "retreat-and-retry" | "return-to-patch" | "circle-and-retry" }`; invalid or absent values use the behavior's safe default. Walking in a matching tile for long enough starts a wild encounter from `pool`. The first matching zone wins, so list narrow zones first.

**triggers** (a trigger needs `do` actions, scene `events`, or both): `{ id, at, radius?, on: "enter" | "interact", once?, do: [...] , events?: [...] }`. Existing `do` actions support a short toast or wild battle. Reusable `events` have a stable id, condition (`flag`, `met`, `caught`, `seen`, `visited`, `all`, or `not`) and required `repeatable: true | false`. Their action list can show dialogue, grant capped supplies, set a map milestone flag, start a repeatable challenge, or stage movement/facing/reaction using `player` and ranger landmark IDs. Choreography is capped at 24 actions, 128 movement steps per destination, 4096 route cells and 5-second waits; see [SCENE_ACTIONS.md](SCENE_ACTIONS.md) for action shapes and interruption behavior. Dialogue actions use `{ "type": "dialogue", "speaker": "ranger", "text": "..." }`; speaker is a stable landmark ID from that map, `player`, or `narrator` (the explicit top-of-viewport fallback). Lines remain ordered data, so a reply or a new speaker is another action. Bubbles are positioned from the current camera projection and use the same keyboard/touch advance controls. One-time event keys, flags and rewards are saved before visual choreography begins, so interruption cannot replay rewards after refresh. Challenge interactions must be repeatable so losing never consumes them. No script callbacks or arbitrary runtime code are allowed.

## Persistence is separate from geometry

Maps are immutable. Progress lives in the save under stable flags of the form `<map-id>.seal` (the shrine guardian was beaten) and `<map-id>.chest` (the legacy region chest was opened). These resolve to the existing `badges` / `chests` lists in the v3 save (`domain/rules.js: flagDone`), so existing saves keep working. Additional caches use `<map-id>.chest:<cache-id>` and are stored independently in the existing optional `mapFlags` field. One-time companion-route discoveries use the existing `events` list and save transaction; they add no schema field. Editing a map never changes what the player has completed. Flags are unique within an adventure pack and a save records which pack it belongs to, see [PACKS.md](PACKS.md).

## What validation checks

Format version, unique ids, grid size and characters, known sprites and species, flag syntax and the map they name, exit targets and target spawns, spawns on walkable ground, landmarks and exits on land, every landmark/exit reachable from the camp spawn (flood fill over walkable tiles), and zones that cover at least one reachable tile.

## Limits

- Rectangular maps can be up to 128 tiles per side and 16,384 tiles total. A 120 × 80 test map is the first large-world target; validation also caps authored entities and prop positions. Eleven Mossvale maps ship today: eight connected route maps, Brackenwake Commons, and the two-map Rootglass side route. Other larger biome pairs remain tracked in #52–#54.
- Reachability uses tile-level flood fill, an approximation of continuous movement.
- Layers beyond terrain + props, and per-tile event scripting, are intentionally out of scope.

## Side-map completion

Regional seals/chests retain their legacy saved region IDs. Completion flags for side maps are stored independently in `mapFlags`, scoped to the selected adventure and preserved by backup/import. Each cache pays once across reloads without consuming another map’s chest. Saves with no side-map flags retain the existing serialized shape.

Optional shrine `guardian.combatSprite` selects an existing same-species 4×5 combat atlas for that shrine's enemy only. All four Mossvale examples and the unique species/tactic selection restriction are documented in [guardian forms](GUARDIAN_COMBAT_FORMS.md). Other creature displays keep normal assets; the field adds no save identity.

### Discovery notices

A landmark may define `discoveryText`: a trimmed string of 1–160 characters describing the specific find and its useful context. Secret landmarks show this nonblocking notice only on their first nearby discovery. Older packs without the field use `Found <mapLabel>.`. Keep names consistent with the map and journal, and reserve directions for navigation signs and longer stories for interaction dialogue. This field does not reveal a secret before discovery or change save data.

Interaction triggers may opt into `beforeLandmark: true` to let eligible scene events run before a nearby prop's generic inspection. Default false preserves older packs. This option is valid only with `on: "interact"`. For conditional one-time evidence, set trigger `once: false`; each non-repeatable scene event has its own durable once-only key. Otherwise a premature interaction can consume the trigger before prerequisites are met. Optional event `note` records discovered text for the field journal; see [scene actions](SCENE_ACTIONS.md).

Optional map `hints` configure requested observations and leads with discovered/access conditions, resolution conditions and up to three disclosure levels. They compile through the shared map loader and are absent by default. See [investigation help](INVESTIGATION_HINTS.md) for stable heard IDs, active-companion capability checks, authoring limits and compatibility.


Landmarks may define optional `labels`: 1–8 `{when, text}` lines for their interaction prompt, with 1–80 characters per text. These reuse objective conditions and choose the first matching line; no match falls back to `label`. They do not change the stable `mapLabel`, marker discovery or interaction effects. Scene-event references must exist. Orchard resolution prompts disclose **Open the water bypass first** / **Guide the family to dry roots first** only after the family is observed and neither outcome is complete; ordinary inspection remains before and afterward.

### Conditional decoration

A decorative `props` group may include `when` using the existing objective conditions (`event`, `flag`, `all`, `any`, `not`, and the other documented conditions). The renderer evaluates it against the current save every frame. Omit it for always-visible scenery. Referenced events must exist, and a conditional group must not have `solid`: hiding scenery cannot alter collision, block a route or strand an old save. Conditions do not grant rewards or add autonomous creature behavior.

For example, use `{ "when": { "event": "orchard-ruins/outcome-water-first" }, "sprite": "wood-plank-stack", "kind": "scenery", "w": 32, "at": [[49.8, 40.4]] }` for repair materials beside the cleared bypass. Pair with a mutually exclusive condition on the old placement. [The orchard pattern](ORCHARD_CONSEQUENCES.md) explains committed-objective callbacks and the visual limits.
