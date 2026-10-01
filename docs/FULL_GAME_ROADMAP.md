# Mossvale personal-adventure roadmap

Canonical live tracking: [Roadmap issue #1](https://github.com/King-Zalogon/mossvale/issues/1). Revised 2026-10-01. This is a planning snapshot, including progress merged during the revision. The superseded larger plan is retained in [the archive](archive/2026-09-30/FULL_GAME_ROADMAP.md).

Repository plan: [Detailed roadmap](https://github.com/King-Zalogon/mossvale/blob/main/docs/FULL_GAME_ROADMAP.md) · [Machine-readable backlog](https://github.com/King-Zalogon/mossvale/blob/main/docs/ROADMAP_BACKLOG.json)

## Current direction — 2026-10-01

Build an enjoyable **personal-use short-to-medium adventure** for the owner, optionally shared with friends. This replaces the previous larger campaign/public-release interpretation. No monetization, public-release program, required outside playtest panel or elaborate engine is part of this scope. Detailed worldbuilding and storytelling come later.

| Target | First adventure |
| --- | --- |
| Biomes | Meadow, wetland, rocky badlands, snowy forest |
| Maps | Eight compact authored maps; two distinct maps per biome |
| Creatures | 12 species; three primarily associated with each biome; reuse eight existing species and add four |
| Progression | Explore, discover companions, clear four regional challenges/milestones, reach a clear ending |
| Story | Light premise, brief goals/hints and a final destination; no required branching lore or six-side-quest campaign |
| Presentation | 2D isometric pixel art, eight-direction movement, useful animations and coherent reusable assets |
| Systems | Compact battles, companion selection, useful rewards, reliable local saves and portable backup |
| Success | The owner enjoys normal play; feature counts and passing checks do not substitute for this |

The counts are starting budgets, not reasons to add filler. Roughly 2–4 hours is only a pacing hypothesis to revisit after actual play. Mature/sensitive/controversial material is allowed as a creative option, not a requirement or an automatic tonal change. No particular adult content is being added by this plan.

## What exists and what changes

The main gameplay snapshot audited at [8fc2c7b](https://github.com/King-Zalogon/mossvale/commit/8fc2c7b33251d7a8045b196712982be0489f4b20) contains eight species and three palette-themed regions that reuse one terrain layout, with basic capture/battle/XP, chests and local saves. The revised four-biome/eight-map/12-species content is **planned, not implemented**.

Retain the proven core. The historical audit reproduced a malformed-save startup crash, invisible-player missing-asset failure and refresh-during-capture item loss. Save/startup work has now landed; verify the remaining gaps and prioritize durable battle actions. Replace repeated geometry with authored, varied map pairs. Favor a small data/module split and sensible checks over commercial-scale tooling.

The old 170–284 person-day forecast, 24-species target, nine-map campaign, mandatory evolutions, six side quests and public-release gates are **superseded**. They remain in the archived 2026-09-30 documents only as history, not active requirements. We will size concrete changes relatively (S/M), implement small slices, and revise from the owner’s feedback rather than promise a calendar based on AI coding speed.

## Existing implementation progress to preserve

While this plan was being revised, [main advanced to 627dd6b](https://github.com/King-Zalogon/mossvale/commit/627dd6b3eb4b445bec35ad617054ca1a0f945000), merging save codec v3 with stable IDs/recovery, a required-asset loader with retry, save fixtures, asset validation and browser startup checks. PR #49 moves these implementations to `dist/src/save.js` and `dist/src/services/loader.js`, with the asset manifest in `dist/src/data/assets.js`. Preserve their behavior and reuse the existing test scripts rather than duplicating them. See [SAVE_FORMAT.md](https://github.com/King-Zalogon/mossvale/blob/main/docs/SAVE_FORMAT.md).

The previous progress log keeps #8 and #12 open pending acceptance verification. Remaining notes include real exported v1 fixtures, throttled-network/decode-failure browser cases and optional audio/font fallback checks. #9, #10 and #13 have useful partial foundations. No work is declared complete solely because the roadmap changed, and there is no mandatory human review/PR gate.

Later on 2026-10-01 (branch `ccr-075e1d10-ok9hef`): #14 map data in `dist/maps/*.json` with validation ([MAP_FORMAT.md](MAP_FORMAT.md)); #11 atomic battle rounds, saved encounter checkpoints, explicit phases and a cancellable playback timeline ([SAVE_FORMAT.md](SAVE_FORMAT.md#encounter-durability)); #13 seeded domain tests, a bot playthrough of the meadow with normal actions, and browser flows for refresh-during-capture and a normal capture. These issues stay open for criteria review. Observation from the bot: with free healing at camp, the meadow guardian falls in roughly 5–6 battles with 0–1 losses, so it is easy; tune it from your play feedback (#23, #31).

Then: #25 growth tuning (level cap 15, bench XP share, catch-up bonus, one elemental move upgrade at level 10; see [PROGRESSION.md](PROGRESSION.md)). It needs your play feedback; evolutions and learnsets remain out of scope.

Then: #17 team of three plus reserve ([SAVE_FORMAT.md](SAVE_FORMAT.md)), #16 Focus-based battle actions ([BATTLE.md](BATTLE.md)) and #20 title/continue/new game/restore and persistent settings. All three need your play feedback; duplicate captures stay one record per species, and there is no reorder or individual-creature database.

Then: #15 movement, collision footprint, trail-following companion and arrival fade ([MOVEMENT.md](MOVEMENT.md)).

Then: #18 objectives and short lines as data with an unlock-chain softlock check ([OBJECTIVES.md](OBJECTIVES.md)).

Then: #19 shared supply/reward table with transactional shop, free rest floor and bag caps ([ECONOMY.md](ECONOMY.md)).

## Reusable toolkit, bounded to real needs

#50 separates shared movement/battle/save systems and asset definitions from adventure data (maps, inhabitants, roles, brief text, milestones and ending references). #32 standardizes pixel scale, pivots, source sheets and manifest/export rules. #14 provides practical validated map data, not a full visual editor.

Use visual IDs such as cottage/tree/creature, not a story-specific name as an asset identifier. The same building or character can have different roles/text in another pack. Two tiny fixture scenes will prove this substitution; **a second full story is not required now**. Pack/map/entity IDs must prevent later adventures from corrupting the current save.

## Priority rules

- **P0:** Immediate startup/progress reliability and the short scope baseline.
- **P1:** The core personal adventure: reusable data/assets, varied maps/creatures, enjoyable mechanics, usable controls and checked private updates.
- **P2:** Optional personal polish. XP refinements, richer audio and optimization can wait unless the owner’s experience makes them necessary.
- **P3 / closed as not planned:** Deferred public-scale or later-story features. Closed does not mean implemented.

There are **38 active scoped tasks** (35 core and 3 polish), five updated epics and eight deferred issues. Five new issues split out reusable-pack proof and the four biome packages; this is more precise tracking, not a return to the old large scope. Existing issue numbers and history are retained.

## Iteration plan

1. **Reliable foundation:** Fix save/loading failures; agree stable IDs; split only the necessary runtime/data boundaries; add small checks, reusable manifest/pack and map contracts.
2. **Meadow trial:** Build the meadow pair #51 and integrate it in #22. Let the owner try movement, capture, companion choice, encounter pace and a normal challenge. Fix the clearest annoyances before repeating the pattern. This is gameplay feedback, not a code/PR approval gate.
3. **Four-biome adventure:** Complete wetland #52, badlands #53 and snow #54 packages, the 12-creature roster #24, distinct challenges and a light ending. Independent briefs/assets/maps can be prepared while the trial is underway.
4. **Owner-feedback polish:** Tune what feels good or annoying, check saves/devices, mark a recoverable personal-ready build. Add optional polish only where it improves play. Then consider richer story/worldbuilding as future packs.

## Parallel work and ownership

| Lane | Independent work | Shared coordination |
| --- | --- | --- |
| Core | Save/asset failure fixes, module boundaries, battle/collection behavior | One owner for IDs, save schema, durable actions and event contracts |
| World/data | Four map-pair sketches, encounter tables, short role/objective text | Freeze map/portal/milestone/pack format before integrating |
| Biome assets | Separate terrain/prop batches for meadow, wetland, badlands and snow | Shared pixel angle, palette rules, anchors and asset manifest |
| Creature assets/data | Concepts and 12 species in independent batches | Shared visual standards and one role/type/balance matrix |
| UI/input | Focused menus, journal, settings, touch readability | Shared input/focus/navigation contracts |
| Checks/delivery | Regression fixtures, save cases, source/publish documentation | One test harness and one publishing/source owner |

After contracts are stable, separate biome files and art batches can run in parallel. Before that, briefs/reference gathering and narrow reliability fixes can overlap. Do not have several agents rewrite the same IIFE, migration or global balance table. Use short-lived branches where useful or integrate directly to main after checks; **no owner PR or merge approval is required**. Your play feedback guides taste; friends’ feedback is optional.

## Delivery/privacy boundary

Keep playable updates private and preserve the existing hosting audience. Sharing with friends is a separate explicit choice. GitHub main and the hosted source are not automatically synchronized; #21 covers a simple traceable publish/rollback process without requiring a full public-release pipeline.

The GitHub repository is currently **public**, as checked during this revision. Private game hosting does not make source code private. #21 tracks reconciling source visibility with the owner’s preference; this planning update does **not** change repository visibility or site access.

## Epic index

- [ ] #2 — Reliable systems and reusable adventure data
- [ ] #3 — Satisfying capture, companion choice and compact battles
- [ ] #4 — Four varied biomes and a light first adventure
- [ ] #5 — Reusable pixel assets and comfortable personal play
- [ ] #6 — Lightweight checks and private playable updates

## Active work by stage

### 0 · reliable foundation

- [ ] #7 — **P0**, Define the personal adventure content matrix and first playable target (S)
- [ ] #8 — **P0**, Fix save crashes and preserve progress while adding stable content IDs (M)
- [ ] #11 — **P0**, Preserve encounters through refresh and browser interruptions (M)
- [ ] #12 — **P0**, Detect missing assets and recover startup failures (S)
- [ ] #9 — **P1**, Separate reusable game systems from content with a small module split (M)
- [ ] #10 — **P1**, Add a lightweight local check command and CI smoke checks (S)
- [ ] #13 — **P1**, Keep a small deterministic gameplay and save regression suite (M)
- [ ] #14 — **P1**, Create a simple validated map and event data format (M)
- [ ] #21 — **P1**, Keep private playable updates traceable to GitHub main (S)
- [ ] #32 — **P1**, Establish reusable asset packs and a consistent pixel style (M)
- [ ] #50 — **P1**, Separate reusable asset/system definitions from adventure packs (M)

### 1 · meadow trial

- [ ] #15 — **P1**, Make eight-direction movement, followers and map transitions feel good (M)
- [ ] #16 — **P1**, Make a small set of battle actions meaningfully different (M)
- [ ] #17 — **P1**, Keep companion selection and a small active team simple (S)
- [ ] #18 — **P1**, Add lightweight milestones and dialogue hooks, not a narrative engine (S)
- [ ] #19 — **P1**, Keep supplies and rewards useful without forced grinding (S)
- [ ] #20 — **P1**, Add quick continue/new-game and only useful settings (S)
- [ ] #22 — **P1**, Try the meadow map pair before finishing the other biomes (S)
- [ ] #51 — **P1**, Build the meadow biome pack with two distinct compact maps (M)

### 2 · four-biome adventure

- [ ] #23 — **P1**, Make four regional challenges feel different without complex AI (M)
- [ ] #24 — **P1**, Create 12 useful creatures, three associated with each biome (M)
- [ ] #26 — **P1**, Pace encounters by biome and make creature discovery readable (S)
- [ ] #27 — **P1**, Integrate and validate the four biome map pairs (S)
- [ ] #28 — **P1**, Connect the adventure with a light premise and clear ending (S)
- [ ] #30 — **P1**, Add a portable save backup and simple restore (S)
- [ ] #33 — **P1**, Make objectives, team selection and battle information easy to use (S)
- [ ] #34 — **P1**, Keep practical readability, keyboard controls and motion preferences (S)
- [ ] #35 — **P1**, Verify the browsers and devices the owner actually uses (S)
- [ ] #36 — **P1**, Add readable eight-direction player motion and a modest creature set (M)
- [ ] #52 — **P1**, Build the wetland biome pack with two distinct compact maps (M)
- [ ] #53 — **P1**, Build the rocky badlands biome pack with two distinct compact maps (M)
- [ ] #54 — **P1**, Build the snowy forest biome pack with two distinct compact maps (M)

### 3 · owner-feedback polish

- [ ] #31 — **P1**, Iterate on fun and pacing from the owner’s play feedback (M)
- [ ] #39 — **P1**, Run focused regression checks and personal play sessions (S)
- [ ] #42 — **P1**, Mark the first personal adventure ready and preserve a recoverable build (S)
- [ ] #25 — **P2**, Tune modest XP growth and small move upgrades (S, optional polish)
- [ ] #37 — **P2**, Fix measured performance problems on the owner’s devices (S, optional polish)
- [ ] #38 — **P2**, Add a small reusable sound palette and optional biome ambience (S, optional polish)

## Integration dependencies

| Issue | Priority | Lane | Needs for integration |
| --- | --- | --- | --- |
| #7 | P0 | Design/data | Ready now |
| #8 | P0 | Core | Ready now |
| #9 | P1 | Core | #7 |
| #10 | P1 | Build/test | Ready now |
| #11 | P0 | Core | #8, #9 |
| #12 | P0 | Client | Ready now |
| #13 | P1 | Build/test | #10, #9 |
| #14 | P1 | World/data | #9, #7, #8 |
| #15 | P1 | World/core | #14, #11 |
| #16 | P1 | Gameplay | #9, #11, #7 |
| #17 | P1 | Gameplay/UI | #8, #9, #7 |
| #18 | P1 | World/data | #14, #8, #9 |
| #19 | P1 | Gameplay | #8, #16, #7 |
| #20 | P1 | UI | #8, #9 |
| #30 | P1 | Client | #8, #20 |
| #24 | P1 | Creature/data/art | #7, #16, #32 |
| #25 | P2 | Gameplay | #16, #17, #24 |
| #26 | P1 | World/gameplay | #14, #24, #16 |
| #23 | P1 | Gameplay | #16, #24, #18 |
| #27 | P1 | World integration | #51, #52, #53, #54, #26, #18 |
| #28 | P1 | Content | #27, #18, #23 |
| #31 | P1 | Gameplay/feedback | #22, #27, #23, #26, #19, #28 |
| #33 | P1 | UI | #20, #16, #17, #18 |
| #34 | P1 | UI | #33, #20, #15 |
| #35 | P1 | Client/test | #33, #15, #11 |
| #32 | P1 | Art/pipeline | #7, #12, #50 |
| #36 | P1 | Animation | #32, #15 |
| #38 | P2 | Audio | #11, #20, #32 |
| #37 | P2 | Rendering | #9, #27, #36 |
| #39 | P1 | Test/feedback | #13, #27, #23, #28, #30, #35 |
| #21 | P1 | Delivery | #10, #12 |
| #42 | P1 | Delivery/feedback | #39, #31, #21, #30, #36, #34 |
| #22 | P1 | Integration/feedback | #51, #16, #17, #18, #11, #13 |
| #50 | P1 | Core/data | #9, #14, #8 |
| #51 | P1 | Biome content/art | #14, #15, #32, #24, #18 |
| #52 | P1 | Biome content/art | #14, #15, #32, #24, #18, #22 |
| #53 | P1 | Biome content/art | #14, #15, #32, #24, #18, #22 |
| #54 | P1 | Biome content/art | #14, #15, #32, #24, #18, #22 |

The exact dependencies above are a DAG. Independent briefs, art references, sketches and test fixtures can start before dependencies are fully implemented. #27 integrates the four map pairs; it does not duplicate their production work. #22 is the first gameplay feedback checkpoint, and #42 is the final personal-ready checklist.

## First queue

- #8: verify the merged save codec, preserve progress and finish remaining recovery/migration checks.
- #12: verify the merged loader/retry behavior and complete the remaining error/slow-loading cases.
- #7: freeze the small 4/8/12 content matrix and first meadow objective.
- #10: lightweight checks, in parallel with fixes.
- #9 → #14 / #50: shared module/map/pack contracts, without a general-purpose engine rewrite.
- #51 → #22: first normal playable map pair and owner feedback.

## Deferred / not planned for the first adventure

- #29 — Add six side quests, regional secrets and collection goals. Detailed side quests, regional lore and branching narrative are postponed until after the first varied personal adventure. Small discoveries belong in the biome packages, not a mandatory six-quest campaign.
- #40 — Document code, artwork, audio and font rights for distribution. A formal public/commercial distribution rights review is not a delivery gate for this personal project. Ordinary asset/source metadata remains part of reusable asset work; no blanket claim of copyright exemption is being made.
- #41 — Add bounded diagnostics, feedback and support information. Public support, telemetry and a formal feedback/diagnostic service are not needed for one owner. Useful local errors and reproduction notes stay in the lightweight check/save tasks.
- #43 — Evaluate opt-in cloud saves and cross-device accounts. Local saves plus export/restore cover current personal use. Accounts/cloud sync are deferred.
- #44 — Evaluate trading or PvP as a separate online product track. Trading/PvP, servers, competitive authority and public online operations are outside the agreed adventure.
- #45 — Expand postgame with rematches, challenge routes and new regions. Additional regions, rematch systems and a new story are deferred until the first four-biome adventure is enjoyable. Reusable pack support is retained now.
- #46 — Evaluate installable offline play and safe service-worker updates. PWA installation/service workers are optional later work. A normal browser game is the current target.
- #47 — Evaluate translations, controller input and additional platform ports. Translation, controller support and native ports are not needed until the owner wants those specific capabilities.

## Working rules

- Issues are not completed just because the plan is rewritten. Keep implementation/repro evidence with each issue.
- Update epic/task checklists when criteria actually pass, and change this plan when personal preferences change.
- Storytelling/lore depth comes later. Reusable asset/pack infrastructure is tested now with small fixtures, not another campaign.
- Personal-ready acceptance requires normal playable progression, reliable saves and the owner’s enjoyment; it does not require commercial QA, public distribution paperwork or optional audio/performance polish.
