# Scene scripts and continuity handoffs

Scene scripts are versioned story/authoring intents, not game data or executable scripts. `format: 1` is defined by [schema.json](schema.json). The catalogue remains authoritative for what exists; a scene can request an unimplemented mechanic or art, but that request stays a gap until a separate implementation updates the catalogue. The script does not create map geometry or move actors at runtime.

The examples demonstrate two honest statuses:

- [supported-yard-conversation.json](examples/supported-yard-conversation.json) uses existing map, visual, dialogue, interaction and chest contracts. A builder still has to author the actual map and prove reachability/reward persistence.
- [home-rest-extension-request.json](examples/home-rest-extension-request.json) requests a home sleep action, sleep/wake art and a persistent multi-battle benefit. It is intentionally **not playable** with the current catalogue/runtime.

## Validate a handoff

From the repository root:

```sh
node scripts/scene-script.mjs content/scene-scripts/examples/supported-yard-conversation.json
node scripts/scene-script.mjs content/scene-scripts/examples/home-rest-extension-request.json --report /tmp/home-rest-gaps.json
```

The validator checks the JSON shape, source catalogue revision, selected stable IDs and kinds, scene-level participant speaker references, requirement dependencies, persistent state continuity and timed-dialogue hints. Runtime map dialogue actions use map landmark IDs, so the builder records the explicit participant-to-landmark mapping. It emits a gap report even when a script is structurally valid. For a portable context export, pass its full catalogue JSON with `--catalogue <path>`; it must use the same `sourceRevision` recorded in the scene. Do not treat a clean report as proof that geometry, dialogue pacing, game behavior or player experience is correct.

## Copy-ready prompt: scene writer

> You are proposing one short, playable scene for Mossvale. Use only the supplied capability index first. Request a full fiche by its stable ID when you need its exact limits; do not assume a name or image implies behavior. Record the supplied catalogue `sourceRevision` exactly. Return one JSON object matching `content/scene-scripts/schema.json` format 1. Keep story prose readable and separate from implementation instructions. Refer to actors, visuals, items, maps and mechanics by catalogue ID. Specify dialogue speaker/text/manual-or-timed advance, player actions, observable outcomes, placement intentions/constraints and completion. Every dialogue `speaker` must exactly match one declared `participants[].id`; these are scene-level IDs, and a builder maps each one to the actual map landmark ID used by runtime dialogue actions. Use `requirements` only for genuinely unavailable art/mechanics or configuration work that cannot be expressed with existing data, with kind, needed beat, priority and dependencies. Put available capabilities used by the scene in `uses`; do not repeat an available capability as a requirement merely to explain its configuration or mapping. Never silently substitute a different capability or label a proposal available. Include `continuityIn` and `continuityOut`: stable character identity/location, persistent flags, acquired/consumed/held items, canonical facts, unresolved decisions and pending threads. Preserve every incoming canonical fact or explicitly resolve/supersede it with a reason. Prefer a small scene using existing systems. Do not invent exact coordinates, runtime support, art poses, rewards, mechanics or save behavior. Do not output code or arbitrary script instructions.

## Copy-ready prompt: scene builder

> Build the supplied scene intent as an independent adventure candidate using Mossvale's existing validated pack/map formats and authoring CLI. First validate the script against the exact catalogue revision. Treat `uses` as selected existing capabilities and `requirements` as work not currently present. For supported items, choose valid exact map geometry, use existing data contracts, refresh pack integrity and run the map/pack validators. Do not add a parallel story runtime or execute script code. Do not implement requirements as one-off hidden behavior. Report each mapping from script beat/resource to authored map/pack field, exact placement decisions, and any gap that blocks completion. Test reachable placements, collision and exits in-game; validators cannot prove walkable topology, readable speaker placement, timing feel, reward transaction behavior or save/reload. Keep the candidate isolated from shipped adventures. Return changed-file list, validator/test evidence, unresolved gaps, and a compact `continuityOut` handoff preserving stable facts and unresolved threads.

## Continuity and gap report rules

`continuityIn` is the prior canonical state; `previousScene.summary` is only a brief recap. The recap never replaces canonical facts. `continuityOut` carries forward incoming fact IDs and flags; a fact marked resolved/superseded must explain why, and every flag state change must be visible in a beat. Item entries identify their catalogue item and count/state. Decisions and pending threads are compact lists for the next writer. Keep full prose out of the continuity block.

The generated gap report is an inventory of requested work, grouped by `configuration`, `new-art` and `new-mechanic`. Its dependency IDs link requirements within this scene. It is not an issue creator or a catalogue update. A maintainer decides whether a requirement is viable and files/implements it separately; only after implementation and review may a capability become available in the catalogue.

## Guarantees and review boundary

Machine validation checks structure, known/still-selectable resource references, resource kinds, source revision, participant/speaker references, explicit unsupported requirements, requirement dependency links, and continuity omissions/transitions. Builders and reviewers must still check whether prose matches the selected fiche and implementation. Map reachability, exact collision, interaction range, sprite fit, NPC pathing, dialogue timing, save compatibility, rewards exactly once and whether the scene is enjoyable require owning runtime tests and/or play.
