# Mossvale personal-adventure design

**Version:** 1.1 (2026-10-01). Scope baseline for [#7](https://github.com/King-Zalogon/mossvale/issues/7), aligned with the [current roadmap](FULL_GAME_ROADMAP.md). Targets below describe planned additions, not implemented features.

## Direction and content budget

The map-by-map plan, primary species slots, route order and first playable objective are in [CONTENT_MATRIX.md](CONTENT_MATRIX.md). They are briefs for future content, not claims that the planned maps or species are implemented.

A personal-use browser creature adventure with 2D isometric pixel art and eight-direction movement. The owner decides whether normal play is fun; friend feedback is optional. Detailed worldbuilding comes later. Mature themes are allowed, not required.

| Biome | Compact maps | Primarily associated creatures |
| --- | --- | --- |
| Meadow | Sunlit trail and ruined orchard | 3 |
| Wetland | Reed marsh and stilt-island route | 3 |
| Rocky badlands | Sandstone route and rocky basin/pass | 3 |
| Snowy forest | Snow-pine grove and icy pass | 3 |

Total: **four biomes, eight authored maps, 12 species**, reusing the existing eight species and adding four. Map names are adjustable briefs. Four regional challenges lead to a clear ending. A roughly 2–4-hour first adventure is a pacing hypothesis, not a quota or measured result.

## Core loop and mechanics

Explore distinct routes, discover creatures, capture companions, choose useful battle actions, collect supplies, and complete regional milestones. Brief goals and hints support navigation; no mandatory side-quest campaign or branching lore.

Retain one owned record per species. A small active battle team of up to three companions may be added if it improves play; individual-creature storage, breeding and a six-member reserve system are outside the current baseline. Basic and elemental actions, guarding, potions, switching and capture should offer understandable tradeoffs. Eight existing types remain usable; a large move roster or status engine is not required.

Rewards should support progress without grinding. Modest XP/move improvements are optional [#25](https://github.com/King-Zalogon/mossvale/issues/25); evolution lines are not mandatory. Each regional challenge should be distinct and naturally winnable. Tune precise numbers from owner play rather than fixing an untested level cap.

## Failure and save rules

Losing returns the player to a usable recovery point without permanent companion loss. Wild encounters allow fleeing; regional challenge opponents cannot be captured. Refreshing during an encounter must not consume resources unrecoverably ([#11](https://github.com/King-Zalogon/mossvale/issues/11)). Outcomes must remain consistent across reloads.

Local versioned saves retain stable content IDs, checkpoint recovery and clear corruption notices. Portable JSON export/import is planned ([#30](https://github.com/King-Zalogon/mossvale/issues/30)). See [SAVE_FORMAT.md](SAVE_FORMAT.md) for the current schema. No cloud account or online-save platform is needed.

## Reuse and delivery

Shared assets and movement/battle/save systems are separate from adventure-pack maps, inhabitants, roles, text and milestones ([#50](https://github.com/King-Zalogon/mossvale/issues/50)). Stable pack/map/entity IDs protect saves. Two tiny fixture scenes should prove role/asset reuse; a second complete story is not required.

Keep vanilla JavaScript, Canvas 2D and static browser delivery. Keyboard and practical touch controls, readable text/type cues, visible focus and reduced-motion comfort matter. Verify the owner's actual devices; formal certification and a broad hardware lab are not gates. Measure performance problems before optimizing them. Optional audio must not block play. No installable/offline service worker is required; static hosting still requires initial network access.

Private playable updates should be traceable to GitHub main and recoverable. Source-repository visibility and hosted audience are separate; the repository is currently public. Direct pushes and merges do not require owner PR approvals.

## Order and acceptance

1. Preserve save/startup reliability, finish durable encounter actions, and establish small data contracts.
2. Build and play the meadow map pair before final integration of the other biomes.
3. Produce independent biome/creature batches against stable contracts; integrate all eight maps, four challenges and the light ending.
4. Check normal completion, capture routes, save/reload/export recovery, and controls on the owner's devices. Tune pacing and difficulty from feedback.

Passing automated checks supports reliability; the owner enjoying exploration and battles determines success. Richer sound, XP refinements and measured optimization can wait. Public diagnostics, formal rights review, cloud saves, online trading/PvP, postgame expansion, localization and native ports are deferred in the roadmap.

## Change log

- 1.0 (2026-10-01): PR #49 originally proposed the superseded larger campaign.
- 1.1 (2026-10-01): Aligned with the authorized personal scope: four biomes, eight maps, 12 creatures, reusable packs and light storytelling. Removed obsolete commercial-scale targets and unsupported calendar estimates.
