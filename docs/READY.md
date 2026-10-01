# Personal-ready checklist (#42, #39)

A working checklist for calling the first adventure "ready to play for fun", with honest status. Passing checks support reliability; **whether it is fun is your call**. Updated as work lands; issues stay open until you agree.

## Automated, and passing on every push (`npm run verify`, CI)

| Area | Evidence |
| --- | --- |
| Saves: validation, v1/v2/v3 migration, corruption recovery, frozen fixtures per schema | `tests/save.test.mjs`, `tests/saves-compat.test.mjs`, browser recovery tests |
| Refresh or interruption mid-battle never loses an item or reward | `tests/turns.test.mjs`, browser "refresh during capture" |
| Capture, shop, chests and seals pay exactly once | `tests/economy.test.mjs`, `tests/objectives.test.mjs`, `tests/turns.test.mjs` |
| The chain of maps, exits and goals cannot softlock; every creature can be found | `tests/maps.test.mjs`, `tests/objectives.test.mjs`, `tests/encounters.test.mjs` |
| Guardians can be beaten more than one way, and retried | `tests/guardians.test.mjs` |
| A bot playing normally clears the meadow guardian | `tests/playthrough.test.mjs` |
| Title, settings, new game, restore, backup export/import | `tests/profile.test.mjs`, `tests/backup.test.mjs`, browser flows |
| Assets: naming, format, crop, manifest | `tests/assets.test.mjs`, `npm run validate` |
| Menus stay inside the screen at large text, stable focus, 44 px touch targets, contrast | browser flows, `tests/contrast.test.mjs` |
| Builds are stamped and traceable to a commit | `tests/build.test.mjs`, CI artifact |

## Needs you (cannot be judged from here)

- **Play the meadow.** First capture, the first guardian, a refresh in a fight. Does Focus feel like a decision? Is a team of three right? Is the pace of levels and coins right? (#22, #31, #16, #17, #25, #19)
- **Your devices and browsers.** Controls on your screens, touch layout, text size, export/import between your browsers. (#35, #30, #34)
- **Taste.** The opening and ending text is placeholder; the tips and the title screen on every load may be too much. (#28, #20)
- **Rewrite or delete anything you do not enjoy.** The roadmap prefers removing UI to adding dashboards.

## Not built yet (waiting on art, content or your decisions)

- Four biomes, eight maps and twelve creatures: today there are three maps and eight creatures (#24, #27, #51–#54). New species and terrain need original art; the data formats and validators are ready for them.
- Eight-direction walking animation and creature animation: only four facing images exist (#36).
- Sound palette and ambience (#38): current audio is single synthesized beeps, off by default.
- Performance on your devices (#37): in headless Chromium the game holds 60 fps (about 16.7 ms per frame on a software renderer); nothing has been measured on real hardware.
- Publishing: builds are stamped and kept per commit, but uploading to the hosted site is manual because this repository does not know how that host imports files (#21). Repository visibility is unchanged (public); deciding on private is yours.
- Credits and a rights review are deferred in the roadmap.

## Recoverable

Every push builds a stamped copy of the game (CI artifact `mossvale-<sha>`); `docs/PUBLISHING.md` explains publishing and rolling back, and saves are protected by migration fixtures, an archive of your previous adventure and the session checkpoint.
