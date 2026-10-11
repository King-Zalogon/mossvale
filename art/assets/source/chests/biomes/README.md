# Biome chest family (#337)

Meadow retains the accepted oak/brass pair from #235. New reusable appearance IDs are `chest-reed-rope` (wetland), `chest-sandstone-iron` (badlands) and `chest-pine-frost` (snowy forest), each with a `-open-empty` counterpart. They identify materials, not stories or reward types.

## Generation and revision

Generated on 2026-10-11 with the image-generation tool, using the existing closed wooden chest and its #235 open-empty counterpart as the sole camera/style references. Original paired RGBA outputs are retained as `<material>.generated.png`. Provider model version, seed and masks were not exposed. Prompt contract: exactly two isolated matching chests, closed left and completely empty right; same base, front-right isometric view, northwest light, restrained pixel palette, bold details readable at 44px, generous transparent separation, no treasure, floor, shadows or text.

Material briefs: wetland woven reeds over swamp-wood frame with rope lashings and bronze lock; badlands red sandstone blocks with dark iron brackets and stepped/beveled stone lid; snow forest pale pine boards with blue-grey iron and patches of snow along outer edges. Silhouettes, panel construction and material groups differ rather than just colors. The first wetland output had a visible amber fringe in the preview; it is retained as `reed-rope-halo-rejected.generated.png`. A subsequent image edit requested removal of all surrounding glow/background while preserving the chest pixels. Its output is the current reed-rope reference; deterministic alpha normalization excludes low-opacity fringe in every variant.

## Export contract

Run `python3 art/assets/export-biome-chests.py`, then `python3 art/assets/export.py`. The first splits the retained paired sheet at its midpoint, thresholds alpha at 128, crops each silhouette, fits visible width to 337 using nearest-neighbor sampling, and adds three horizontal/two vertical padding pixels. The second copies registered editable source pixels exactly to runtime PNGs. `--check` verifies normalization and exact export freshness. Sources are editable RGBA PNGs; no palette quantization or unrelated atlas repacking occurs.

All canvases are 343px wide with bottom-center anchors. Heights (closed/open-empty): reed-rope 293/331; sandstone-iron 279/358; pine-frost 309/348. Frame order in each retained sheet is closed, open-empty. Each exported image is one static pose: no cadence or opening animation. The raised lid extends upward; both poses share the same world width and two-pixel bottom padding. Map landmark width, position, collision and durable flags remain unchanged. Variant appearance has no effect on rewards or saving.

## Review and authoring

Open `/chest-preview.html` through **Testing URLs** after `npm start`. It labels all four pairs at chest width 44px beside the 36px player and includes closed/open real-renderer captures of all seven shipped chest maps. Those captures live in `dist/reviews/chests/`; the comparison sheet is `art/assets/reviews/337/gameplay-scale.png`. The browser regression creates contexts through real claim actions, checks stable foot placement and opaque state, then reload/repeat reward behavior. Its optional `CHEST_REVIEW=1` mode regenerates captures intentionally.

Choose the closed appearance name in a chest landmark's existing `sprite` field. `dist/src/render/chest-art.js` resolves the matching empty pose for the world and reward result. Legacy/custom packs with another closed image retain the generic wooden empty fallback; no new map field or save migration is required. Other landmarks can use these static images without acquiring chest behavior. No owner taste approval is implied by automated checks.
