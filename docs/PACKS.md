# Adventure packs

Issue [#50](https://github.com/King-Zalogon/mossvale/issues/50). An **adventure pack** is the content of one adventure on top of the shared systems (movement, battle, saves, menus). The first adventure, `mossvale`, is the only one shipped; the fixtures under `tests/fixtures/packs/` prove a second one needs data only.

## What is a pack

`dist/maps/index.json` is the pack manifest. It selects the pack-owned rules in `registries.json` and the maps loaded by this build:

```jsonc
{
  "format": 1,
  "id": "mossvale", // saves record it; never changes
  "contentVersion": 1, // raise for reviewed data changes; keep IDs stable across versions
  "requires": { "engineVersion": 1, "saveSchema": 4 },
  "name": "Mossvale",
  "brief": "Three islands, eight friends and a seal at every shrine.",
  "maps": ["meadow", "amber-ridge", "frostveil-grove"], // the map files, dist/maps/<id>.json
  "species": ["fernling", "..."], // creatures this adventure may use
  "registries": "registries.json", // species/region definitions and game tuning
  "mapDirectory": "maps/", // optional relative directory for map JSON files
  "milestones": ["meadow.seal", "amber-ridge.seal", "frostveil-grove.seal"], // the order it is meant to be completed in
  "ending": "story", // the ending is the one in the story file
  "objectives": "objectives.json",
  "story": "story.json",
  "integrity": [
    { "id": "registry:main", "path": "registries.json", "sha256": "…64 lowercase hex characters…" },
    { "id": "map:meadow", "path": "meadow.json", "sha256": "…64 lowercase hex characters…" }
  ],
  "prefabs": { "waystation": { "footprint": {"w": 5, "h": 4}, "slots": [] } } // optional; see PREFABS.md
}
```

| Part of the issue | Where it lives |
| --- | --- |
| Maps | `maps` + `dist/maps/<id>.json` ([MAP_FORMAT.md](MAP_FORMAT.md)); optional reusable `prefabs` and `instances` ([PREFABS.md](PREFABS.md)) |
| Species availability | `species`; zones and guardians may use only these, and each must be findable |
| Species, type, region, move, economy, tactic and growth rules | `registries`; versioned pack data references art by shared asset ID |
| Object and NPC roles | each landmark's `kind` (`ranger`, `cottage`, `sign`, `chest`, `shrine`), `name`, `tag`, `label`, `text`/`lines` |
| Brief text | `brief` (and `name`) |
| Milestone order | `milestones`; each must be earnable once the ones before it are done |
| Ending reference | `ending`, resolved in `story.json` ([STORY.md](STORY.md)) |

## Art is shared, roles are not

Maps refer to art by name through the asset manifest (`src/data/assets.js`, [ASSETS.md](ASSETS.md)). A name says what the picture shows, never its role, so the same cottage can be a healer's home in one pack and a bakery in another by changing the landmark's `kind`, `name` and text. Nothing is copied: no new artwork and no new rules code.

`tests/fixtures/packs/hearth` and `bakery` are the two reuse fixtures. Both use `cottage-tiled`, `person-red-cap-south` and `chest-wooden`; in `hearth` the cottage is a healer's ranger post and the villager a sign, in `bakery` the cottage is a shop sign and the villager the shopkeeper. `tests/packs.test.mjs` checks they compile against the one manifest with identical sprites and different roles.

Their separate `registries.json` files also exercise different creature lists, regions, progression, shops and move power through the same mutable data bindings used by the engine. Species and region string IDs are written to saves; array order is only an in-memory lookup and cannot change a saved identity. Registry `sprite` and `preview` values name shared manifest entries, so a pack does not copy images.

## Flags and saves

Progress flags stay `<map-id>.seal` and `<map-id>.chest`, unique inside a pack. A save belongs to one pack:

- The pack id is stored as `pack` in the save. The first adventure (`mossvale`) leaves it out, so existing saves and the frozen fixtures stay byte-identical, and a save without `pack` is a `mossvale` save.
- A save from a different pack is **never loaded, overwritten or imported**. Loading reports the status `foreign` (like a newer-version save: untouched, not writable, plain explanation, nothing quarantined) and a backup file from another adventure is refused with the same reason.
- The pack id in `index.json` must equal the id the build was compiled for (`src/data/pack.js`), so a pack made for another adventure fails validation instead of being played against the wrong registries.

## Pack integrity and save compatibility

The `integrity` list has exactly one entry for each selected registry, map, objective file and story file. Its canonical IDs (`registry:main`, `map:<map-id>`, `objectives:main`, and `story:main`) stay stable if a file is moved; `path` is the pack-relative filename and `sha256` hashes its exact bytes. The browser checks the engine and save schema requirements, then verifies every file before it reads or updates a save. A missing file, mixed build, hash mismatch, or unsupported requirement leaves saves alone and shows a retryable startup error. These hashes catch accidental mixing or corruption; they are not signatures and do not establish who published a pack.

`contentVersion` starts at 1 and is increased by the pack maintainer when changing data. Compatible updates keep stable map, region, and species IDs, so added or revised data can load the existing save and its checkpoint. If an update removes or renames an ID already used by a save, the game stops writes, leaves both copies untouched, and offers an unmodified save export. Restore the matching complete earlier build to keep playing; never reuse a retired ID for different meaning. Engine or save-schema requirements must match this game exactly. A future schema change needs an explicit save migration before the new engine ships.

## Validation and authoring commands

`npm run validate` checks the checked-in Mossvale pack, including its byte hashes and compatibility requirements. The same checks run when the game loads a pack: registry version/fields, shared asset references, pack ID/name/brief, map links, species availability, encounter/guardian references, milestones and story ending.

For a separate content folder, use the local authoring CLI:

```sh
npm run pack -- create-pack ./content/bright-hollow --id bright-hollow --name "Bright Hollow"
npm run pack -- add-map ./content/bright-hollow willow-crossing
npm run pack -- validate-pack ./content/bright-hollow
npm run pack -- preview-pack ./content/bright-hollow start
npm run pack -- refresh-manifest ./content/bright-hollow
```

`create-pack` refuses to replace an existing scaffold unless `--force` is supplied for the same pack ID. It creates a small playable map and starter species/region/rule tables. `add-map` clones the first map, adds a returnable exit, and updates the region table. Review the generated map and tune registries before building a game. Invalid IDs and missing references are reported with pack file/field context on Windows and Linux.

## Adding another adventure

1. Run `create-pack`, then use `add-map` or edit the generated map files. A pack folder contains `index.json`, `registries.json`, optional objective/story files and maps.
2. Give it a unique pack id. Changing registered species IDs remains safe for persisted identities as long as an existing ID is not renamed or reused.
3. Run `validate-pack` and `preview-pack`; reuse existing art by name before commissioning new art.
4. Build the selected pack as a standalone static-browser artifact. The command validates the source folder, copies only its manifest, registries, maps, objectives and story over `maps/`, and keeps the shared engine and asset set:

   ```sh
   npm run build -- --pack ./content/bright-hollow
   ```

   Set `BUILD_DIR` to choose an output folder. The artifact's `version.json` records engine version, pack ID/content version, save schema and source commit. The build stamps canonical file IDs and byte hashes into `maps/index.json`; at runtime all selected files must match before the save codec opens. After editing pack files, run `refresh-manifest`, review the generated changes, then run `validate-pack`. Referenced assets are checked against the manifest and all checked-in image files are validated before output is replaced. Keep the previous complete build folder as the rollback copy; restore it as a unit so the engine and its map data stay paired. Saves remain isolated by pack ID. A title-screen multi-pack chooser is tracked separately by #67.
