# Authoring documentation contract

Issue #181; first-stage epic #180. The catalogue tells a writer what it can request and tells a builder where to configure it. It describes entities and capabilities without prescribing a class-based architecture.

## Authority and versioning

`content/catalogue/schema.json` is the format-1 structural contract (JSON Schema draft 7). `examples.json` contains six teaching fixtures, not a complete capability catalogue. #182 owns full extraction/population; #183 owns coverage, reference and changed-file CI enforcement; #184 owns local browsing/export; #185 owns scripts/handoffs.

Catalogue `format` is independent of engine, pack and save versions. `sourceRevision` is the full Git commit whose implementation was audited; it is not an automatically changing generation timestamp. Generated facts must be deterministic. Export provenance may separately describe its build revision. Check current implementation before publishing a catalogue from old fixtures.

IDs are namespaced catalogue references such as `visual:chest-wooden` or `actor:fernling`. Runtime IDs remain unchanged. Dependencies contain catalogue IDs; technical references and previews are repository-relative paths with no parent traversal, absolute paths or machine-specific addresses. Portable exports preserve safe relative paths; an online chat cannot access another person's localhost.

## Shared fiche requirements

Every entry has ID, kind, name, concise summary, status, scope, configuration, dependencies, limitations, examples, technical references, evidence and per-kind details. Configuration entries specify name, type, default (null means required/no default) and constraints. Empty configuration/dependency arrays are permitted when there are none; do not invent knobs. Limitations and examples must be meaningful and nonempty. Examples record intent, configuration instructions and observable expected behavior; source-linked examples are acceptable when precise structured configuration belongs to the existing format.

Statuses: **available** means implemented with evidence for the described use; **experimental** means implemented but limited/unsettled; **proposed** means not implemented; **deprecated** remains compatible but should not be chosen for new work; **removed** is a tombstone and cannot be selected. Missing requests belong in script gap reports, not invented available entries. Available/experimental entries require evidence. Removed/deprecated entries explain compatibility and a replacement when one exists; never reuse IDs. Scope distinguishes core, optional-pack and authoring-only support.

Summaries answer when to use something and what to expect. Details describe configurable behavior, constraints and composition. Technical references carry implementation/configuration internals; writers should not need source inspection for ordinary choices. Prefer one precise sentence per detail, with links for complexity. No fixed word quota; never omit edge cases to achieve brevity.

## Per-kind templates

Use one JSON object matching `schema.json`; copy the corresponding example and replace every value. Do not leave template placeholders in available entries.

| Kind | Required details | What to record |
| --- | --- | --- |
| visual | appearance, style, scale, directions, animations, compatibleUses | What is depicted; source/display dimensions; actual poses/frame states; valid uses. PNG artwork does not grant gameplay behavior. Optional previews have descriptive text. |
| interactable | activation, conditions, actions, rewards, repetition, persistence | Trigger and preconditions; sequence/reward types; once/repeat rules; durable flags, atomicity and failure behavior. |
| item | contexts, targets, consumption, strength, duration, stacking, persistence | Battle/exploration/both; player/creature; when consumption succeeds; intensity/caps; expiry unit and exact counting (including flee/loss); stacking/replacement; save/load. |
| actor | appearance, behavior, locomotion, interactions | Available sprite references; authored behavior and movement/collision limits; interactions and configurable properties. Do not infer gender/personality from filenames. |
| environment | biome, connections, walkability, spawns, access | Atmosphere/terrain; exits; collision/reachability; player/actor/encounter placement; progression gates. Map examples still require geometry validation. |
| mechanic | trigger, inputs, sequence, results, cancellation, errors, persistence | Start conditions; accepted inputs; ordering; outputs; interruption/retry/failure/rollback semantics; persisted state. |

Use explicit “not applicable because…” for inapplicable fields rather than omit required detail. Separate an immediate item from a duration effect only when they have independently reusable contracts. Do not pretend existing items support duration buffs. A three-battle effect would need explicit counting/stacking/save semantics before becoming available; home-rest choreography and moving-NPC dialogue likewise need verified runtime support.

## Update procedure and ownership

1. Identify canonical registration, supported behavior and affected fiches before implementation. For a new kind, evolve the contract and fixtures first.
2. Update generated facts from the owning registry; never manually repair generated output. Curated descriptions live beside those facts or in linked fiches, with a documented merge procedure (#182).
3. Update examples, evidence and limitations for any semantic change. Add compatible migrations/version changes where the gameplay format requires them; changing this catalogue alone does not migrate saves.
4. For removal/deprecation preserve identity and explain affected scripts/replacements. Check cross-references and export paths.
5. Run contract fixtures (`node --test tests/catalogue-contract.test.mjs`) and repository verification. Review descriptions against implementation: structural tests cannot certify their truth.
6. In the PR list affected entries, generation commands, checks and local observations. If documentation is unchanged, give a scoped no-semantic-impact explanation; a random Markdown edit is not compliance.

During bootstrap there is no full catalogue or diff gate yet. Document behavior in the owning technical doc and relevant teaching examples, state the catalogue follow-up, and do not assert #182/#183 are complete. Once their gates land, those checks apply to every resource update. No blanket exemptions or bypass switches.

## Reviewed examples and reuse boundaries

The six fixtures demonstrate an existing chest image, scene interaction, battle potion, Fernling species, meadow environment and scene dialogue. They intentionally distinguish image from behavior, optional pack configuration from default gameplay, and battle healing from inventory effect metadata.

The current brief compiler generates candidate scaffolds; requested landmark/species-role prose remains review notes until authored into map/registry data. Existing scene actions are dialogue/reward/flag/challenge with constrained reward fields. Check [authoring tools](AUTHORING_TOOLS.md), [packs](PACKS.md), [map format](MAP_FORMAT.md), [assets](ASSETS.md), [battle](BATTLE.md) and [save format](SAVE_FORMAT.md) before extending them. No online catalogue, additional artwork or autonomous actor engine is required to adopt this contract.
