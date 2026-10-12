# Wispurr reusable creature resource

Wispurr is the owner-supplied shy floating spirit from two inline concept/movement boards. Preserve its dark-violet flame-shaped body, pale cream oval mask, expressive indigo eyes with cyan glints and one forehead mark, two upward cyan-tipped head wisps, small side wisps and attached blue/cyan curling lower flame-tail. Front views show the mask; north shows the rear silhouette without a pasted-on face. Side profiles and rear diagonals remain distinct.

Optional assets: `creature-wispurr`, `creature-wispurr-combat` and `creature-wispurr-follower`: portrait, twenty battle poses (idle, flame-body attack, hit/recovery, faint/rest, capture reactions × four) and forty directional poses (eight directions × neutral hover/four travel-hover phases). Open `dist/wispurr-preview.html` through a local server to inspect them using shared renderers at 115 px battle and 37 px map width. The isolated preview does not modify saves or the active roster.

Hover art uses the existing `idle`, `walk-1`…`walk-4` follower slots. Flame curl/length and body tilt give movement while the virtual ground anchor stays stable. Cosmetic floating does not bypass ground collision, water, obstacles or route gates. Reduced motion holds neutral hover. This does not install a flight or ghost movement system.

## Future map import

Copy `dist/resources/creatures/wispurr.json` into the chosen pack's species registry, add `wispurr` to the pack manifest species list and add `{"species":"wispurr","weight":1}` to a reachable map zone pool. Choose level, rarity, habitat and tuning deliberately. Air is provisional because the current engine has no Spirit type. The 42 HP / 12 attack / 9 defense are authoring starting values, not approved encounter balance. Keep its stable ID after release. Refresh the pack integrity manifest and run the existing `validate-pack` command; see `docs/PACKS.md` and `docs/MAP_FORMAT.md`.

The engine discovers optional combat/follower sheets by species ID, retaining portrait fallback. Gust spiral and Air material effects use existing rules/renderers. Spirit Starter and emotion/personality flavor are descriptive; no Spirit element, starter selection, ghost immunity, emotional AI, flight collision or evolution is installed. Current maps and eighteen-species progress are unchanged. For scenery-only placement use the portrait with an authored prop location/width; image placement alone does not create an encounter.

Run `python3 art/characters/export-parrocket.py --species wispurr --check` for exact source-to-editable/runtime pixels. Complete wisps/tails use shared nearest-neighbor scale, alpha threshold and four-pixel output gutters. The brief is `art/characters/source/wispurr/BRIEF.md`; exact prompts/generated adaptations and revisions are retained with reproducible settings. Original owner images were supplied inline and their binary files are unavailable locally. No original-reference license or owner taste approval is inferred.

The reviewed `poseOverrides` record in the export recipe replaces southwest travel phase index 28 with a separately generated front-left pose. Its source height matches the original extracted pose before the common sheet fit; surrounding poses and previous creature outputs stay unchanged. The retained derived input and exact prompt document this facing repair.
