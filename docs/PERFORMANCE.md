# Rendering performance notes

Run `npm run perf:measure -- 2 8` to sample each shipped map for two seconds and an eight-second exploration session. This uses headless Chromium at 1280×800 with software rendering; timings and frame rates describe this runner, not a physical phone or the owner's device. Repeat with the same browser and viewport before comparing changes. `?debug` exposes rolling renderer timings as `window.mossvale.perf()` for an interactive device run.

## Current baseline

Measured 2026-10-04 from current main `c7d1f7c` with Node 24.19.0, Playwright 1.56.1 and the bundled headless Chromium. Each map was profiled for two seconds while walking a dense area; the separate memory sample explored Amber Ridge for eight seconds after startup/decode settled.

| Map | World objects | Draw average | Draw p95 | Peak draw sample |
| --- | ---: | ---: | ---: | ---: |
| Meadow | 446 | 1.42 ms | 2.70 ms | 6.00 ms |
| Amber Ridge | 219 | 0.89 ms | 1.80 ms | 6.20 ms |
| Frostveil Grove | 217 | 1.13 ms | 2.10 ms | 8.70 ms |
| Frostveil Pass | 88 | 1.06 ms | 2.10 ms | 5.80 ms |
| Reedfen Wetlands | 224 | 1.31 ms | 1.80 ms | 26.50 ms |
| Orchard Ruins | 49 | 0.74 ms | 1.10 ms | 4.00 ms |
| Stilt Isles | 161 | 0.78 ms | 1.00 ms | 4.80 ms |
| Stone Basin | 218 | 0.85 ms | 1.30 ms | 7.20 ms |
| Meadow battle | 446 | 1.59 ms | 2.00 ms | 5.50 ms |

The sample reported 52–59 frames per second in exploration and 52 in battle. The single Reedfen 26.50 ms draw spike should be checked with a longer repeat before attributing it to a stable bottleneck. The short memory run rounded start/end/peak to 10.0 MB (0.0 MB delta at 0.1 MB precision); this is not a long-session leak guarantee.

Current-main rendering already culls tiles and objects spatially and caches tinted sprites instead of applying Canvas filters per frame. These measurements do not justify further renderer changes in this environment. #37 still needs profiling on the owner's actual device and confirmation that ordinary play feels smooth enough.
