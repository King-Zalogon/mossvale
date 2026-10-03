# Adventure packs

Issue [#50](https://github.com/King-Zalogon/mossvale/issues/50). An **adventure pack** is the content of one adventure on top of the shared systems (movement, battle, saves, menus). The first adventure, `mossvale`, is the only one shipped; the fixtures under `tests/fixtures/packs/` prove a second one needs data only.

## What is a pack

`dist/maps/index.json` is the pack manifest:

```jsonc
{
  "format": 1,
  "id": "mossvale", // saves record it; never changes
  "name": "Mossvale",
  "brief": "Three islands, eight friends and a seal at every shrine.",
  "maps": ["meadow", "amber-ridge", "frostveil-grove"], // the map files, dist/maps/<id>.json
  "species": ["fernling", "..."], // creatures this adventure may use
  "milestones": ["meadow.seal", "amber-ridge.seal", "frostveil-grove.seal"], // the order it is meant to be completed in
  "ending": "story", // the ending is the one in the story file
  "objectives": "objectives.json",
  "story": "story.json"
}
```

| Part of the issue | Where it lives |
| --- | --- |
| Maps | `maps` + `dist/maps/<id>.json` ([MAP_FORMAT.md](MAP_FORMAT.md)) |
| Species availability | `species`; zones and guardians may use only these, and each must be findable |
| Object and NPC roles | each landmark's `kind` (`ranger`, `cottage`, `sign`, `chest`, `shrine`), `name`, `tag`, `label`, `text`/`lines` |
| Brief text | `brief` (and `name`) |
| Milestone order | `milestones`; each must be earnable once the ones before it are done |
| Ending reference | `ending`, resolved in `story.json` ([STORY.md](STORY.md)) |

## Art is shared, roles are not

Maps refer to art by name through the asset manifest (`src/data/assets.js`, [ASSETS.md](ASSETS.md)). A name says what the picture shows, never its role, so the same cottage can be a healer's home in one pack and a bakery in another by changing the landmark's `kind`, `name` and text. Nothing is copied: no new artwork and no new rules code.

`tests/fixtures/packs/hearth` and `bakery` are the two reuse fixtures. Both use `cottage-tiled`, `person-red-cap-south` and `chest-wooden`; in `hearth` the cottage is a healer's ranger post and the villager a sign, in `bakery` the cottage is a shop sign and the villager the shopkeeper. `tests/packs.test.mjs` checks they compile against the one manifest with identical sprites and different roles.

## Flags and saves

Progress flags stay `<map-id>.seal` and `<map-id>.chest`, unique inside a pack. A save belongs to one pack:

- The pack id is stored as `pack` in the save. The first adventure (`mossvale`) leaves it out, so existing saves and the frozen fixtures stay byte-identical, and a save without `pack` is a `mossvale` save.
- A save from a different pack is **never loaded, overwritten or imported**. Loading reports the status `foreign` (like a newer-version save: untouched, not writable, plain explanation, nothing quarantined) and a backup file from another adventure is refused with the same reason.
- The pack id in `index.json` must equal the id the build was compiled for (`src/data/pack.js`), so a pack made for another adventure fails validation instead of being played against the wrong registries.

## Validation

`npm run validate` (and the game at startup) checks, in addition to the map rules: pack id, name and brief; every listed map exists and every loaded map is listed; species ids are known, zone pools and guardians use only listed species and every listed species can be found; milestone flags are well formed, unique and playable in the listed order; and the story ending exists when the pack points at it. Errors start with `pack` and name the field.

## Adding another adventure

1. Make a folder of maps, a pack `index.json`, objectives and a story (copy a fixture).
2. Give it its own unique pack id and its own regions and species registries when it needs different ones. Selecting between packs on the title screen is not built yet, so for now a build holds one pack.
3. Run the validator; reuse existing art by name before commissioning new art.
