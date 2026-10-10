# Creature combat sheet generation brief

Use the species' canonical portrait and identity record in `art/assets/subjects.json`. This is a brief for **future** batches; retained historical prompt summaries stay unchanged.

> Create one transparent RGBA sprite sheet with exactly four columns and five rows. Rows: idle, attack, hit, faint, capture. Four distinct poses per row. Keep the same creature anatomy, palette, markings, tail and body size as the canonical reference. Every pose, including its ears, limbs, tail, shadows and detached effects, must fit inside the middle 70% of its own cell. Leave at least 15% of the cell width blank on both sides and 15% of the cell height blank above and below. No pose or particle may cross a cell boundary. Keep cell centers and ground lines consistent. Do not paint labels, dividers or a background. Keep attack effects inside the reserved content area. When a pose cannot fit, supply it as a separate transparent image rather than packing it against its neighbors.

Before accepting a new batch, place its candidate source outside runtime paths, inspect every pose at 115 px gameplay width, and run the strict source preflight on an isolated repository candidate:

```sh
python3 art/characters/export-creature-combat.py --root /tmp/creature-candidate --species emberkin --strict-source-grid --check --preview-dir /tmp/creature-review
```

A candidate root needs the export profile and its proposed source. Missing or different runtime output makes `--check` fail after source preflight, while leaving outputs untouched; inspect the preview before exporting. `--strict-source-grid` rejects a populated edge, a missing pose or insufficient spacing. Re-author sources that fail. Do not approve a batch by shaving off border pixels or deleting small effects.

Legacy sources have reviewed nonuniform row boundaries in the export profile. The segmentation cores identify pose ownership only; export restores original alpha pixels, thin anatomy, holes and disconnected effects. Emberkin's touching third/fourth attack poses have an explicit reviewed boundary at x=860 in the legacy source. These recovery settings do not waive the blank-gutter requirement for new batches.
