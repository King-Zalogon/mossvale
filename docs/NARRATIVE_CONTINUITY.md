# Durable narrative and actor-role handoffs (#258)

Scene intent is authoring data, not another story runtime or save codec. Preserve the full canonical history rather than only the last recap. This extends the fields already merged in PR #302 and complements #244's independent playable/visual quality gate.

## Compact ledger

Carry established `canonicalFacts`, flags, items, characters and the existing prose decisions/threads. Durable `obligations` keep stable IDs, kind and original `sourceSceneId`; active/advanced questions and promises become resolved/superseded with an explanation, and remain in later handoffs. Never reopen a resolved ID. A genuinely new question needs a new ID and cause.

`decisionRecords` add stable choice IDs, original source scene, explicit choice, status and resolution. A later writer may resolve/supersede the choice but cannot overwrite its historical value or source; a changed choice is a new record. `relationships` preserve identity endpoints and source while describing changing state. `dramaticDirection` states where the next scene should go. `intentionalUnknowns` keep deliberately withheld knowledge; removing one requires an explicit resolution record in strict mode. These records do not invent engine variables or world consequences (#265 owns that behavior).

`actorRoles` keep stable role IDs, identity, owner, selected resource and required/optional traits. Participant `binding.roleId` must match the outgoing role snapshot. Player identity is `player`; a player's active companion uses `companion-*`. An NPC-owned familiar has owner `npc` plus `ownerIdentityId` identifying its NPC. Unknown, self/cyclic ownership, unsuitable player/companion/familiar images, absent optional fallback and duplicate/contradictory required traits are errors. Required traits must agree between participant and durable role; optional appearance is not ownership or a fixed species promise. Arbitrary prose trait truth still needs semantic review.

## Explicit consequences and substitutions

`continuityChanges` records kind, stable ID, action, consequence and supporting beat IDs. Each new durable scene must introduce, advance, complicate or resolve at least one obligation. Changed structured state needs a matching record; claiming a consequence without changing state is rejected. Every named beat must exist. Resolutions must agree with the outgoing status.

Changing a role occupant, ownership, resource or traits requires `rebind`, actual `dialogueBeatIds` and staging instructions, as well as matching participants and continuity. Replacing an NPC familiar with the player's companion is a deliberate authoring change: update pronouns/dialogue, remove the NPC-creature staging assumption and preserve player ownership. A fallback image is an authoring fallback, never permission to change a live selected party or fabricate a gameplay capability.

## Validate across scenes

```sh
node scripts/scene-script.mjs content/scene-scripts/examples/continuity/bell-one.json --require-continuity
node scripts/scene-script.mjs content/scene-scripts/examples/continuity/bell-two.json --require-continuity --previous content/scene-scripts/examples/continuity/bell-one.json
node scripts/scene-script.mjs content/scene-scripts/examples/continuity/bell-three.json --require-continuity --previous content/scene-scripts/examples/continuity/bell-two.json
node --test tests/scene-continuity.test.mjs
```

The new `continuityIn` must match the complete previous `continuityOut`; keyed record order is immaterial. `previousScene.id` and catalogue revision must match too. A recap, omitted resolved record or rewritten incoming state cannot satisfy this link. For an entire sequence use exported `validateSceneSequence`; duplicate scene IDs are rejected. Standalone validation cannot know history the caller never supplies, so builders must use the previous handoff or complete sequence, not only validate each file independently.

The inspectable bell examples introduce a promise/question/choice in scene one, resolve the question and choice in scene two, then fulfill the original promise in scene three. The closed question and choice are still present in scene three. These are narrative intents demonstrating the handoff contract, not claims that another adventure/map was implemented. Portable writer exports include all three JSONs, the current schema, instructions and file hashes.

## Orchard branch continuity (#265)

The playable orchard currently stores its two decisions as stable map-scoped events: `orchard-ruins/outcome-water-first` and `orchard-ruins/outcome-family-first`. The family-first route also stores `orchard-ruins/orchard-family` when the retryable rescue objective completes. These event records survive save normalization and backup import; they are mutually exclusive and do not introduce a morality score or another save field.

The [orchard continuity handoff](scene-script-proofs/265-orchard-consequences/continuity-handoff.json) translates those committed event keys into concise writer facts, records which promise remains open, and gives the corresponding Mara, object-prompt and Rowan callback state. It is validated against shipped map data by `tests/scenes.test.mjs`. Interpretation limit: the current map communicates persistent environmental state through conditional object prompts and dialogue; its terrain and family sprites do not change.

## Compatibility and migration

Optional additive format-1 fields preserve existing scripts and packs. Legacy handoffs stay valid with warnings; no automatic narrative IDs or invented history are inferred from old string decisions. `--require-continuity` requires explicit obligation/relationship/unknown/role/decision arrays and outgoing dramatic direction. Migrate by preserving existing canonical records, assigning reviewed stable decision/role IDs, documenting real beat consequences, and taking the next incoming block from the prior complete outgoing block. Correct explicit contradictions even in legacy mode. No runtime map/save migration or parallel execution is introduced.

## Fernling correction and review boundaries

[Corrected handoff v2](scene-script-proofs/186-the-fernling-at-dusk/corrected-handoff-v2.json) explicitly replaces the old planned NPC-familiar role with the player's active companion, without spawning an NPC familiar or altering a party. Dialogue addresses “your companion”; staging uses the existing player follower, continuity records the rebinding, and source-scene provenance is versioned. The old familiar is retained as a discarded authoring assumption, not claimed as a creature that actually existed in a save. Original writer output, original builder handoff and subsequent archived proposals remain unchanged.

The test exercises Fernling, Emberkin and Brooklet catalogue selections; required player ownership survives while optional Fernling appearance is not forced. This is authoring binding validation, not a claim of three new runtime playthroughs. The existing #186 runtime dialogue already addresses the player's companion generically; #237/#186 still own its story payoff and player acceptance. Role consistency does not approve the unresolved mystery.

Machine checks compare explicit identities/state/provenance and declared changes. They cannot determine whether dialogue really dramatizes a promise, whether a prose fact is true, or whether a substitution feels natural. Writers must advance an obligation with a meaningful consequence and keep unsupported capabilities in requirements. Builders must review semantic mapping, then use #244's real-control/rendered evidence workflow; canonical consistency alone never completes a scene proof.
