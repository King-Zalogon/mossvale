# Mossvale 1.0 game design

**Document version:** 1.0 (2026-10-01) · **Status:** baseline for downstream contracts · **Issue:** [#7](https://github.com/King-Zalogon/mossvale/issues/7) · **Roadmap:** [#1](https://github.com/King-Zalogon/mossvale/issues/1)

All targets below are planning targets to validate, not existing features. "Today" notes describe the prototype at commit `627dd6b`. Changes to a number in this file must be recorded in the [change log](#change-log) and reflected in the roadmap; do not widen scope silently.

## 1. Product statement

Mossvale is a small, single-player, offline-first browser RPG: explore hand-authored isometric islands, befriend original creatures, train a party, and awaken three shrines to finish the story. It stays an original pixel-art world with eight-direction movement on Canvas 2D.

## 2. Platforms and constraints

| Topic | Decision |
| --- | --- |
| Input | PC keyboard (WASD/arrows, Shift run, E interact, M/J/Q menus, 1–6 battle). Mobile touch: eight-direction pad, Run, tap-to-interact. Controller is post-1.0 ([#47](https://github.com/King-Zalogon/mossvale/issues/47)). |
| Browsers | Current and previous major Chrome, Edge, Firefox, Safari (desktop); Chrome Android, Safari iOS. |
| Network | Fully playable offline after first load. No account, backend, analytics or online service. Fonts are optional and fall back locally. |
| Saves | Local, versioned, with backup/export/import ([SAVE_FORMAT.md](SAVE_FORMAT.md), [#30](https://github.com/King-Zalogon/mossvale/issues/30)). |
| Performance budget | 60 fps on a mid-range laptop and ≥30 fps on a 2021 mid-range phone; first playable ≤5 s on a fast connection; total download ≤8 MB (today 3.3 MB); no frame-time spikes >50 ms during map transitions. |
| Accessibility budget | Full keyboard operation; visible focus; reduced-motion respected; WCAG AA text contrast; type never the only cue (icons/text for effectiveness); adjustable text size; no flashing >3 Hz. |
| Out of 1.0 | Accounts/cloud saves, trading/PvP, monetization, native ports, translations, installable/offline service worker, extra postgame regions (tracks #43–#47). |

## 3. Core loop

1. **Explore** an authored map; read signs, talk to NPCs, open chests, find secrets.
2. **Encounter** a wild creature in tall grass (paced by steps, discoverable pools per region) or a trainer/guardian by interaction.
3. **Battle** (turn-based, 1v1 active creature): choose among up to four equipped moves, Guard, Potion, Capture orb, Switch, or Flee (not vs. guardians/trainers).
4. **Capture** weakened creatures. Each capture is an individual creature (own level, XP, HP, moves).
5. **Train**: win battles for XP and coins; level up, learn moves, evolve.
6. **Prepare**: rest and shop at ranger camps; edit party; read journal.
7. **Progress**: complete quests and awaken the region's shrine to open the next trail.

### Failure rules
- Losing a battle (all party members at 0 HP) returns the player to the region camp with the party fully healed; coins and items are kept, no permanent loss. Quest and battle outcomes are not rolled back.
- Fleeing a wild encounter is always allowed and costs nothing but the turn.
- Guardians cannot be captured; losing to one has no penalty beyond the camp return.
- A refresh or closed tab during an encounter must not consume resources unrecoverably ([#11](https://github.com/King-Zalogon/mossvale/issues/11)).

## 4. Systems

| System | Decision |
| --- | --- |
| Party | Six active members, plus reserve storage (cap 60 individuals). Order matters (first healthy member leads battle). |
| Creatures | Individual records: stable ID, species ID, level, XP, HP, equipped moves (≤4), optional nickname post-1.0. |
| Types | Eight types (Leaf, Fire, Water, Air, Spark, Spore, Ice, Stone), strong 1.6× / weak 0.65× as today; matchup chart is data, shown in battle UI. |
| Moves | ~40 moves, each with type, power, accuracy, cost/limit and optional status; every species learns 4–6 moves by level. Today: one basic and one elemental move. |
| Status | Three simple statuses (e.g. Sleep, Burn, Slow), 2–4 turns, never permanent. |
| Level and XP | Level cap 40. XP per level grows gradually (today 45 flat per level, no cap); first-chapter levels 5–12. |
| Evolution | 6 evolution lines among the 24 forms, at levels ~16 and ~30, shown in the journal. |
| Economy | Coins from battles/chests; orbs and potions at camps; pricing tuned so a typical player rarely runs dry (measured in [#31](https://github.com/King-Zalogon/mossvale/issues/31)). |
| Capture | Chance rises as HP drops; orbs have one tier in 1.0 (second tier is a cut candidate). |

## 5. Campaign structure

| Chapter | Region | Maps (9 total) | Content |
| --- | --- | --- | --- |
| 1 | Mossvale Meadow | Camp hub, Whispering Trail, Meadow Shrine | Tutorial, first capture, quests 1–2, guardian 1 |
| 2 | Amber Ridge | Ridge camp, Sandstone Pass, Amber Shrine | Quests 3–4, guardian 2, first evolutions |
| 3 | Frostveil Grove | Grove camp, Snowfall Path, Frostveil Shrine | Quests 5–6, guardian 3, finale |

- **Ending:** after the third seal, a short final sequence resolves the story (the shrines relight the isles), credits roll, and the player returns to free exploration with a completion record. The campaign has exactly one unambiguous ending.
- **Side quests:** six, two per region, each with a persistent state and a reward (item, secret area or creature).
- **Duration target:** 3–5 hours for a first playthrough (median), measured in [#31](https://github.com/King-Zalogon/mossvale/issues/31).
- **First chapter proves all mechanics:** exploring, tutorial, capture, party, moves, shop, quest, save/continue and a naturally winnable guardian ([#22](https://github.com/King-Zalogon/mossvale/issues/22)) before scaling to other regions.

## 6. Content inventory (1.0 target)

| Content | Target | Today |
| --- | --- | --- |
| Regions | 3 | 3 (same layout) |
| Authored maps | 9 | 3 generated maps |
| Species/forms | 24 (≈6 evolution lines, ~12 base) | 8 |
| Moves | ~40 | 2 per creature |
| Side quests | 6 | 0 |
| Shrine guardians | 3 | 3 (1 type each) |
| Trainers | ~9 (≈3 per region) | 0 |
| NPCs with dialogue | ~12 | 1 (Ranger Iris) |
| Items | orbs, potions, 1–2 key items | orbs, potions |
| Music tracks | ~5 + SFX set | beeps |
| Animations | 8-direction walk for player; idle/attack per creature | 4 static player directions |

## 7. Success metrics

| Metric | Target |
| --- | --- |
| Campaign length | Median 3–5 h, 90% of testers finish within 8 h |
| Completability | 100% of testers can finish without a blocking defect; zero P0/P1 open defects at release |
| Save integrity | 0 lost saves in the QA corpus (v1/v2/v3 fixtures, refresh at every state) |
| Difficulty | First guardian won by ≥80% of testers on the first or second try without grinding beyond 30 min |
| Collection | ≥70% of testers capture ≥18 of 24 forms; 100% obtainable |
| Performance | Budgets in §2 met on reference devices |
| Accessibility | Keyboard-only and reduced-motion passes complete the full campaign |

## 8. Cut list (in order of removal if the schedule slips)

1. Second capture-orb tier and extra item variety.
2. Status effects beyond two.
3. Evolution lines beyond four (species counts may drop to 20 forms).
4. Two of six side quests (keep one per region minimum).
5. Per-creature unique idle animations (keep shared sets).
6. Secret areas beyond one per region.

Never cut: tutorial, save recovery, guardian fights, ending, keyboard play, accessibility baseline.

## 9. Open questions to resolve before the dependent issue starts

- Final species list and evolution lines ([#24](https://github.com/King-Zalogon/mossvale/issues/24)).
- Final move table and status list ([#16](https://github.com/King-Zalogon/mossvale/issues/16)).
- Exact level cap and XP curve ([#25](https://github.com/King-Zalogon/mossvale/issues/25)).

## Feasibility review (2026-10-01)

Targets were compared against the current mechanics and the [roadmap](FULL_GAME_ROADMAP.md) estimate (213–355 person-days with reserve). The largest uncertainties remain battle redesign, map authoring tools and animation. No roadmap estimate changed; the cut list above is the only scope lever.

## Change log

- 1.0 (2026-10-01): Initial baseline.
