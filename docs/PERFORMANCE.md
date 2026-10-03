# Rendering measurements

`node scripts/measure-perf.mjs 3` samples the same three built-in maps in software Chromium while the player walks. It reports frame rate, visible/world tile and object counts, `drawWorld` average/p95/max, minimap time and heap. The environment is intentionally labelled local/headless; these values are not a claim about a particular phone or desktop.

| Map | Baseline draw avg / p95 (ms) | Indexed draw avg / p95 (ms) | Baseline → indexed FPS | Visible tiles / map tiles | Visible objects / map objects |
| --- | ---: | ---: | ---: | ---: | ---: |
| Meadow | 0.87 / 1.40 | 0.79 / 1.20 | 58 → 57 | 497 / 497 | 167 / 167 |
| Amber Ridge | 0.81 / 1.30 | 0.90 / 1.30 | 57 → 57 | 497 / 497 | 155 / 155 |
| Frostveil Grove | 0.87 / 1.20 | 0.99 / 1.50 | 57 → 56 | 497 / 497 | 146 / 146 |

The current maps fit almost entirely inside the camera, so culling does not reduce their draw counts and timing stays within headless noise. The deterministic large-map regression uses a 120×80 grid with 9,600 tiles and confirms an 11×11 visible query returns 121 tiles; the cell index keeps both map drawing and interaction queries bounded to the viewed or nearby area as maps and object counts grow.

Nearby interaction and solid-collision checks use the same spatial cells. The renderer continues sorting visible objects by isometric depth and applies the existing foreground fade when a tree or cottage covers the player. `tests/render-budget.test.mjs` compares indexed collision behavior with the full-map rule and guards the culling/depth/occlusion path.
