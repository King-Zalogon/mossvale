# Mossvale

Map authoring preview: open `dist/map-editor.html` locally. The browser editor keeps its edits local and exports the validated map JSON used by the runtime and CLI.

An original browser-playable creature-catching game with a 2D isometric world, pixel art, and eight-direction movement.

[Play the hosted game](https://mossvale-pixel-adventure.gonzaloreydelcastill.chatgpt.site)

## Play locally

No build step or dependencies are required. From the repository root, run:

```sh
python3 -m http.server 8080 --directory dist
```

Open <http://localhost:8080> in a browser. Any static web server can serve the `dist` directory.

## Controls

| Control           | Action                                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| WASD / arrow keys | Move in eight directions                                                                                    |
| Shift             | Run                                                                                                         |
| E                 | Interact with a nearby ranger, shrine, chest, sign, or trail; during a conversation, next line (Esc closes) |
| M                 | Island map                                                                                                  |
| J                 | Field journal                                                                                               |
| Q                 | Companion team                                                                                              |
| 1–6 during battle | Select a battle action                                                                                      |
| Escape            | Close a menu or leave an encounter                                                                          |

On touch screens, use the directional pad, Run button, and interaction prompt.

## Adventure

Explore four biomes across eight maps: Mossvale Meadow, Amber Ridge, Frostveil Grove, and Reedfen Wetlands. Befriend twelve species. Up to three companions form your team and the rest wait in the reserve. Battles include elemental strengths, a Focus resource for the elemental move, capture chances, potions, guarding, and companion switching. Creatures gain experience and levels.

A title screen offers Continue (or Start adventure), Settings, New game and, after a restart, Restore previous adventure. New game keeps your old adventure as a backup; sound, volume, ambient music, motion and zoom preferences persist.

Awaken each shrine by defeating its guardian to unlock the next region. Visit Ranger Iris to heal your team and refill capture orbs, or buy extra supplies with coins earned from battles and treasure chests.

Progress saves automatically in the current browser using local storage. Original meadow saves are migrated to the expanded game. If a save is damaged, the game keeps the unreadable data, restores the last checkpoint when possible and tells you what happened. Required artwork that fails to load shows an error with a retry button instead of starting a broken game. Saves are specific to the browser and origin; progress on the hosted game does not automatically transfer to localhost or another host.

## Files

- `dist/index.html`, `dist/style.css`: interface and styles.
- `dist/src/`: game code as ES modules (data, pure domain rules, save codec, services, rendering, UI, controller). See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- `dist/adventures.json`: the adventures this build offers (chooser, see [docs/PACKS.md](docs/PACKS.md)).
- `dist/maps/index.json`: the adventure pack manifest ([docs/PACKS.md](docs/PACKS.md)).
- `dist/maps/*.json`: map data (terrain, landmarks, exits, encounter zones), see [docs/MAP_FORMAT.md](docs/MAP_FORMAT.md); `npm run map:preview -- meadow` shows one.
- `dist/maps/registries.json`: pack-owned species, regions, moves and tuning; see [docs/PACKS.md](docs/PACKS.md) for `npm run pack -- create-pack`, `add-map`, `validate-pack` and `preview-pack`.
- `dist/src/data/assets.js`: asset manifest (names, sizes, required status).
- `dist/assets/`: original creature, character, and environment artwork, named by what it shows ([docs/ASSETS.md](docs/ASSETS.md)). `dist/favicon.svg`: site icon.
- `docs/`: [game design](docs/GAME_DESIGN.md), [architecture](docs/ARCHITECTURE.md), [map format](docs/MAP_FORMAT.md), [save format](docs/SAVE_FORMAT.md), [content branch integration](docs/CONTENT_INTEGRATION.md), [backup and restore](docs/BACKUP.md), [publishing and rollback](docs/PUBLISHING.md), [roadmap](docs/FULL_GAME_ROADMAP.md), [assets](docs/ASSETS.md), [performance](docs/PERFORMANCE.md), [audio](docs/AUDIO.md), [exploration and maps](docs/NAVIGATION.md).
- `tests/`, `scripts/`, `.github/workflows/ci.yml`: automated checks.

The game uses vanilla JavaScript and Canvas 2D. It has no backend, account system, or multiplayer service. Fonts are loaded from Google Fonts with local fallbacks.

## Private Vercel deployment

The portal-hosted copy is a separate deployment from the existing hosted game. It uses the Zalonline Supabase Auth project and only serves `/game/` after the signed-in user can read the enabled `mossvale` row in `public.applications` under row-level security. Add the production Vercel URL to that row from the Zalonline owner account. The public GitHub repository and existing hosted game are unchanged.

In Vercel, import this repository as a Next.js project and add these environment variables for Production:

| Variable                        | Value                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | The Zalonline Supabase project URL                                                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | That project's publishable/anon key (never a secret/service-role key)               |
| `MOSSVALE_GATE_SECRET`          | A private random value of at least 32 characters, such as `openssl rand -base64 32` |

Deploy, then upsert the project URL into `public.applications` with slug `mossvale`. Sign in with an existing Zalonline user; access follows the portal's per-user and group app grants. No Supabase service-role key belongs in Vercel. Browser saves remain local to that browser and deployment origin; they do not sync to the old hosted game or other devices.

For local development of the portal wrapper, copy `.env.example` to `.env.local`, fill in the values, then run `npm run dev`. The original local game server remains `npm start`.

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

The first-adventure content target is present: four biomes, eight maps, twelve species, and a short ending after the four shrine seals. Remaining work is the linked integration checks and your play feedback; later packs and presentation extras are optional. See the [personal-ready checklist](docs/READY.md) and [roadmap](https://github.com/King-Zalogon/mossvale/issues/1).

See [the detailed plan](docs/FULL_GAME_ROADMAP.md) and [machine-readable backlog](docs/ROADMAP_BACKLOG.json). The superseded larger plan is retained in [the archive](docs/archive/2026-09-30/FULL_GAME_ROADMAP.md).
