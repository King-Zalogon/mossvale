# Wooden chest state pair (#235)

`open-empty.generated.png` is the retained original image-generation edit of `dist/assets/props/chest-wooden.png`. `open-empty.png` is the editable normalized RGBA source; the existing atlas exporter copies its pixels exactly to `dist/assets/props/chest-wooden-open-empty.png`.

Generation used the image-generation tool on 2026-10-11 with the closed wooden chest as its sole reference. Provider model version, seed and edit mask were not exposed. Prompt summary: edit the exact chest into an open and completely empty state; preserve the base, brass corners/keyhole, brown-and-gold palette, northwest lighting, camera and ground anchor; hinge the rounded lid backward, expose dark empty wood, no treasure/glow/text/shadow, transparent background and crisp pixel style.

Reproduce normalization with `python3 art/assets/export-chest-state.py`, then export the registered source with `python3 art/assets/export.py`. Normalization crops alpha >=32, fits the visible width to 337 pixels with nearest-neighbor sampling and preserves RGB colors. The 343×330 canvas has three horizontal and two vertical padding pixels. The closed state is 343×319: the open lid extends upward while both use the same bottom-center ground anchor and world width. This is one static pose, no opening animation or cadence.

The manifest IDs are `chest-wooden` (unclaimed) and `chest-wooden-open-empty` (claimed). State comes from the landmark's existing durable flag, including independent side-map caches; images never control rewards or persistence. Review screenshots at normal gameplay zoom are in `art/assets/reviews/235/`. Biome materials/variants remain #337 work.
