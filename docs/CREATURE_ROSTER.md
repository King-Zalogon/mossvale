# Creature roster (#24)

The roster now has 17 stable species IDs. The original twelve IDs and their order stay unchanged so existing saves still resolve; Sedgegnaw, Petalunge, Cindercurl, Sunsifter and Rillume are appended. Every species is findable in a home-biome encounter zone. The current distribution is Meadow 5, Wetland 4, Rocky Badlands 5 and Snowy Forest 3 while the wider creature portfolio continues. The field journal reveals personality, battle role, base stats, elemental move, and a habitat clue after discovery.

| Biome | Species | Role | Base HP / ATK / DEF | Elemental move | Field clue |
| --- | --- | --- | ---: | --- | --- |
| Meadow | Fernling | Balanced trailblazer | 42 / 10 / 10 | Leaf burst | Start in the meadow grass near camp. |
| Meadow | Emberkin | Quick striker | 40 / 12 / 8 | Ember spark | Look where the meadow path meets sunny eastern grass. |
| Meadow | Bramblebuck | Defensive anchor | 50 / 8 / 18 | Briar brace | Look for leaf-shaped antlers at the edge of the meadow grass. |
| Meadow | Sedgegnaw | Seed-trail defender | 46 / 8 / 14 | Seedline sweep | Watch Meadow seed-trail grass; a quiet cache can draw it to the edge. |
| Meadow | Petalunge | Orchard ambusher | 38 / 14 / 7 | Orchid pounce | Search the orchard's flowered edge; approach slowly and watch for a petal-shaped silhouette. |
| Wetland | Brooklet | Steady all-rounder | 46 / 9 / 12 | Ripple rush | Listen for splashes in Reedfen's reed-ringed pools. |
| Wetland | Mushmallow | Patient bulwark | 48 / 8 / 15 | Spore cloud | Check the damp grass around Reedfen's quiet water. |
| Wetland | Siltkip | Matchup scout | 44 / 10 / 12 | Silt surge | Watch the shallow pools; its tail often appears first. |
| Wetland | Rillume | Resonant striker | 42 / 13 / 9 | Bell pulse | Look in Reedfen's safe bank grass for a blue core beneath a clear bell. |
| Rocky badlands | Voltkit | Glass-cannon sprinter | 39 / 13 / 6 | Static leap | Follow the bright sandstone trail into Amber Ridge grass. |
| Rocky badlands | Pebblit | Stalwart wall | 52 / 8 / 16 | Stone tumble | Amber Ridge's warm grass is its favourite place to bask. |
| Rocky badlands | Sunskitter | High-risk attacker | 36 / 14 / 6 | Glass dash | Search the rocky grass where the sun reaches Amber Ridge first. |
| Rocky badlands | Cindercurl | Kiln-plate bulwark | 52 / 8 / 17 | Kiln shoulder | Look for a heat shimmer near the reachable east ridge grass; no creature ability is needed. |
| Rocky badlands | Sunsifter | Patient ridge bruiser | 48 / 11 / 12 | Dune rake | Search Amber Ridge's east grass for a broad gold brow lifting the sand. |
| Snowy forest | Duskwing | Fast opportunist | 38 / 11 / 8 | Gust spiral | Search Frostveil's high grass, especially at dusk. |
| Snowy forest | Frostowl | Elemental duelist | 43 / 10 / 11 | Frost feather | Look among Frostveil's snow-laced trees and tall grass. |
| Snowy forest | Hushram | Steady guardian | 50 / 8 / 17 | Quiet squall | Look for curled blue horns in sheltered Frostveil grass. |

Stats are active in damage calculations: attack affects quick strikes and enemy damage, defense reduces incoming damage, HP sets starting and maximum health, and the move registry gives each elemental move its own power and journal copy. Type strengths remain an additional matchup factor. Roles are short guidance rather than hidden traits or extra combat rules.

## New artwork and prompt brief

The four transparent sprites use the existing Fernling sprite as a style reference. The prompt briefs requested distinct, full-body game creatures with transparent backgrounds and clear silhouettes: a green meadow deer with leaf antlers and a seed-pod chest (Bramblebuck); a teal web-footed mudskipper with bright side gills and a ribbon tail (Siltkip); an orange desert lizard with a sharp turquoise glass-like crest (Sunskitter); and a pale-blue snowy ram with curled frost horns and a soft winter coat (Hushram). A separate prop prompt used the existing grass-tuft art as a style reference and requested a small marsh cattail clump with seed heads on transparency. The resulting assets are tight-cropped, bottom-centred PNGs in `dist/assets/`; source-generation images are not part of the game build.

The first three-creature expansion batch adds three transparent portraits, three 4×5 battle atlases and three 5×8 follower atlases. Sedgegnaw keeps the six-legged leaf-cutter ant silhouette and a narrow notched seed-sail; Petalunge is a pale orchid mantis with paired petal forelimbs and a low ambush stance; Cindercurl is a plated pangolin with a curled shield-tail and short grounded steps. Their source PNGs and generation briefs are retained in `art/characters/source/`; `art/characters/creature-combat-metadata.json`, `art/characters/creature-follower-metadata.json`, and `art/assets/metadata.json` record source paths, frame order, output dimensions, anchors and hashes. Portraits are normalized on a 288×288 bottom-center guide and then trimmed tightly for runtime: Sedgegnaw 254×264, Petalunge 264×251, and Cindercurl 264×211. Combat cells are 288×288 with idle/attack/hit/faint/capture rows. Follower cells are 200×200, directions N/NE/E/SE/S/SW/W/NW and columns idle plus four walk frames; feet sit at y=196 and cadence is 0.56 world units per frame. The retained source PNGs are linked to their canonical portrait IDs in `art/assets/subjects.json`.

These encounter additions use existing battle actions and current maps only. Sedgegnaw appears in Meadow seed-trail grass, Petalunge in the Ruined Orchard flower-edge grass, and Cindercurl in accessible Amber Ridge grass. No new movement ability or story gate is required. Their art has passed source/export and small-scale technical inspection; owner visual and gameplay acceptance remain pending.

Sunsifter extends the Rocky Badlands with a broad golden shovel brow, ridged amber shell and six short digging legs; its Sand role is slower and sturdier than Sunskitter while remaining less defensive than Pebblit. Rillume extends the Wetland with a clear jelly bell, dark blue core and four thick ribbon lobes; its Water role trades Brooklet's bulk for a stronger focused strike. Each uses a distinct existing-rule move and is an optional encounter in reachable grass: Sunsifter in Amber Ridge's eastern grass, Rillume in Reedfen's safe-bank shallows. Their portrait, combat and follower sources and prompt summaries are pinned for issues #290 and #291. Gameplay-scale battle/habitat captures and silhouette comparisons are in `art/characters/reviews/290-291/`. Run `npm start` and open `/creature-combat-preview.html` or `/creature-follower-preview.html` to inspect all frames. Owner taste and gameplay acceptance remain pending.

## Playable coverage

The current five-map slice covers four biomes: the Sunlit Trail and Ruined Orchard in Meadow, Amber Ridge, Frostveil Grove, and Reedfen Wetlands. Residents are available through their home-biome encounter pools, while a few cross-biome guests keep the maps connected to the wider ecology. More distinct maps remain tracked under #27 and #52–#54.
