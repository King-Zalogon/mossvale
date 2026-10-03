# Performance

Issue [#37](https://github.com/King-Zalogon/mossvale/issues/37). Measure first, fix what the numbers show, stop.

## How to measure

- `node scripts/measure-perf.mjs [seconds]` loads each region in headless Chromium, walks back and forth through the densest part of the map and prints frames per second, `drawWorld` and minimap time (average, 95th percentile, worst), and heap size. It is not part of CI: timings depend on the machine.
- On your own device open the game with `?debug`, play for a while and run `mossvale.perf()` in the console: the last 600 `drawWorld` and 150 minimap times plus the frame count. Headless Chromium uses **software** rendering, so its absolute numbers are pessimistic; compare before/after, and trust your device for "smooth enough".

## Findings (headless, 1280x800, 4 s walk)

| Map | Before: fps / drawWorld avg | After: fps / drawWorld avg |
| --- | --- | --- |
| Meadow | 57 / 1.4 ms | 57 / 1.0 ms |
| Amber Ridge | **4** / 2.1 ms | 57 / 1.1 ms |
| Frostveil Grove | **2** / 2.7 ms | 57 / 1.1 ms |

The JavaScript time was small everywhere; the slowdown was in rasterising. Amber Ridge and Frostveil draw their grass with a Canvas `filter` (`sepia`, `saturate`/`brightness`), and a filter on every `drawImage` is re-applied every frame. Sprite tints are now baked once into a cached copy (`render/sprites.js: tintedSprite`) and drawn without a filter. `tests/render-budget.test.mjs` fails if a per-frame filter comes back.

Not changed, deliberately: the per-frame object sort, terrain details, minimap redraw (every 4th frame) and asset sizes. Each costs about a millisecond or less, so there is nothing measured to fix. Revisit if `mossvale.perf()` on your device says otherwise.

## Long sessions

A 25 s run per map showed flat `drawWorld` times and a flat heap (headless Chromium rounds heap figures coarsely, so this only rules out fast leaks). Nothing runs in the background except the 6 s save timer and the frame loop, and the loop does no drawing while the tab is hidden.

## Still needs you

The acceptance asks for your report of smooth exploration and battles and no slowdown in a long session on your devices. Run `mossvale.perf()` after a session and tell me the numbers if anything feels slow.
