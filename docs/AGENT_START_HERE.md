# Agent start here

Read the root [AGENTS.md](../AGENTS.md) and [authoring documentation contract](AUTHORING_CONTRACT.md). Their integration-only workflow supersedes historical main-targeting instructions.

Start each coding task by checking `git status -sb`, fetching `origin`, reading the target issue and its comments, then checking the live [open issue queue](https://github.com/King-Zalogon/mossvale/issues?q=is%3Aissue+is%3Aopen) and [unassigned issues](https://github.com/King-Zalogon/mossvale/issues?q=is%3Aissue+is%3Aopen+no%3Aassignee). Confirm there is no active claim or pull request before taking work. Claim the issue with a comment and record your branch, base and evidence in your own file under [`docs/handoffs/`](handoffs/README.md) (the old shared [log](AGENT_HANDOFFS.md) is a frozen archive). GitHub remains the authority for issue and PR status; the only state in which you wait for the owner is the `needs-owner` label.

## Shared APIs and decisions

- The project is browser-served ES modules under `dist/`, with no bundler. `dist/src/main.js` wires one controller and the services; see [architecture and module ownership](ARCHITECTURE.md).
- Reuse the canonical codecs and adapters: save schema and migration in `dist/src/save.js`, persistence in `dist/src/services/persistence.js`, seeded RNG in `dist/src/domain/rng.js`, asset loading in `dist/src/services/loader.js`, and adventure-map loading in `dist/src/services/maps.js`. The [API inventory](API_INVENTORY.md) is generated and checked by `npm run validate`.
- Keep domain rules pure and inject randomness, time, and storage at the existing boundaries. Do not add a second save codec, RNG, or loader.
- Stable content IDs and authored JSON formats are contracts. Use [save format](SAVE_FORMAT.md), [map format](MAP_FORMAT.md), [pack format](PACKS.md), [objectives](OBJECTIVES.md), and [story](STORY.md); evolve those contracts deliberately with validation and migration where needed.
- New gameplay flow belongs in `dist/src/controller.js`; rules belong in `dist/src/domain/`; UI and rendering should call the existing actions rather than mutate progression rules. The existing shared action/event regression contract is documented in API_INVENTORY and exercised by integration tests; reuse it instead of creating another test harness.

## Ownership and integration

Module lanes are summarized in [architecture](ARCHITECTURE.md#modules): core engineering owns save/config/controller/main, gameplay owns domain rules, world owns map/adventure behavior, content design owns registries and map data, client engineering owns services, and art/UI owns assets/rendering/presentation. Record a temporary claim and handoff in `docs/handoffs/<issue>-<name>.md`, including the exact branch and commit, and name in the claim comment which hotspot files you will touch (`dist/src/controller.js`, `dist/src/main.js`, `dist/src/data/assets.js`, `package.json` scripts) so overlapping edits are visible.

On the latest intended base, run `npm run gate` and commit its evidence record (GitHub Actions is disabled by owner decision; one-time Python setup: `npm run setup`). Run a subset while iterating with `npm test -- <name>` and `npm run test:browser -- <name>`. Resolve stacked work in dependency order and rerun checks on the final integrated head; see [content integration](CONTENT_INTEGRATION.md). To play locally, serve `dist/` as described in [README](../README.md#play-locally). Vercel deployment policy and the dashboard production-branch requirement are documented in [deployment](VERCEL_DEPLOYMENT.md).

## Local authoring catalogue

Read [CATALOGUE.md](CATALOGUE.md) and the generated [index](../content/catalogue/INDEX.md). Catalogue checks are part of validation; changed authorable resources need a scoped PR impact record. Use the documented local visual browser and portable export when a story writer needs to inspect resource art. Scene-script instructions and continuity handoffs are documented separately.
