# Agent start here

Start each coding task by checking `git status -sb`, fetching `origin`, reading the target issue and its comments, then checking the live [open issue queue](https://github.com/King-Zalogon/mossvale/issues?q=is%3Aissue+is%3Aopen) and [unassigned issues](https://github.com/King-Zalogon/mossvale/issues?q=is%3Aissue+is%3Aopen+no%3Aassignee). Confirm there is no active claim or pull request before taking work. The [handoff log](AGENT_HANDOFFS.md) records local branches and evidence; GitHub remains the authority for issue and PR status.

## Shared APIs and decisions

- The project is browser-served ES modules under `dist/`, with no bundler. `dist/src/main.js` wires one controller and the services; see [architecture and module ownership](ARCHITECTURE.md).
- Reuse the canonical codecs and adapters: save schema and migration in `dist/src/save.js`, persistence in `dist/src/services/persistence.js`, seeded RNG in `dist/src/domain/rng.js`, asset loading in `dist/src/services/loader.js`, and adventure-map loading in `dist/src/services/maps.js`. The [API inventory](API_INVENTORY.md) is generated and checked by `npm run validate`.
- Keep domain rules pure and inject randomness, time, and storage at the existing boundaries. Do not add a second save codec, RNG, or loader.
- Stable content IDs and authored JSON formats are contracts. Use [save format](SAVE_FORMAT.md), [map format](MAP_FORMAT.md), [pack format](PACKS.md), [objectives](OBJECTIVES.md), and [story](STORY.md); evolve those contracts deliberately with validation and migration where needed.
- New gameplay flow belongs in `dist/src/controller.js`; rules belong in `dist/src/domain/`; UI and rendering should call the existing actions rather than mutate progression rules. Issue #97 is the planned shared action/event test contract; coordinate there before creating another test harness.

## Ownership and integration

Module lanes are summarized in [architecture](ARCHITECTURE.md#modules): core engineering owns save/config/controller/main, gameplay owns domain rules, world owns map/adventure behavior, content design owns registries and map data, client engineering owns services, and art/UI owns assets/rendering/presentation. Record a temporary claim and handoff in [AGENT_HANDOFFS.md](AGENT_HANDOFFS.md), including the exact branch and commit so overlapping edits are visible.

On the latest intended base, run `npm run verify`; run `npm run build` when the change affects shipped output. Resolve stacked work in dependency order and rerun checks on the final integrated head; see [content integration](CONTENT_INTEGRATION.md). To play locally, serve `dist/` as described in [README](../README.md#play-locally).
