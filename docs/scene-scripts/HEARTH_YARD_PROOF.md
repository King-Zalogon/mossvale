# Hearth Yard scene proof

This fixture demonstrates the catalogue-to-script-to-playable-scene handoff with existing capabilities only.

## Artifacts

- Writer intent: `content/scene-scripts/examples/hearth-yard-proof.json`
- Builder fixture: `tests/fixtures/packs/hearth/`
- Continuity handoff and next-scene proposal: `content/scene-scripts/handoffs/hearth-yard-proof.json`

The script selects the existing Hearth Hamlet map, Healer Wren, the villager, the chest interaction and shared chest art. The fixture maps those beats to the authored ranger, dialogue, chest and one-time milestone fields. It does not add a story runtime or new artwork.

## Reproduce locally

```sh
node scripts/scene-script.mjs content/scene-scripts/examples/hearth-yard-proof.json
node scripts/pack.mjs validate-pack tests/fixtures/packs/hearth
node --test tests/scene-script-proof.test.mjs tests/packs.test.mjs
```

The test checks the validated pack, reachable spawn/chest placement, the two dialogue speakers, and the once-only chest milestone. Runtime save/reload semantics are exercised by the shared pack and save tests; owner review is still needed for script fidelity and readability.
