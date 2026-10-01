# Mossvale

An original browser-playable creature-catching game with a 2D isometric world, pixel art, and eight-direction movement.

[Play the hosted game](https://mossvale-pixel-adventure.gonzaloreydelcastill.chatgpt.site)

## Play locally

No build step or dependencies are required. From the repository root, run:

```sh
python3 -m http.server 8080 --directory dist
```

Open <http://localhost:8080> in a browser. Any static web server can serve the `dist` directory.

## Controls

| Control           | Action                                                       |
| ----------------- | ------------------------------------------------------------ |
| WASD / arrow keys | Move in eight directions                                     |
| Shift             | Run                                                          |
| E                 | Interact with a nearby ranger, shrine, chest, sign, or trail |
| M                 | Island map                                                   |
| J                 | Field journal                                                |
| Q                 | Companion team                                               |
| 1–6 during battle | Select a battle action                                       |
| Escape            | Close a menu or leave an encounter                           |

On touch screens, use the directional pad, Run button, and interaction prompt.

## Adventure

Explore Mossvale Meadow, Amber Ridge, and Frostveil Grove. Befriend eight species and choose any captured creature as your companion. Battles include elemental strengths, capture chances, potions, guarding, and companion switching. Creatures gain experience and levels.

Awaken each shrine by defeating its guardian to unlock the next region. Visit Ranger Iris to heal your team and refill capture orbs, or buy extra supplies with coins earned from battles and treasure chests.

Progress saves automatically in the current browser using local storage. Original meadow saves are migrated to the expanded game. If a save is damaged, the game keeps the unreadable data, restores the last checkpoint when possible and tells you what happened. Required artwork that fails to load shows an error with a retry button instead of starting a broken game. Saves are specific to the browser and origin; progress on the hosted game does not automatically transfer to localhost or another host.

## Files

- `dist/index.html`, `dist/style.css`: interface and styles.
- `dist/src/`: game code as ES modules (data, pure domain rules, save codec, services, rendering, UI, controller). See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- `dist/maps/*.json`: map data (terrain, landmarks, exits, encounter zones), see [docs/MAP_FORMAT.md](docs/MAP_FORMAT.md); `npm run map:preview -- meadow` shows one.
- `dist/src/data/assets.js`: asset manifest (names, sizes, required status).
- `dist/sprite*.png`: original creature, character, and environment artwork. `dist/favicon.svg`: site icon.
- `docs/`: [game design](docs/GAME_DESIGN.md), [architecture](docs/ARCHITECTURE.md), [map format](docs/MAP_FORMAT.md), [save format](docs/SAVE_FORMAT.md), [roadmap](docs/FULL_GAME_ROADMAP.md).
- `tests/`, `scripts/`, `.github/workflows/ci.yml`: automated checks.

The game uses vanilla JavaScript and Canvas 2D. It has no backend, account system, or multiplayer service. Fonts are loaded from Google Fonts with local fallbacks.

## Development and checks

Node 20+ (CI uses 22). Install once with `npm ci`; serving the game needs no build (`npm start` or the command above).

| Command                | What it runs                                                                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`        | ESLint, Prettier check, asset manifest + module-boundary validation, unit tests (save codec, seeded gameplay rules)                                               |
| `npm run test:browser` | Chromium smoke tests: malformed/corrupt saves, missing-sprite retry, a seeded battle, menus, travel, v3 save write (needs `npx playwright install chromium` once) |
| `npm run verify`       | Everything above, same as CI                                                                                                                                      |
| `npm run format`       | Apply Prettier                                                                                                                                                    |

CI (`.github/workflows/ci.yml`) runs `verify` on every push and pull request. It never blocks direct pushes to `main`; failures show on the commit. To reproduce a CI failure locally, run `npm ci && npm run verify`. Open the game with `?debug` (and `&seed=N`) to get `window.mossvale` for manual inspection.

## Development roadmap

The [personal-adventure roadmap](https://github.com/King-Zalogon/mossvale/issues/1) targets four varied biomes, eight compact maps and 12 creatures, with reusable assets and a light progression story. These are planned additions; the current playable feature list above describes the existing game.

See [the detailed plan](docs/FULL_GAME_ROADMAP.md) and [machine-readable backlog](docs/ROADMAP_BACKLOG.json). The superseded larger plan is retained in [the archive](docs/archive/2026-09-30/FULL_GAME_ROADMAP.md).
