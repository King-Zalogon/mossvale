# Issue 266 proof: Lantern Crossing follow-up

This package proves that the scene contracts delivered for the first Mossvale slice can be reused in a second, data-only adventure. Lantern Crossing has a different premise (Mira lighting a safe route), a different prop (the lantern chest), and a separate pack identity while reusing the shared movement, interaction, dialogue, objective, save and continuity systems.

## What is included

- `portable-writer-context/index.html`: offline writer browser with the selected, stable catalogue IDs and local previews for the crossing host, chest, tree and Fernling.
- `portable-writer-context/scene-examples/lantern-{one,two,three}.json`: a three-scene handoff chain for the second adventure. It carries the current player companion binding, resolves the lantern-route question, and closes the light-path promise without reintroducing the old bell thread.
- `portable-writer-context/manifest.json`: deterministic export manifest and source hashes.
- `portable-writer-context/catalogue.json`: the exact catalogue snapshot used by the handoff.

## Available contracts and limits

The package uses `mechanic:scene-dialogue`, `interactable:scene-event`, the existing meadow environment, and shared visual IDs. These are available and validated. The scene remains an authoring handoff: it does not add autonomous NPC movement, timed effects, new species behavior, or a new runtime scripting language. Map reachability and player enjoyment still require browser play; the fixture's browser regression covers its chest reward, completion state, reload, and adventure switching.

## Reproduce

```sh
npm run pack -- validate-pack tests/fixtures/packs/lantern-crossing
node --test tests/second-adventure.test.mjs tests/scene-continuity.test.mjs tests/adventures.test.mjs tests/packs.test.mjs
```

The existing browser checks exercise the independent pack and chooser flow:

```sh
node tests/pack-build.browser.mjs
node tests/adventures.browser.mjs
```