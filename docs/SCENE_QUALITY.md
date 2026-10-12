# Playable-scene quality gate (#244)

Script/pack validity and successful save tests establish technical behavior, not good composition or a meaningful scene. AI-written and hand-authored slices need a brief, real-control rendered evidence, visual/content review and an explicit owner-taste status before their proof is complete.

## Brief and compatibility

Format 1 accepts an optional `sceneBrief` so existing scripts and packs remain valid. Missing briefs emit incomplete-quality warnings; `--require-quality` rejects them. A present malformed brief is a schema error. New submissions require `playerPurpose`, `consequence` (kind/description/supporting beatIds), `tone`, `setup`, `action`, `payoff`, `requiredResources` and `continuityState`, alongside the existing canonical continuity blocks.

Consequence kinds are clue, choice, access, relationship, encounter, reward or deliberate atmosphere. Link consequences to actual beats and resources to selected uses/participants/setting; required gaps prevent readiness. A mystery needs a reason to attend to it or an explicitly reviewed atmospheric role. Never attach an unrelated chest to satisfy a reward test. Validation cannot judge whether prose establishes a worthwhile consequence: content review must do that.

```sh
node scripts/scene-script.mjs content/scene-scripts/examples/quality-yard.json --require-quality
node scripts/scene-script.mjs content/scene-scripts/examples/incomplete-scene.json --require-quality
```

The first specifies a supported brief; the second intentionally fails for missing payoff. Legacy scripts stay valid authoring intents, but must add a brief/proof before quality acceptance. No runtime pack field, save migration or archived #186 artifact is changed. Portable exports now include the current scene schema and requirements; refresh old writer exports for new work.

## Run and review

```sh
npm run test:scene-quality
SCENE_REVIEW=1 node tests/scene-quality.browser.mjs
# PowerShell: set $env:SCENE_REVIEW='1', then run the node command.
```

The isolated `scene-quality-yard` pack demonstrates an explicitly offered supply reward with a clear player role. It reuses canonical packs, scene actions, controls and save codecs. The test reads debug state for steering/assertions but never teleports, mutates progress or invokes debug gameplay actions. It walks with real keys, advances dialogue with keyboard/touch, claims supplies, reloads and repeats the interaction.

Desktop 1280×820 and phone 390×844 captures record actual canvas drawImage bounds, including transforms and authored frame sizes. Speaker, player, companion and chest must remain inside the canvas and clear the panel. Text fragments must clear the advance button; text/button bounds must remain inside the panel. The objective is checked in the live sidebar, intentionally scrollable on phones while the in-map pin pauses during speech. Full-page screenshots preserve objective access. Deliberately composed scenery and actors need not have disjoint rectangles: the gate checks UI occlusion and requires visual inspection of actual sprite composition.

Review screenshots after every refresh. `docs/scene-quality/244/` preserves the teaching review. Hashes bind scene/schema/pack/renderer/UI/important sprites and the screenshots with their viewport, phase, zoom and layout observations. Refreshing evidence invalidates its prior review; ordinary tests use temporary captures and never silently renew approval.

```sh
node scripts/scene-quality.mjs content/scene-scripts/examples/quality-yard.json docs/scene-quality/244/evidence.json docs/scene-quality/244/review.json /tmp/new-scene-quality-report.json
```

The output must be new. The report distinguishes schema/data, playable behavior, visual composition and narrative purpose, with `readyForOwnerPlaytest`, `ownerTaste` and `sceneApproved`. Missing/stale captures, unreviewed writing or overlapping layout cannot become ready. Non-ready reports exit unsuccessfully while preserving findings. A passing builder proof with deferred owner taste is ready for testing, **not owner-approved**. This is a review workflow, not a signature or a guarantee that a self-authored review is truthful.

## Builder handoff and fixture

Report scene-to-runtime mappings, tested viewports/zoom, real inputs, source hashes and capture paths. Separate functional checks from actual visual and narrative review; list capability gaps, compatibility changes, continuity and owner decisions still pending. Geometry cannot approve art or enjoyment.

Wren maps to `traveler`, the player's reply to speaker `player`, conversation to `hush-conversation`, and supplies to `start.chest`. The chest sits above the reading area at `[9,4]`; the player approaches `[8,4]` rather than standing inside its sprite. Initial phone checks caught companion/chest overlap, and visual review then caught text beneath the advance button. Short purposeful lines, reachable placement and text-fragment assertions corrected the fixture. No #236 UI runtime was duplicated.

Archived #186 evidence remains historical functional proof. Its unrelated chest/ending and unresolved mystery still need content acceptance under #237/#186; this gate does not invent payoff or close those issues. A current brief, real controls, current captures and independent visual/content review are necessary to reuse the gate. Owner taste for the new teaching fixture is deferred; no production/adventure-readiness claim is made.

## Basis and limits

Xbox Accessibility Guideline 104 recommends subtitle placement clear of important gameplay elements: https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/104 . Tuxemon distinguishes map-event conditions from actions: https://wiki.tuxemon.org/Map_Editor_Events . Mossvale likewise separates intent, behavior and acceptance evidence.

The gate covers representative viewports and each capture's recorded zoom, not every browser/device/zoom combination. Add cases for a scene's supported composition. Automated geometry cannot certify artistic taste, writing quality or enjoyment.
