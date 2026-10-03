# Exploration and navigation

Issue [#73](https://github.com/King-Zalogon/mossvale/issues/73). Maps can be large (up to 128x128 tiles), so the game remembers what you have seen and shows it on two maps. Code: `src/domain/discovery.js` (pure), the minimap in `src/render/world.js`, the "This area" map in `src/ui/areamap.js`, `controller.js: explore()`.

## What is remembered

- **Explored ground.** Each map is divided into 4x4-tile cells. A cell is explored once you come within 6 tiles of it (the edge of the cell counts), so the ground around you is revealed as you walk and the camp is explored from the first moment.
- **Discovered places.** A landmark (`ranger`, `shrine`, `chest`, `sign`, `cottage`, a trail `gate`) is found when you come within 6 tiles. A landmark with `"secret": true` is found only within 2.5 tiles, shows a "You found something hidden" message, and does not exist on any map until then.
- Stored in the save as the optional `explored` field, one entry per map: `{c: <hex bit mask>, d: [<found landmark ids>]}`. A 128x128 map needs at most 256 hex characters and at most 64 found places, so the record is bounded and an unexplored save is byte-identical to before ([SAVE_FORMAT.md](SAVE_FORMAT.md)). Because it is part of the save, it travels with exports, checkpoints and the archive, stays with its adventure ([PACKS.md](PACKS.md)), starts empty on a new game, and is never mixed into the shared preferences. A mask that does not match its map's size is dropped; nothing else in the save is affected.
- Checked every couple of tiles, not every frame; the minimap layer is redrawn only when new ground is revealed.

## The two maps

- **Minimap** (corner of the world view): shows only explored ground and found places, scaled to fit any map size, and your position.
- **This area** (`M`, then the *This area* tab): the explored part of the current map, large enough to read. Dark ground is unexplored. It shows found places with names, the camp (always), your position, and quiet corridors. It pans and zooms by arrow keys / `WASD`, `+` and `-`, `0` to centre on you, the on-screen buttons (a comfortable touch size), dragging and the mouse wheel; *Show all* fits the whole map. Under the map, every known place is listed with its direction (north, south-east, …) and distance; choosing one centres the map on it.
- **Getting back.** *Return to camp* is always on the map screen and the world view: it puts you at the camp, next to the ranger, and loses nothing. Trails to other regions are named on the map with `(locked)` until you have earned the seal.

## Map data

```jsonc
{ "id": "carved-stone", "kind": "sign", "sprite": "signpost-wood", "at": [5.3, 2.3], "w": 38,
  "secret": true,                  // hidden from the maps until found nearby
  "mapLabel": "Carved stone",      // the name shown on maps (otherwise the landmark's name/tag/kind)
  "text": "Someone carved a tiny kettle here." }
```

```jsonc
"quiet": [ { "id": "tea-path", "rect": [3.5, 1.5, 5.5, 2.5], "label": "Tea path" } ]
```

## Encounter density and quiet corridors

[ENCOUNTERS.md](ENCOUNTERS.md) already sets density per zone: `distance: [min, max]` tiles of walking in that zone between encounters (lower is denser), plus pool and level range. `quiet` adds the other half: rectangles where wandering never starts a wild encounter even if an encounter zone covers the tiles, for routes the player should be able to walk calmly (a trail between camps, a village). Quiet corridors are validated (inside the map, `x0 <= x1`, `y0 <= y1`, unique ids), apply to every zone, and are drawn as dashed outlines on the area map once explored.

## Tests

`tests/discovery.test.mjs`: revealing, edges and odd map sizes, found places and secrets, the saved form (compact, round-trip, damaged or mismatched data), save integration and size bounds, backups and new game, compass and labels, quiet-corridor validation and effect. `tests/discovery.browser.mjs`: exploring grows the explored area and the minimap, survives a reload, the area map's keys / buttons / drag / wheel, the places list, return to camp, a secret found only up close, separate maps per adventure, preferences holding no world progress, and a 390 px phone.
