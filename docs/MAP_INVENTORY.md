# Map and asset reuse inventory

Issue [#27](https://github.com/King-Zalogon/mossvale/issues/27). A snapshot of the shipped adventure's maps, refreshed by hand when maps are added. `tests/integration.test.mjs` checks that every shipped map is listed here and that the route graph, return trips, spawns and saves hold together.

## Maps

| Map | Biome | Size | Walkable tiles | Exits to | Secrets | Quiet corridors | Encounter species |
| --- | --- | --- | ---: | --- | ---: | ---: | --- |
| `meadow` | meadow | 25×25 | 465 | `orchard-ruins` | 0 | 0 | bramblebuck, duskwing, emberkin, fernling |
| `amber-ridge` | badlands | 64×56 | 2035 | `orchard-ruins`, `frostveil-grove`, `stone-basin` | 1 | 5 | pebblit, sunskitter, voltkit |
| `frostveil-grove` | snowy-forest | 64×48 | 1735 | `amber-ridge`, `reedfen-wetlands`, `frostveil-pass` | 0 | 2 | duskwing, frostowl, hushram, pebblit |
| `frostveil-pass` | snowy-forest | 64×48 | 1515 | `frostveil-grove` | 1 | 2 | duskwing, frostowl, hushram |
| `reedfen-wetlands` | wetland | 64×56 | 2204 | `frostveil-grove`, `stilt-isles` | 1 | 4 | brooklet, mushmallow, siltkip |
| `orchard-ruins` | meadow | 25×25 | 365 | `meadow`, `amber-ridge` | 0 | 0 | bramblebuck, duskwing, emberkin, fernling |
| `stilt-isles` | wetland | 72×44 | 985 | `reedfen-wetlands`, `reedfen-wetlands` | 1 | 4 | brooklet, mushmallow, siltkip |
| `stone-basin` | badlands | 60×50 | 1744 | `amber-ridge`, `amber-ridge` | 2 | 4 | pebblit, sunskitter, voltkit |

## Route graph

- Meadow ⇄ Ruined Orchard (`orchard-return` / `camp`); the orchard's east gate needs `meadow.seal`.
- Orchard ⇄ Amber Ridge (`ridge-return` / `camp`); Amber Ridge ⇄ Stone Basin (`basin-return` / `camp`; the basin's east gate is an onward loop to `basin-landing`, beside the ridge overlook).
- Amber Ridge ⇄ Frostveil Grove (`east-return` / `camp`), gated by `amber-ridge.seal`; Frostveil Grove ⇄ Frostveil Pass (`pass-return` / `camp`).
- Frostveil Grove ⇄ Reedfen Wetlands (`east-return` / `camp`), gated by `frostveil-grove.seal`; Reedfen ⇄ Stilt Isles (`stilt-return` and `shrine-landing`).
- Every exit has an exit back, arrivals land within 16 tiles of it, and no spawn sits on an exit.

## Geometry and activity per biome

| Biome | Layout | Different activity |
| --- | --- | --- |
| Meadow | Compact open trail plus an orchard with a pond | Hidden cut-through trigger |
| Badlands | Cliff bands with a narrow cut and a long open trail; a ring path around a chasm | Choose a route; quarry and lookout secrets |
| Snowy forest | Grove and a pass | Blueglass Pass side route |
| Wetland | River with boardwalk crossings; seven stilt isles | Boardwalk crossings and island hopping |

## Sprite reuse (name → maps)

| Sprite | Used on |
| --- | --- |
| `boulder-mossy` | `amber-ridge`, `frostveil-grove`, `frostveil-pass`, `stone-basin` |
| `bush-flowering` | `meadow`, `reedfen-wetlands`, `orchard-ruins`, `stilt-isles` |
| `cattail-clump` | `reedfen-wetlands`, `stilt-isles` |
| `chest-wooden` | `meadow`, `amber-ridge`, `frostveil-grove`, `frostveil-pass`, `reedfen-wetlands`, `stilt-isles`, `stone-basin` |
| `cottage-tiled` | `meadow`, `amber-ridge`, `frostveil-grove`, `frostveil-pass`, `reedfen-wetlands`, `stilt-isles`, `stone-basin` |
| `grass-tuft` | `meadow`, `amber-ridge`, `frostveil-grove`, `frostveil-pass`, `reedfen-wetlands`, `orchard-ruins`, `stilt-isles`, `stone-basin` |
| `person-gardener` | `meadow`, `reedfen-wetlands`, `orchard-ruins`, `stilt-isles` |
| `person-traveler` | `amber-ridge`, `frostveil-grove`, `frostveil-pass`, `stone-basin` |
| `rock-spire-red` | `amber-ridge`, `stone-basin` |
| `shrine-crystal-stone` | `meadow`, `amber-ridge`, `frostveil-grove`, `reedfen-wetlands` |
| `signpost-wood` | `meadow`, `amber-ridge`, `frostveil-grove`, `frostveil-pass`, `reedfen-wetlands`, `orchard-ruins`, `stilt-isles`, `stone-basin` |
| `tree-oak` | `meadow`, `orchard-ruins` |
| `tree-pine` | `meadow`, `orchard-ruins` |
| `tree-pine-snow` | `frostveil-grove`, `frostveil-pass` |
