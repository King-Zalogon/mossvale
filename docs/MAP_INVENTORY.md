# Map and asset reuse inventory

Issue [#27](https://github.com/King-Zalogon/mossvale/issues/27). A snapshot of the shipped adventure's maps, refreshed by hand when maps are added. `tests/integration.test.mjs` checks that every shipped map is listed here and that the route graph, return trips, spawns and saves hold together.

## Maps

| Map | Biome | Size | Walkable tiles | Exits to | Secrets | Chests | Quiet corridors | Encounter species |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: | --- |
| `meadow` | meadow | 72×64 | 2976 | `orchard-ruins`, `brackenwake-commons` | 4 | 3 | 4 | bramblebuck, duskwing, emberkin, fernling |
| `amber-ridge` | badlands | 64×56 | 1804 | `orchard-ruins`, `frostveil-grove`, `stone-basin` | 3 | 3 | 5 | pebblit, sunskitter, voltkit |
| `frostveil-grove` | snowy-forest | 64×48 | 1589 | `amber-ridge`, `reedfen-wetlands`, `frostveil-pass` | 3 | 3 | 3 | duskwing, frostowl, hushram, pebblit |
| `frostveil-pass` | snowy-forest | 64×48 | 1423 | `frostveil-grove` | 3 | 3 | 3 | duskwing, frostowl, hushram |
| `reedfen-wetlands` | wetland | 64×56 | 2122 | `frostveil-grove`, `stilt-isles` | 3 | 3 | 4 | brooklet, mushmallow, siltkip |
| `orchard-ruins` | meadow | 64×56 | 2003 | `meadow`, `amber-ridge` | 7 | 2 | 3 | bramblebuck, duskwing, emberkin, fernling |
| `stilt-isles` | wetland | 72×44 | 924 | `reedfen-wetlands`, `reedfen-wetlands` | 3 | 3 | 4 | brooklet, mushmallow, siltkip |
| `stone-basin` | badlands | 60×50 | 1507 | `amber-ridge`, `amber-ridge` | 4 | 3 | 4 | pebblit, sunskitter, voltkit |
| `brackenwake-commons` | meadow | 56×44 | 1635 | `meadow` | 2 | 2 | 0 | none (settlement) |

Every shipped map has two new optional caches. They sit off reachable trails, remain hidden from the area map until found, and each grants 6 coins and 1 capture orb. The original region chest keeps its legacy save flag; every added cache has its own stable flag so opening one never opens the others.

## Route graph

- Meadow ⇄ Ruined Orchard (`orchard-return` / `camp`); the orchard's east gate needs `meadow.seal`.
- Meadow ⇄ Brackenwake Commons (`brackenwake-return` / `camp`): an optional south trail with no gate and no encounters (#277); see [SETTLEMENTS.md](SETTLEMENTS.md).
- Orchard ⇄ Amber Ridge (`ridge-return` / `camp`); Amber Ridge ⇄ Stone Basin (`basin-return` / `camp`; the basin's east gate is an onward loop to `basin-landing`, beside the ridge overlook).
- Amber Ridge ⇄ Frostveil Grove (`east-return` / `camp`), gated by `amber-ridge.seal`; Frostveil Grove ⇄ Frostveil Pass (`pass-return` / `camp`).
- Frostveil Grove ⇄ Reedfen Wetlands (`east-return` / `camp`), gated by `frostveil-grove.seal`; Reedfen ⇄ Stilt Isles (`stilt-return` and `shrine-landing`).
- Every exit has an exit back, arrivals land within 16 tiles of it, and no spawn sits on an exit.

## Geometry and activity per biome

| Biome | Layout | Different activity |
| --- | --- | --- |
| Meadow | A large open trail with a stream, tree belts and a hidden grove corridor, plus a large orchard island with apple rows, ruins and two hidden rows | Hidden grove and cut-through triggers |
| Badlands | Cliff bands with a narrow cut and a long open trail; a ring path around a chasm | Choose a route; quarry and lookout secrets |
| Snowy forest | Grove and a pass | Blueglass Pass side route |
| Wetland | River with boardwalk crossings; seven stilt isles | Boardwalk crossings and island hopping |

## Sprite reuse (name → maps)

| Sprite | Used on |
| --- | --- |
| `boulder-mossy` | `amber-ridge`, `frostveil-grove`, `frostveil-pass`, `orchard-ruins`, `stone-basin` |
| `bush-flowering` | `meadow`, `reedfen-wetlands`, `orchard-ruins`, `stilt-isles` |
| `cattail-clump` | `reedfen-wetlands`, `stilt-isles` |
| `chest-wooden` | `meadow`, `orchard-ruins`, `brackenwake-commons` |
| `chest-reed-rope` | `reedfen-wetlands`, `stilt-isles` |
| `chest-sandstone-iron` | `amber-ridge`, `stone-basin` |
| `chest-pine-frost` | `frostveil-grove`, `frostveil-pass` |
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
