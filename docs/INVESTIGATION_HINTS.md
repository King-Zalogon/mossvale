# Optional investigation leads

Issue #261. Map `hints` are authored help, not automatic rumours, timers, generated dialogue or a new quest engine. Open **Field journal** on the current investigation map and choose **Ask for a lead**. Ask again for a clearer observation. Heard text remains in the journal after reload; it is labeled **Relevant here**, **Heard earlier** or **Resolved**. No lead is shown before its prerequisites or after its task is resolved.

## Pack contract

```json
{
  "id": "old-water",
  "when": {"event": "orchard-ruins/mara-water-loss"},
  "resolved": {"any": [{"event": "orchard-ruins/sluice-old-mark"}, {"event": "orchard-ruins/press-repair-record"}]},
  "disclosure": "observation",
  "levels": ["Compare old and fresh marks.", "Inspect the old press or the repair boards beside the wall."]
}
```

A map accepts at most sixteen hints. Stable IDs, explicit `when`/`resolved` objective conditions, a disclosure of `observation` or `lead`, and one to three text levels of at most 320 characters are required. There is no answer tier. Scene evidence references must identify real producers. Conditions may include discovered events, seals/access flags, visited maps and all/any/not combinations. Authors must place the access requirement in `when` before recommending a gated route. Current-map selection prevents unrelated-map recommendations; generated validation cannot establish that prose names the correct route or contains no spoiler, so authored text also needs narrative review.

Optional `requires: {"ability":"cross-shallow-water","habitat":"wetland"}` uses the existing registered companion capability checks. It requires the actually active, owned, healthy party creature; ownership in reserve or a previous companion does not suffice. A required ability/habitat pair must exist on a registered species. General clues omit `requires` and never imply the player must acquire a specific starter. The orchard's three shipped hints recommend ordinary walking only: no new orchard ability shortcut, actor behavior or water-crossing mechanic is invented. The capability-gated reusable contract is regression-tested against real Brooklet registry data, not advertised as a new field action.

## Persistence and compatibility

Heard levels are canonical per-adventure event IDs `<map-id>/hint-<hint-id>-<level>`; no save schema or parallel codec is added. Relevance and resolution are derived again from the current party, facts and access state whenever the journal is opened or a hint requested, including after reload/import. Resolved facts remain in their existing evidence events. A failed storage commit rolls heard progress back and presents no lead. Exhausting the 256-event journal refuses a new heard event; there is no silent unsaved escalation. Repeated requests at the last tier reuse the same key. Do not rename IDs or reorder released levels: that would change the interpretation of heard history. Older packs without hints and older saves without heard keys keep their normal journals and begin at the first eligible tier.

Help uses the existing accessible dialogue panel and Next/Done control. Sound is unnecessary. It never opens automatically, nags on a timer, grants evidence, resolves a scene, chooses an outcome, awards a reward or exposes undiscovered map markers. Archived heard advice is explicitly labeled as earlier when its capability is unavailable or its map is not current; it is not an active route recommendation.

## Local review

Update `integration`, run `npm ci` and `npm start`. With the Meadow seal, enter The Ruined Orchard. Before Mara's brief the journal has no investigation help. After the brief, request an observation and then a clearer lead. Inspect either clue; the next help concerns following the observed marks, without naming the family. After finding the hollow, guidance concerns the two nearby priorities. Either resolution removes the request button and marks heard advice resolved. Reload midway; escalation and discoveries remain separate.

`node --test tests/hints.test.mjs` covers all registered starters, absent/debilitated/reserve companions, real capability registration, older/imported normalized saves, completion and unknown evidence. `CHROMIUM=/usr/bin/chromium HINT_REVIEW=1 node tests/hints.browser.mjs` drives actual keyboard/journal buttons and touch at start, two investigation states and completion, verifies persisted escalation, and retains desktop/phone captures in `docs/scene-quality/261/`. These imported scenario saves exercise the help interface; #260's independent real-control route proof supplies the traversal evidence. Neither test establishes human enjoyment or the unfinished wider slice's bespoke staging/payoff.
