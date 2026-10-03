# Creature roster (#24)

The roster has 12 stable species IDs: three primary residents for each of the four biomes. The first eight IDs are unchanged so existing saves still resolve; new species are appended. Every species is findable in at least one encounter zone, and primary residents appear in a map from their home biome. The field journal reveals personality, battle role, base stats, elemental move, and a habitat clue after discovery.

| Biome | Species | Role | Base HP / ATK / DEF | Elemental move | Field clue |
| --- | --- | --- | ---: | --- | --- |
| Meadow | Fernling | Balanced trailblazer | 42 / 10 / 10 | Leaf burst | Start in the meadow grass near camp. |
| Meadow | Emberkin | Quick striker | 40 / 12 / 8 | Ember spark | Look where the meadow path meets sunny eastern grass. |
| Meadow | Bramblebuck | Defensive anchor | 50 / 8 / 18 | Briar brace | Look for leaf-shaped antlers at the edge of the meadow grass. |
| Wetland | Brooklet | Steady all-rounder | 46 / 9 / 12 | Ripple rush | Listen for splashes in Reedfen's reed-ringed pools. |
| Wetland | Mushmallow | Patient bulwark | 48 / 8 / 15 | Spore cloud | Check the damp grass around Reedfen's quiet water. |
| Wetland | Siltkip | Matchup scout | 44 / 10 / 12 | Silt surge | Watch the shallow pools; its tail often appears first. |
| Rocky badlands | Voltkit | Glass-cannon sprinter | 39 / 13 / 6 | Static leap | Follow the bright sandstone trail into Amber Ridge grass. |
| Rocky badlands | Pebblit | Stalwart wall | 52 / 8 / 16 | Stone tumble | Amber Ridge's warm grass is its favourite place to bask. |
| Rocky badlands | Sunskitter | High-risk attacker | 36 / 14 / 6 | Glass dash | Search the rocky grass where the sun reaches Amber Ridge first. |
| Snowy forest | Duskwing | Fast opportunist | 38 / 11 / 8 | Gust spiral | Search Frostveil's high grass, especially at dusk. |
| Snowy forest | Frostowl | Elemental duelist | 43 / 10 / 11 | Frost feather | Look among Frostveil's snow-laced trees and tall grass. |
| Snowy forest | Hushram | Steady guardian | 50 / 8 / 17 | Quiet squall | Look for curled blue horns in sheltered Frostveil grass. |

Stats are active in damage calculations: attack affects quick strikes and enemy damage, defense reduces incoming damage, HP sets starting and maximum health, and the move registry gives each elemental move its own power and journal copy. Type strengths remain an additional matchup factor. Roles are short guidance rather than hidden traits or extra combat rules.

## New artwork and prompt brief

The four transparent sprites use the existing Fernling sprite as a style reference. The prompt briefs requested distinct, full-body game creatures with transparent backgrounds and clear silhouettes: a green meadow deer with leaf antlers and a seed-pod chest (Bramblebuck); a teal web-footed mudskipper with bright side gills and a ribbon tail (Siltkip); an orange desert lizard with a sharp turquoise glass-like crest (Sunskitter); and a pale-blue snowy ram with curled frost horns and a soft winter coat (Hushram). A separate prop prompt used the existing grass-tuft art as a style reference and requested a small marsh cattail clump with seed heads on transparency. The resulting assets are tight-cropped, bottom-centred PNGs in `dist/assets/`; source-generation images are not part of the game build.

## Playable coverage

The four-map slice contains one representative region for each biome: Mossvale Meadow, Amber Ridge, Frostveil Grove, and Reedfen Wetlands. Three primary residents are present in each matching encounter pool, while a few cross-biome guests keep the maps connected to the wider ecology. The second distinct map for each biome remains tracked under #27 and #51–#54.
