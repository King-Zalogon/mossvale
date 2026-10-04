# First adventure content matrix

Issue [#7](https://github.com/King-Zalogon/mossvale/issues/7). This is the content budget and set of working map briefs for the first personal adventure. The map names began as working briefs; all four biome pairs are now shipped in the first adventure. The four `NEW-*` creature slots below are historical planning labels, not roster IDs or implementation status.

## Content budget

| Biome | Map pair | Species slots | Regional milestone |
| --- | --- | ---: | --- |
| Meadow | Sunlit Trail; Ruined Orchard | 3 | Verdant seal |
| Wetland | Reed Marsh; Stilt-Island Route | 3 | Mire seal |
| Rocky badlands | Sandstone Route; Rocky Basin | 3 | Amber seal |
| Snowy forest | Snow-Pine Grove; Icy Pass | 3 | Frost seal and ending |
| **Total** | **Eight distinct large maps** | **12** | **Four challenges** |

The eight existing species are reused, one primary home each. Four slots remain design briefs, not species IDs or final concepts; #24 owns the creature designs and roster integration.

| Primary biome | Species slots | Intended discovery role |
| --- | --- | --- |
| Meadow | Fernling, Voltkit, Brooklet | Introduce the three existing species in safe grass, path-side clearings and the pond edge. |
| Wetland | Mushmallow, Duskwing, NEW-WETLAND-1 | A ground-level forager, an overhead scout and one new wetland specialist. |
| Rocky badlands | Emberkin, Pebblit, NEW-BADLANDS-1 | A heat-adapted creature, a patient stone companion and one new route specialist. |
| Snowy forest | Frostowl, NEW-SNOW-1, NEW-SNOW-2 | Reuse the existing snow species with two distinct new forest/pass specialists. |

Each species should have a reliable discovery route in its home biome. The four `NEW-*` labels are bookkeeping placeholders only; they must be replaced by #24’s approved concepts before encounter data is integrated. Existing species may still appear as familiar visitors outside their primary biome if encounter pacing benefits.

## Map briefs and route order

The route order is a starting sequence. Keep a clear return path and a nearby recovery option on every map; a missed chest or optional discovery must never block the regional challenge.

| Order | Map | Purpose and traversal | Landmarks and reusable art | Creatures and objective |
| ---: | --- | --- | --- | --- |
| 1 | **Sunlit Trail** · meadow | Opening route. Teach eight-way movement, one interaction, a safe encounter and the route back to recovery. Keep the first fork readable. | Trail sign, oak shade, Iris’s cottage and a small optional chest reuse `signpost-wood`, `tree-oak`, `cottage-tiled`, `person-gardener` and `chest-wooden`. | Fernling, Voltkit and Brooklet. Find the orchard trail marker and learn that the old shrine is the next goal. | **#51:** shipped as a 72 × 64 map (about 3,300 walkable tiles, was 465): the original hub keeps its coordinates and the trail grows east and south with a stream, ponds, tree belts, a hidden grove corridor and two secrets.
| 2 | **Ruined Orchard** · meadow | Short loop through tree cover with one visible shortcut that becomes useful on the return. The first guardian route has no one-way drop. | Oak canopy, flowering bush, shrine and orchard sign reuse `tree-oak`, `bush-flowering`, `shrine-crystal-stone` and `signpost-wood`. | Same three meadow species. Defeat the first regional guardian and earn the Verdant seal. | **#51:** the original island keeps its coordinates and grows east and south into a 64 × 56 map (about 2,200 walkable tiles, was 365) with apple rows, ruins, a second pond, two secrets and a second hidden row.
| 3 | **Reed Marsh** · wetland | Winding but safe route around water; reeds reveal bends without hiding exits. Add one optional side pool, not a maze. | Reuse `grass-tuft`, `bush-flowering`, `signpost-wood` and `chest-wooden`; a reed/wetland prop batch is still needed. | Mushmallow, Duskwing and NEW-WETLAND-1. Find the raised route toward the stilt island. | **#52:** shipped as `reedfen-wetlands` (64 × 56, about 2,200 walkable tiles, was 445).
| 4 | **Stilt-Island Route** · wetland | Cross two short boardwalks and a broad safe island. The route should teach the water boundary and provide a clear retreat to the marsh. | Stilt shelter and boardwalk pieces are a new reusable art batch; reuse the shared cottage, sign, chest and shrine where they fit. | Same three wetland species. Clear the mire guardian and earn the Mire seal. | **#52:** shipped as `stilt-isles` (72 × 44, seven isles joined by boardwalks); it uses existing art plus cattail/bush props until the stilt batch lands.
| 5 | **Sandstone Route** · badlands | Follow a narrow cliff-side path with rock cover and one open alternate path. Keep occlusion from hiding the walkable route. | Reuse `rock-spire-red`, `boulder-mossy`, `signpost-wood` and `chest-wooden`; add only distinct route pieces if existing rocks cannot communicate the edge. | Emberkin, Pebblit and NEW-BADLANDS-1. Reach the basin overlook and a safe rest point. | **#53:** shipped as `amber-ridge` (64 × 56, about 2,000 walkable tiles, was ~440): a narrow cut and a long open trail to the shrine, cliff bands and rock cover.
| 6 | **Rocky Basin** · badlands | A compact loop around the basin floor with a readable entrance and exit; avoid repeated dead-end corridors. | Reuse red spires, mossy boulders and the shrine; a badlands landmark can reuse the same shrine art with a new role and text. | Same three badlands species. Clear the basin guardian and earn the Amber seal. | **#53:** shipped as `stone-basin` (60 × 50): a ring path around a central chasm with a quarry hut, a nook chest and two secrets; the Amber seal guardian stays at the Amber Ridge shrine.
| 7 | **Frostveil Grove** · snowy forest | A broad pine-and-lake crossing branches from the shrine approach into a southern forest loop, with a sheltered return route. | Shared snow pines and signs mark the route; the Icefall ledge carving rewards a close look around the outer lake. | Frostowl, Duskwing and Hushram. The Frostowl shrine is the regional challenge; a seal opens the eastern route. | **#54:** Grove is 64 × 48 (1,735 walkable tiles), with two encounter regions, a hidden Icefall ledge, quiet paths and paced grass. |
| 8 | **Blueglass Pass** · snowy forest | Wind around a broad frozen lake, then take the southern pine return loop to the Grove. A shelter and ranger make the pass safe to explore. | Snow pines, lake edge, trail markers and a hidden cache reuse the shared asset pack. | The same three snow visitors appear at higher levels; the pass adds an optional cache and loops back to the Grove. | **#54:** Pass is 64 × 48 (1,515 walkable tiles), with a shelter, hidden cache and a calmer lakeside return route.

## First playable target and ending

The first complete trial is maps 1–2, not a story bible: start at the meadow trailhead, meet Iris, discover at least one companion on a normal route, use the optional chest if desired, reach the orchard shrine, win the guardian fight and return with the Verdant seal saved. Keyboard and touch controls should both support that route. A player can backtrack to recover; no catch, chest or dialogue choice is required to finish it.

After feedback on that pair, repeat the route/challenge pattern with different geometry for the other biomes. The final Frost seal opens a brief destination/ending scene and leaves the world available for continued exploration. Roughly two to four hours is a pacing hypothesis to revisit from real play, not a minimum, promise or content quota. Detailed lore, branching stories, mandatory side quests and evolution chains are out of scope for this first adventure.

## Reuse and delivery boundaries

- Keep names like `tree-oak`, `cottage-tiled` and `person-gardener` attached to visual identity. Map data supplies role, display name, hint text and milestone behavior.
- Prefer current terrain, props, creatures and character IDs; commission a new asset only where it communicates a biome or route distinction that existing art cannot.
- Keep maps, species availability, short text, milestones and ending references in adventure data on the shared movement, battle and save systems.
- This is a private personal game. Friends may try it by choice; direct integration to `main` does not require a review gate. Do not change repository visibility or hosted-game audience as part of this content plan.

## Status boundary

The playable adventure has four biomes and eight maps. The large wetland, badlands and snowy-forest pairs ship with safe returns, optional discoveries, local recovery and encounter pacing; the meadow pair remains the smaller opening route. Creature availability uses the twelve stable roster IDs in `dist/maps/registries.json`.
