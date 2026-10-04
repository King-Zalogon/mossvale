# Personal-ready checklist (#42, #39)

A working checklist for calling the first adventure "ready to play for fun", with honest status. Passing checks support reliability; **whether it is fun is your call**. The personal-ready marker stays open until the linked integration checks are resolved and you have played the integrated build and accepted it.

## Automated evidence (`npm run verify`, CI on every push)

The workflow runs on Ubuntu and Windows for pushes and pull requests. Treat a check as passing only when its run is green for the exact commit being considered.

| Area | Evidence |
| --- | --- |
| Saves: validation, v1-v4 migration to v5, map-location and optional pack-inventory persistence, corruption recovery, frozen fixtures per prior schema (the v2 fixture was written by the original build; no v1 writer survives in git history, so v1 stays synthetic) | `tests/save.test.mjs`, `tests/saves-compat.test.mjs`, browser recovery tests |
| Slow, corrupt, aborted or stalled art, blocked fonts, no canvas, bad map data | `tests/loader.browser.mjs` |
| The first guardian is beatable through the real UI, no debug damage | `tests/playthrough.browser.mjs` |
| Refresh or interruption mid-battle never loses an item or reward | `tests/turns.test.mjs`, browser "refresh during capture" |
| Capture, shop, chests and seals pay exactly once | `tests/economy.test.mjs`, `tests/objectives.test.mjs`, `tests/turns.test.mjs` |
| The chain of maps, exits and goals cannot softlock; every creature can be found | `tests/maps.test.mjs`, `tests/objectives.test.mjs`, `tests/encounters.test.mjs` |
| Guardians can be beaten more than one way, and retried | `tests/guardians.test.mjs` |
| A bot playing normally clears the meadow guardian | `tests/playthrough.test.mjs` |
| Title, settings, new game, restore, backup export/import | `tests/profile.test.mjs`, `tests/backup.test.mjs`, browser flows |
| Adventure pack: creature list, milestone order, shared art with different roles, saves from another adventure refused | `tests/packs.test.mjs` |
| Sound: palette, ambience never stacks, mute/volume, pause/hidden, no Web Audio | `tests/audio.test.mjs` |
| Rendering cost: no per-frame canvas filters; measured fps per map | `tests/render-budget.test.mjs`, `scripts/measure-perf.mjs` |
| Several adventures in one browser: own progress, backups and recovery journals; switching and reloading never mixes them; wrong-pack imports refused | `tests/adventures.test.mjs`, `tests/adventures.browser.mjs` |
| Explored ground and found places on the minimap and a pan/zoom area map; secrets hidden until found; saved with the adventure; quiet corridors | `tests/discovery.test.mjs`, `tests/discovery.browser.mjs` |
| Assets: naming, format, crop, manifest | `tests/assets.test.mjs`, `npm run validate` |
| Menus stay inside the screen at large text, stable focus, 44 px touch targets, contrast | browser flows, `tests/contrast.test.mjs` |
| Builds are stamped and traceable to a commit | `tests/build.test.mjs`, CI artifacts `mossvale-<full-sha>-ubuntu-latest` and `mossvale-<full-sha>-windows-latest` (90-day retention) |
| A clean checkout runs the same checks CI runs (`npm ci && npm run verify`); missing art, broken maps and bad saves are caught; checks show on every push and never block one | `.github/workflows/ci.yml`, README "Development and checks" |

## Content present in the current pack

- Four biomes, eight maps, twelve species, four shrine milestones, and a one-time ending are declared in `dist/maps/index.json`, `dist/maps/registries.json`, and `dist/maps/story.json`.
- `npm run validate`, pack/story tests, and the normal browser playthrough cover data links and progression. This confirms the shipped content and tested path; it does not establish that the adventure is fun for you.
- The ending follows all four seals, marks the save complete once, and leaves the world open for collecting and exploration. Credits and a separate final-destination map are optional follow-up work, not required to reach the ending.

## Needs you (cannot be judged from here)

- **Play the meadow.** First capture, the first guardian, a refresh in a fight. Does Focus feel like a decision? Is a team of three right? Is the pace of levels and coins right? (#22, #31, #16, #17, #25, #19)
- **Your devices and browsers.** Controls on your screens, touch layout, text size, and export/import between your browsers. Automated coverage cannot confirm your real devices (#35).
- **Taste.** The opening and ending text is placeholder; the tips and the title screen on every load may be too much. (#28, #20)
- **Rewrite or delete anything you do not enjoy.** The roadmap prefers removing UI to adding dashboards.

## Remaining integration checks and owner feedback

- **Motion integration dependency.** Issue #36 remains open. The current build has an eight-direction player preview and initial reusable creature animations, but the agreed creature set is not complete across the roster. You can play this build now; keep #42's ready marker open until #36 is integrated or its scope is explicitly adjusted.
- **Fun and pacing.** Try captures, the guardians, refresh recovery, team size, and the pace of levels and coins; tune only from your notes (#31, #39 and related play-feedback issues). Passing regressions do not replace your play feedback.
- **Your hardware.** Performance has a headless-browser measurement, but no measurement on your devices yet (#37).
- **Presentation.** The premise and ending copy are short placeholders; credits and a separate final destination are deferred (#28, [story notes](STORY.md)).
- **Hosting.** CI artifacts make each checked commit recoverable. Publishing to the existing hosted site remains a manual step because its import mechanism is outside this repository (#21); no deployment or audience setting is changed here.

Credits and a rights review remain optional follow-up work in the roadmap.

## Recoverable

Every CI push/PR packages `build/` from that exact commit and uploads separate Linux/Windows artifacts for 90 days. `docs/PUBLISHING.md` explains how to identify, play, keep, and roll back a stamped build. Save migrations have frozen fixtures; the game also keeps an adventure archive and session checkpoint. A rollback to code older than a save schema leaves that save untouched and read-only rather than overwriting it.
