# Map and event data format (version 1)

Issue [#14](https://github.com/King-Zalogon/mossvale/issues/14). Maps are JSON files in `dist/maps/`, listed in `dist/maps/index.json`. The runtime reads them at startup (`services/maps.js`), validates them (`domain/mapdata.js`) and compiles them (`domain/adventure.js`). No rule code names a specific map: change the data, not the engine.

## Workflow

1. Edit `dist/maps/<id>.json`.
2. `npm run validate` checks every map; errors name the map, field and problem (e.g. `map meadow: exits[0] (east).to.spawn: map "amber-ridge" has no spawn "cellar"`).
3. `npm run map:preview -- meadow` prints an ASCII preview (terrain, solid objects, spawns, landmarks, exits, encounter pool).
4. Open the game with `python3 -m http.server 8080 --directory dist` (or `npm start`) and walk it. A visual editor is optional and not planned.

Map files and `src/data/regions.js` are linked by `id`: each region needs a map with the same id (and vice versa). Region ids are saved and must never change.

## File shape

```jsonc
{
  "format": 1,
  "id": "meadow", // lowercase-kebab-case, unique, stable
  "name": "Mossvale Meadow",
  "size": { "w": 25, "h": 25 }, // 4..64
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

Coordinates are tile units; `[x, y]` may be fractional (props are offset from the grid).

## Sections

**landmarks**: `{ id, kind, sprite, at, w, label?, solid?, flag?, ... }`. `kind` is one of `cottage`, `ranger`, `shrine`, `chest`, `sign`. `sprite` is a name from the asset manifest (`src/data/assets.js`), `w` its drawn width.
- `shrine`: needs `guardian: { species, level, tactic?, power? }` (tactics are listed in `src/data/tactics.js`, see [BATTLE.md](BATTLE.md)), `flag` (the milestone it completes, e.g. `meadow.seal`) and `reward: { coins, potions, xp }` (paid once when the seal is earned).
- `chest`: needs `flag` (e.g. `meadow.chest`, makes opening persistent) and `reward: { coins, potions, orbs }`.
- `sign`: needs `text` (or `lines`). `ranger`: `name`, optional `tag` (the short label drawn above it). Any landmark may have `lines` (see [OBJECTIVES.md](OBJECTIVES.md)).

**exits**: `{ id, sprite, at, w, label, to: { map, spawn }, requires? }`. `to` must name an existing map and a spawn defined there. `requires` is a milestone flag that must be done first.

**props**: groups of decoration: `{ sprite, kind: "scenery" | "grass" | "flower", w, solid?, at: [[x, y], ...] }`. `solid` is a collision radius.

**zones** (encounters): `{ id, terrain: ["t"], rect?: [x0, y0, x1, y1], pool: [speciesId | { species, weight }...], level: [min, max], distance?: [min, max] }` (see [ENCOUNTERS.md](ENCOUNTERS.md)). Walking in a matching tile for long enough starts a wild encounter from `pool`. The first matching zone wins, so list narrow zones first.

**triggers**: `{ id, at, radius?, on: "enter" | "interact", once?, do: [{ type: "toast", text } | { type: "battle", species, level }] }`. Deliberately small; milestones and dialogue are tracked in [#18](https://github.com/King-Zalogon/mossvale/issues/18).

## Persistence is separate from geometry

Maps are immutable. Progress lives in the save under stable flags of the form `<map-id>.seal` (the shrine guardian was beaten) and `<map-id>.chest` (the chest was opened). Today these resolve to the existing `badges` / `chests` lists in the v3 save (`domain/rules.js: flagDone`), so existing saves keep working. Editing a map never changes what the player has completed. Pack-level namespacing of flags arrives with [#50](https://github.com/King-Zalogon/mossvale/issues/50).

## What validation checks

Format version, unique ids, grid size and characters, known sprites and species, flag syntax and the map they name, exit targets and target spawns, spawns on walkable ground, landmarks and exits on land, every landmark/exit reachable from the camp spawn (flood fill over walkable tiles), and zones that cover at least one reachable tile.

## Limits

- Eight authored maps are supported (`MAX_SIZE` 64 per side, any number of files), but only three exist today; the new biome maps arrive with #51–#54.
- Reachability uses tile-level flood fill, an approximation of continuous movement.
- Layers beyond terrain + props, and per-tile event scripting, are intentionally out of scope.
