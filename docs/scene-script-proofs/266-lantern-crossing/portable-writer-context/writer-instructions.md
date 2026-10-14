# Mossvale writer context

Source revision: `8083394a5e19d41c88466cfb673d971f02014660`

Open `index.html` in a browser for offline browsing. The page embeds its catalogue data and uses only local relative preview paths. The folder can be copied to another machine or uploaded to an AI chat. Remote assistants cannot read the creator's localhost or files that were not included in this folder.

Use stable catalogue IDs when referring to visuals and capabilities. Visual art entries describe images only; matching gameplay behavior is documented separately as actor, interactable, mechanic, item or environment entries. Only entries marked `available` may be requested as implemented. `proposed` entries describe gaps and are not usable features. Descriptions summarize the verified contract; technical references point back into the source repository and are not copied source code. Some game visuals have source terms that prohibit redistribution as a separate asset bundle; those fiche records remain visible, but their previews are intentionally omitted from this portable export. Check the linked local source/license record before reusing any external art.

Records in the separate `reference:` namespace are licensed visual inspiration only. They are not runtime visuals, species identities, approved Mossvale art or gameplay capabilities. Their creator, source page, exact license, content hash and limitations travel with the selected image in `references.json`; do not infer names, elements, lore, behavior, stats or readiness from a reference image.

Included image files: 4. Selected IDs: `visual:chest-wooden`, `visual:creature-fernling`, `visual:person-red-cap-south`, `visual:tree-oak`. Previews restricted from portable redistribution are omitted.

## Required playable-scene brief

Return a format-1 scene intent matching the included `scene-script.schema.json`. New scenes must include `sceneBrief`: playerPurpose, consequence (kind/description/supporting beatIds), tone, setup, action, payoff, requiredResources and continuityState. The consequence must matter to the player: clue, choice, access, relationship, encounter, useful reward, or a deliberate atmospheric beat with a stated role. Never add an unrelated chest just to pass an interaction test. Select required resources from the supplied available catalogue and the scene's uses/participants/setting; preserve incoming continuity and declare missing capabilities as gaps.

A builder must report schema/data, real-control playable behavior, reviewed rendered composition and reviewed narrative purpose separately. Capture actual runtime desktop and narrow-phone views, inspect important actor/landmark sprite bounds and legible dialogue, controls and objectives. Phone objectives may live in the scrollable sidebar; do not silently remove them. Automated geometry cannot judge enjoyable writing or art. Debug-state mutation and schema validation alone never complete a scene proof. Record deferred owner taste explicitly and preserve revision-bound screenshots and review evidence. Existing legacy scripts stay valid but need the brief and proof before quality acceptance.

## Durable narrative handoff

Use the included three `scene-examples/bell-*.json` handoffs as an authoring example, not a runtime adventure. Preserve the complete previous continuityOut as the next continuityIn, including resolved questions/promises and choices. Recaps never replace canonical state. Stable obligations, decisionRecords and actorRoles retain IDs and originating scenes. Each scene must introduce, advance, complicate or resolve an obligation and state a beat-linked consequence in continuityChanges. Keep required traits in both participant and durable role; optional appearance must not override ownership. A role substitution needs matching identity/resource/owner, dialogueBeatIds and staging, as well as updated continuity. Required capability gaps stay proposals, never invented implemented mechanics. Use --require-continuity and --previous when validating a new handoff. Legacy string decisions need explicit authored IDs; do not infer them automatically. Structural consistency cannot judge literary truth or quality.
