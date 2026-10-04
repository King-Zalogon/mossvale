# Architecture and module ownership

Issue [#9](https://github.com/King-Zalogon/mossvale/issues/9). The game is plain ES modules served from `dist/` with no bundler: `dist/index.html` loads `src/main.js` as a module, so serving `dist` statically (see README) is still the whole dev and deploy workflow. Canvas 2D is kept.

## Layers and dependency rule

```
data  ─┐
config ├─►  domain (pure rules)  ─►  controller (flow, timers)  ─►  main (wiring, loop)
save  ─┘                                  ▲   ▲                          │
                          ui/*, render/*, services/*, input  ────────────┘
```

Pure layers (`data/`, `domain/`, `save.js`, `config.js`) may not use the DOM, timers, `Math.random`, `Date.now`, storage or import UI/render/service code. This is enforced by `npm run validate` (`scripts/check-boundaries.mjs`) and by ESLint, which gives those folders no browser globals. Randomness, time and storage are injected.

## Modules

| Path | Owner lane | Responsibility / API |
| --- | --- | --- |
| `src/data/species.js`, `regions.js` | Content design | Creature and region definitions with stable string `id`s. Never rename or reuse IDs. Geometry, landmarks and encounter tables are map data in `dist/maps/*.json`. |
| `src/data/assets.js` | Art | Asset manifest (`name, role, src, w, h, required`). Checked by `scripts/validate-assets.mjs`. |
| `src/config.js` | Core engineering | Shared constants (map size, tile size, XP per level). |
| `src/save.js` | Core engineering | `create({species, regions, size}) → {fresh, normalize, serialize, load}`; schema in [SAVE_FORMAT.md](SAVE_FORMAT.md). |
| `src/domain/rng.js` | Core engineering | `seededRng(seed)`. Domain functions take `rng()`. |
| `src/domain/rules.js` | Gameplay | `level, maxHP, companion, unlocked, effectiveness, gainXP, healTeam, clampHealth, objective` over a runtime save. |
| `src/domain/battle.js` | Gameplay | `rollWild, createBattle, resolveTurn` (a whole round, atomic: returns display events + `ended`), plus its building blocks (`playerStrike, usePotion, throwOrb, enemyAttack, resolveFaint, resolveWin, resolveCapture, resolveLoss, captureChance`) and `battleCheckpoint`. Mutate `save`/`battle` only. |
| `src/domain/phase.js` | Core engineering | `transition(game, 'explore' \| 'battle' \| 'result')` refuses impossible jumps. |
| `src/domain/mapdata.js`, `adventure.js` | World/data | Map JSON validation and compilation (`buildAdventure(rawMaps, content)`); format in [MAP_FORMAT.md](MAP_FORMAT.md). |
| `src/domain/world.js` | World | `buildWorld(map), isWalkable, zoneAt, nearestInteractive, triggersAt` over a compiled map. |
| `src/domain/exploration.js` | World | `movePlayer(state, sx, sy, run, dt)` returns `true` when a wild encounter starts. |
| `src/services/` | Client engineering | `audio` (beeps), `loader` (image loading with retry data), `maps` (fetches verified pack JSON), `persistence` (writes v5 saves and battle checkpoints through the codec; can be locked), `timeline` (cancellable/flushable frame playback), `settings` (preferences, own storage key), `profile` (new game archive / restore). |
| `src/render/` | Art/rendering | `sprites` (shared sprite array, `drawSprite`, `drawCreature`), `world` (`createWorldRenderer → drawWorld, drawMinimap`). Read-only over state. |
| `src/ui/` | UI | `dom` (selectors, toast, modal shell), `hud`, `menus` (map, journal, party, ranger, shrine, result, help, save notice), `battle-view`. Presentation only. |
| `src/input.js` | UI | Keyboard/touch handlers; writes `ui.keys` / `ui.touch`; `direction`, `isMoving`. |
| `src/controller.js` | Core engineering | Game flow: travel, interact, battle turns, rewards, camp. Calls domain, then ui. Fills `app.actions`. |
| `src/main.js` | Core engineering | Builds `app = {game, ui, rng, actions, audio, menus, persist}`, loader/boot, main loop, debug hook. |

## State

- `game` = `{save, player, world, battle, phase, pacing, firedTriggers}`: simulation state. `save` is the runtime save (species/region **indexes**; converted to stable IDs by `save.js` at the storage boundary).
- `ui` = `{modalMode, keys, touch, touchRun, paused, ready, zoom, camera, now}`: presentation state, never persisted.
- Transitions go through `app.actions` (e.g. `travel`, `startBattle`, `battleAction`, `selectCompanion`, `rest`, `buy`, `close`, `flee`). Domain functions are the only place rules change `save`.
- Stable IDs: species and regions are saved as strings (see SAVE_FORMAT). Object and map IDs for authored maps are defined with [#14](https://github.com/King-Zalogon/mossvale/issues/14).
- Events: the controller does not emit events yet; typed event payloads (for quests/dialogue) are defined with [#18](https://github.com/King-Zalogon/mossvale/issues/18) on top of `actions`.

## Debug and test hook

`window.mossvale` exists only when the page is opened with `?debug` (add `&seed=N` for a deterministic RNG). Production URLs expose nothing.

## Working in parallel

Content (`data/`), art (`dist/assets/` + manifest, see [ASSETS.md](ASSETS.md)), UI (`ui/`, `style.css`), gameplay rules (`domain/`) and flow (`controller.js`) live in separate files. Changes to a domain function signature must update `controller.js` and the matching test in `tests/gameplay.test.mjs` in the same commit.

## Known limits (follow-ups)

- Only three playable maps exist so far. Map flags include the map ID, and saves carry the adventure-pack ID; #51–#54 add the remaining planned map pairs.
- `style.css` is formatted but not yet split by component.
- Menu HTML is built with template strings; a component layer is not planned for 1.0.
