# Third-party assets

Third-party art is tracked separately from Mossvale's own artwork and any future code license. A source package is eligible for the public repository only when its recorded license permits redistribution and adaptation. Discovery posts (including Reddit) are leads, not license evidence; the original asset page and license control.

## Reactorcore: Nature Props Surface Forest

- [OpenGameArt source page](https://opengameart.org/content/nature-props-surface-forest), by Reactorcore (RC Art).
- [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/); the source page identifies this pack as CC0.
- Personal game use, modification, adaptation, redistribution in this public repository and commercial use are permitted by CC0. Attribution is not required; an optional credit is recorded in `art/assets/third-party/registry.json`.
- CC0 does not grant unrelated trademark, patent, privacy or publicity rights, and supplies the work without warranty. The art is imagery only: it does not provide collision, interactions, loot, items, or mechanics. The source page does not disclose AI use, so no claim is made about that.
- The downloaded source archive is retained at `art/assets/third-party/reactorcore-nature-surface.zip`. The registry records the source URL, retrieved date, archive digest, every imported file, source dimensions and hashes, intended use, limits and license evidence. The editable pixel-preserving atlas is `art/assets/third-party/reactorcore-nature-surface-atlas.png`.
- Four props are currently placed in the Sunlit Trail map: `tree-oak-round`, `tree-fir-slim`, `bush-woodland-low` and `plant-fern-frond`. The pack also contributes optional tree, plant, rock and fruit images to the local visual catalogue. Fruit pictures are not usable inventory items until separately defined by game data and behavior.

## Re-import and review

Run `npm run art:check` to verify the archive and source hashes, exact source-to-atlas/runtime pixels, export metadata and asset manifest. `npm run catalogue:write` updates the portable writer catalogue from the registry; review its output before committing. `npm run catalogue:browse` opens the local visual browser. Select an asset fiche to see the source/license note and preview; `npm run catalogue:export` includes the selected images for another model.

If `art/assets/export.py --pack --force` rebuilds source atlases, re-run `python art/assets/import-third-party-assets.py --write` to restore this package's separate editable atlas and provenance records. Never edit the downloaded source archive or the imported runtime crops to remove attribution or alter their recorded hashes; adaptations should be added as new, clearly identified files with their own provenance.
