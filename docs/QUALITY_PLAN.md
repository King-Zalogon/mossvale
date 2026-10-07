# Quality plan: toward a professional creature-collector

Issue [#252](https://github.com/King-Zalogon/mossvale/issues/252). Written after owner feedback that the delivered result was of poor quality. It records what was wrong, what the genre's references recommend, and the order of work. Judge each step by screenshots and play, not only by tests.

## Audit of `integration` (screenshots, 2026-10-06)

| Area | Finding |
| --- | --- |
| Terrain | Every tile was a flat diamond; ground alternated two colours per tile (a checkerboard). No shorelines, path edges or grass fringes, so water and land barely separated in the wetland palette. |
| Maps | The large maps were generated from ellipses and scatter. They are big, but similar and light on authored landmarks and set pieces. |
| Art reuse | One cottage, one boulder and one grass sprite appear in every biome. |
| Presentation | The playfield is a small card on a page; HUD labels can overlap map names. |
| Checks | GitHub Actions does not run for these branches, Vercel is rate limited, and `format:check` / `catalogue:check` fail on Linux on `integration` itself, so "green" has meant local runs only. |

## What the references recommend

- **Terrain transitions.** Tilemaps look hand-made when neighbouring terrains blend: the classic answers are the 47-tile "blob" bitmask, Wang tiles, and the cheaper dual-grid technique. All of them need many art variants, so this project paints the transitions procedurally per tile edge instead ([autotiling techniques](https://excaliburjs.com/blog/tags/autotiling), [Red Blob Games on autotiling](https://www.redblobgames.com/articles/autotile/claude/)).
- **Route design.** Pokémon's first routes teach by layout: grass patches that zig-zag along a path make a route feel longer without adding length, later routes use taller grass for more encounters, and fixed landmarks give players something to navigate by ([route analysis](https://fantendo.fandom.com/wiki/User_blog:Shadow_Inferno/A_short_analysis_of_the_first_Routes_in_Pokemon_Games_(Gen_I-IV))). Our maps need authored landmarks and pacing, not just size.
- **Mapping practice.** Fan-game tooling (Pokémon Essentials on RPG Maker) separates a base layer (grass, paths, water), a middle layer (trees, signs, rocks) and a top layer (roofs, treetops), and flags tiles for passability and "bush" encounters ([tileset docs](https://essentialsdocs.fandom.com/wiki/Tilesets?oldid=223), [layer conventions](https://daily.pokecommunity.com/2017/07/05/a-guide-to-beginning-pokemon-fangame-development-in-rmxp/3)). Our map format already has these ideas; the art and set pieces are what is thin.
- **Game feel.** Polish comes from small, consistent feedback: hit-stop of about 50–100 ms on heavy hits, short screen shake, particles, tweened (eased) motion, visual plus audio confirmation for key actions, and toggles for shake and flashes ([overview](https://www.wayline.io/learn/game-feel/1), [checklist](https://cursa.app/hi/article/game-feel-how-to-make-your-game-controls-feedback-and-movement-instantly-satisfying)).

## Order of work

1. **Terrain painter (#253, merged).** `render/terrain.js`: textured ground, grass, path and water baked once per zoom level; slow patches of lighter and darker ground instead of a checkerboard; shorelines with foam, shallow versus deep water, path edges and grass fringes. No new image assets; colours come from each region's palette. Measured `drawWorld` stays around 1.3–2.1 ms average (`node scripts/measure-perf.mjs`).
2. **Authored set pieces.** First slice (#254): `scripts/gen-set-pieces.py` composes standing-stone rings, oak/pine/snow groves with clearings, cairns and reed banks from existing sprites in all eight maps, deterministic and tagged (`piece`) so it is re-runnable and `--check`-able; `tests/set-pieces.test.mjs` keeps them off paths, spawns, exits and landmarks. Still open: hand-placed bridges, huts and quest-tied landmarks, which need new art. Original plan: Per biome: a distinct landmark vocabulary (bridges and stilt huts for wetland, rock arches and mesas for badlands, ruins and presses for the orchard), placed by hand and tied to quests and discoveries.
3. **Playfield and HUD.** A larger default playfield, a layout where labels never collide, and a fullscreen option on desktop.
4. **Battle feel.** Hit-stop, eased HP bars and damage numbers, particles for elemental moves, capture animation beats, with reduced-motion toggles.
5. **Delivery pipeline.** Make GitHub Actions run, fix the Linux-only failures, and decide how the catalogue is generated so it stays stable across Windows and Linux.

Art is the main limit: new sprites need an image generator and the project's review pipeline. Where a step is blocked by art, the plan is to use what exists, composed better, and to say so.
