# Shrine battle forms (#315)

The four shrine guardians have original transformed combat art. Normal wild encounters, party members, journal portraits and followers continue to use their original species assets. Stats, tactics, cadence, rewards, save schema and progression are unchanged.

| Map | Species | Named combat asset | Transformation |
| --- | --- | --- | --- |
| Meadow | Mushmallow | `creature-mushmallow-thorn-mantle-combat` | Swept violet thorn mantle, rooted flank armor and a small spotted mushroom garden; cream hedgehog face and paws remain visible. |
| Amber Ridge | Pebblit | `creature-pebblit-crystal-ridge-combat` | Jagged amber ridge and glowing fissures on the tortoise shell; four thick reptile legs and ochre head remain recognizable. |
| Frostveil Grove | Frostowl | `creature-frostowl-ice-mantle-combat` | Broad bladed wing mantle, elongated ice tufts, stern cyan eyes and navy chest chevron; white owl face, feathers and dark talons remain recognizable. |
| Reedfen Wetlands | Siltkip | `creature-siltkip-tide-sail-combat` | Swept layered dorsal/gill fan armor, stern raised eyes and turquoise/gold ribbon tail; spotted mudskipper body and cream belly remain recognizable. |

## Authoring and compatibility

A shrine landmark's optional `guardian.combatSprite` names a manifest asset for that species. It must be a `creature-<species>-…-combat` transparent 4×5 atlas with the standard row order. Example:

```json
{"species":"mushmallow","level":7,"tactic":"spore-guard","power":1.8,"combatSprite":"creature-mushmallow-thorn-mantle-combat"}
```

Asset IDs describe appearance rather than story role. `buildAdventure` validates the reference and frame contract, then `compileMap` resolves its named ID. `guardianCombatSprite` selects only a boss matching the current map's unique species/tactic shrine definition. Do not author multiple same-species/same-tactic shrines with an override on one map: selection is deliberately ambiguous and uses normal art. Different packs opt in individually; missing fields retain normal art. A missing override PNG falls back to the normal combat atlas, then the static portrait if both sheets are unavailable. No manifest indices or new art fields are persisted; a resumed guardian resolves the current pack's mapping again. Refresh pack integrity after editing a map.

## Sources and review

Raw generated PNGs are retained unchanged under `art/characters/source/`. `art/characters/guardian-generation.json` records prompt summaries, reference hashes, generation revision notes and rejected-source hashes. The tool identified itself as `image_gen.imagegen`; provider model version and seed were not exposed and are recorded as unavailable. First layouts were rejected for crossing frame boundaries; Frostowl was redesigned because its first idle silhouette resembled the base creature too closely. Revised sources leave separated creature poses.

`creature-guardian-combat-v1` is the export profile. The exporter reuses the directional exporter’s alpha/component cleaner and separated-row detection, finds the four source columns, then uses **one common scale per entire twenty-frame sheet**, nearest-neighbor sampling, and a centered ground line at local y=284. Detached components below 180 pixels and alpha at or below 32 are removed as source noise. This preserves enclosed transparency and prevents faint poses being enlarged independently. Raw inputs are never rewritten. Source row bands may differ from equally sized runtime rows; only the normalized runtime cells use the fixed grid. The editable source atlas contains exact runtime pixels, with four separate 1152×1440 cells. Metadata, hashes and named IDs link the sources and exports.

Each runtime sheet is 1152×1440, containing 288×288 frames in row order idle, attack, hit, faint, capture and column order 0,1,2,3. Anchor: bottom-center; feet at y=284, four transparent pixels below. Cadence: idle 220 ms/frame looping; attack 105, hit 80, faint 160 and capture 130 ms/frame, one-shot then idle. Reduced motion shows idle frame 0 or action frame 3 without a running animation. Guardians remain uncapturable; capture art completes the reusable format.

Internal review inspects silhouettes and every state at 107 px normal / 132 px transformed draw width in a 160×145 battle canvas, checks transparent boundaries and foot placement, and separately records owner taste as pending. Technical validation does not imply owner approval.

## Local review

```sh
git fetch origin
git switch integration
git pull --ff-only
npm ci
npm start
```

Open **Menu → Testing URLs → Guardian battle forms** (`/guardian-combat-preview.html`). Compare the normal and shrine form side by side, choose every animation, replay it and toggle reduced motion. All twenty guardian frames are also displayed individually at actual battle scale. In the adventure, challenge the shrine in Meadow, Amber Ridge, Frostveil Grove and Reedfen Wetlands; compare an ordinary encounter and your own companion of the same species. Reload during a shrine battle and confirm it keeps its form.

Regression coverage: `tests/guardian-art.test.mjs` checks all four mappings, unchanged rule results and save round trips, bad references and old-pack fallback. `tests/guardian-art.browser.mjs` checks actual shrine interaction, all states, idle return, reload, normal encounters/party art, missing-sheet fallback, transparent frame/foot boundaries, reduced motion and source/packaged preview loading. All checks are included in `npm run verify`; `npm run build` packages the preview. No production deployment is needed.
