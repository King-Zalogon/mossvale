# #186 builder proof: The Fernling at Dusk

This folder preserves the independent writer handoff and records its builder pass. The original `writer-prompt-at-session.md`, `independent-writer-output.json`, `writer-gap-report.json` and `writer-session-note.md` are unedited. The original report records one configuration gap; the builder resolved it using existing static-landmark configuration and the scene-event dialogue capability. `gap-report.json` is the zero-gap report for the normalized builder-ready script. The portable writer package and its frozen catalogue are preserved under `portable-writer-context/`; its manifest hashes every file. The session schema is `writer-schema-at-session.json`. The original session note retains the exact local paths consulted; checked-in copies of those inputs are included here. The raw proposal SHA-256 at intake was `957601e806bfb06df2bb8539d96842ab500b8e54460395f954e74379e7297765`.

## Builder normalization

`builder-ready-scene.json` is a separate, validated artifact. The builder made these explicit changes:

- Replaced each dialogue `speaker: "Traveler"` with the declared participant ID `trail-traveler`, as format 1 requires.
- Removed `stationary-traveler-placement` from `requirements`. No capability was missing: `landmark:sign` configures a static landmark with a selected sprite, and `interactable:scene-event` can display dialogue actions whose `speaker` references that landmark ID. The authored map uses landmark ID `traveler`, kind `sign`, and sprite `person-traveler`; this avoids the ranger menu behavior.
- Kept `interactable:scene-event` in `uses`, because the catalogue lists it as available. An available capability selected for the scene is not a gap.
- Removed the writer's dependency on Fernling being the player's specific starter: new adventures choose the starter randomly. The dialogue now refers generically to the player's active companion, so all supported starters fit; no unplaced traveler-owned Fernling is implied.
- The writer proposed using the shipped Sunlit Trail map, but an independent pack cannot silently borrow Mossvale's private map file. The reproducible fixture instead uses its own small meadow map, the same map schema, shared sprite assets, dialogue action, chest behavior, save codec, and runtime. Its walkable geometry and fixed landmark placement are visible in the fixture itself.

`writer-gap-report.json` preserves the writer's single configuration request. It pointed to an already-available scene-event capability, so the builder treated it as a mapping clarification and recorded the resolution instead of implementing a workaround. `gap-report.json` records zero outstanding requests for the builder-ready script. Its validator warns that the new canonical fact should be established by a beat; the traveler establishes it in the second line about the footsteps. `continuity-handoff.json` preserves the traveler, companion, footsteps fact and unresolved thread. `independent-next-scene-output.json` preserves the next writer’s original proposal. `next-scene-proposal.json` is the validated builder copy aligned with the final handoff and current catalogue, using an existing Hearth Hamlet map. It has no gaps and is a proposal, not a second implemented scene.

The fixture pack lives at [`tests/fixtures/packs/the-fernling-at-dusk`](../../../../tests/fixtures/packs/the-fernling-at-dusk). Its data files are independent of the shipped Mossvale and other adventure packs. The focused browser test builds this pack alone, confirms the camp, speaker trigger and chest are reachable, manually advances the dialogue at a tile beside the traveler, opens the chest as a separate pack-completion step, and confirms the reward and ending persist once across reload. The chest does not gate the conversation; it is the candidate pack’s explicit ending condition.

## Reproduce

From the repository root:

```sh
node scripts/scene-script.mjs docs/scene-script-proofs/186-the-fernling-at-dusk/builder-ready-scene.json
node scripts/scene-script.mjs docs/scene-script-proofs/186-the-fernling-at-dusk/next-scene-proposal.json
node scripts/pack.mjs validate-pack tests/fixtures/packs/the-fernling-at-dusk
node tests/scene-proof.browser.mjs
```

For local play, build and serve the candidate pack:

```sh
BUILD_DIR=/tmp/mossvale-fernling-at-dusk node scripts/build.mjs --pack tests/fixtures/packs/the-fernling-at-dusk
python3 -m http.server 8080 --directory /tmp/mossvale-fernling-at-dusk
```

In Windows PowerShell:

```powershell
$env:BUILD_DIR = "$env:TEMP\mossvale-fernling-at-dusk"
node scripts/build.mjs --pack tests/fixtures/packs/the-fernling-at-dusk
python -m http.server 8080 --directory $env:BUILD_DIR
```

Open `http://localhost:8080/?adventure=the-fernling-at-dusk`. Walk north/east from camp to the traveler, press **E**, and advance the three lines. Then walk east to the chest and press **E**. The conversation is complete independently; the chest is a separate interaction and the pack’s explicit ending condition. Its existing once-only reward updates the shared coin, potion and orb counters; the fixture adds no item definitions or inventory mechanics. Reload to confirm the reward and completed state remain saved.

## Builder traceability

| Script element | Authored runtime mapping |
| --- | --- |
| `trail-traveler` / `visual:person-traveler` | `maps/start.json` landmark `traveler` (`kind: sign`, `sprite: person-traveler`, at `[6,3]`). The writer participant ID maps to runtime speaker ID `traveler`. |
| Three `dialogue` beats | `maps/start.json` trigger `hush-conversation`, at `[6,5]`, `on: interact`, with three dialogue actions. Each action names `speaker: traveler`; the trigger sits two tiles from the landmark so the direct sign interaction does not shadow it. |
| Player’s companion | The dialogue addresses the active party companion generically, so the random starting species does not affect the scene; the scene adds no creature actor. |
| `visual:tree-oak`, `visual:cottage-tiled` | `maps/start.json` scenery props use the existing shared sprites; they do not add behavior. |
| Optional chest beat | `maps/start.json` landmark `chest` at `[9,5]`, with once-only flag `start.chest` and its coin, potion and orb reward. This separate chest interaction is the pack’s ending condition. |

## Writer and schema clarification

The writer prompt should say explicitly that `beats[].speaker` must equal a declared `participants[].id`. A builder maps that narrative speaker to the map landmark ID used by runtime dialogue actions; those identifiers can differ. Use `requirements` only for genuinely unavailable art/mechanics or a configuration task that cannot be expressed with existing data. When configuring an available capability, put it in `uses` and record the concrete mapping separately. Do not attach an available `capabilityId` to a requirement just to describe that mapping. The scene-script schema already permits these IDs and configuration intents; the ambiguity was in the instruction and interpretation, so no schema shape or catalogue generation change was needed.

Owner playtest remains open: check whether the three lines match the intended scene, read comfortably, and feel natural to interact with. This proof does not claim owner approval.
