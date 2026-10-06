# Mossvale production quality bar

Issue [#245](https://github.com/King-Zalogon/mossvale/issues/245) defines the minimum evidence required before calling a playable slice production quality. Passing unit tests or validating an asset file is necessary, but it does not establish that the game feels good or reads clearly at play scale.

## The slice

Use one short route that can be completed in about ten minutes:

1. enter the area and understand the next goal without reading implementation notes;
2. move, redirect around obstacles and interact using keyboard and touch;
3. trigger one authored encounter and understand why the battle started;
4. choose a move, read its target and element, see anticipation, impact, damage and outcome;
5. receive a meaningful reward, save, reload, and continue toward the next goal.

The route must use shipped assets and data. A test fixture may isolate the route, but it must use the same runtime actions, save codec and rendering path as the game.

## Review gates

### Control and camera

- Input responds immediately, stops on release or cancellation, and recovers after rotation.
- Collision redirects around common obstacles instead of trapping the player.
- The player, interactable and destination remain visible at the actual gameplay viewport.
- Every important action has one visible affordance and one clear state transition.

### Battle readability

- The player can identify attacker, target, move, element, anticipation, impact, damage and result without relying on a debug label.
- Element effects communicate material and direction through authored motion and impact. A tint or generic halo is not sufficient.
- Timing, damage, saves and reduced-motion behavior stay deterministic; reduced motion keeps the action legible.

### UX and pacing

- Dialogue, menus, inventory and battle controls share focus, cancellation and confirmation rules.
- The route has a reason to explore, a meaningful encounter, a reward and a next goal.
- Empty, opened, disabled and completed states are visually distinct.
- Desktop and touch layouts preserve the same actions without clipped or overlapping controls.

### Evidence

- Record a short actual-scale capture or provide exact local reproduction steps.
- Add focused automated coverage for the critical flow, including reload and one-time rewards.
- List known limitations separately from accepted behavior; passing checks never substitutes for owner playtest.

## Engineering boundary

Keep battle rules pure and data-driven. Keep presentation replaceable and event-driven. Prefer a small authored vertical slice over adding more creatures, maps or effects before the existing slice is coherent. Follow-up work belongs in the concrete issues linked from #245.

## Beyond the baseline: Mossvale's design identity

The quality bar is only the floor. A professional Mossvale slice must also express a point of view that another creature RPG does not get by changing names and colors.

- **Places have behavior.** A region's terrain, weather, inhabitants, encounters and rewards should reinforce one ecological idea. Traversal abilities, creature choices and route discoveries should change what the player can do there.
- **Companions have reasons to exist.** A companion is not just a stat bundle or follower sprite. Its habitat, temperament, exploration ability, battle role and relationship with the player should create at least one meaningful decision.
- **Challenges test understanding.** Guardians and encounters should teach a regional rule, then reward the player for recognizing and responding to it. A different label or larger health pool is not a new challenge.
- **The world remembers.** A completed interaction, rescued character, opened route or discovered creature should produce a visible, persistent change in later play. State must survive save/reload and remain explainable in the journal.
- **Content earns its cost.** Every new creature, map, quest or effect needs a player-facing purpose, a readable interaction, and a place in the progression loop. Do not add breadth to conceal a thin core loop.

For each region, record a compact design matrix before production: premise, player question, system rule, teachable encounter, meaningful choice, consequence, reward, and next possibility. A region is ready only when those entries reinforce one another in play, not merely when the data validates.

## Design lessons to apply

The following lessons come from projects that document their design rather than only their implementation:

- Pick one area in which the game intends to be unusually good. A postmortem from *Kingdoms of Amalur* describes committing early to combat as its differentiator and letting level scale and encounter space serve that goal. Mossvale needs the same discipline instead of treating every system as equally important.
- Make the rules produce the story. *Cataclysm: Dark Days Ahead* keeps geography, resources and balance tied to its survival premise; its systems are not interchangeable decoration. Mossvale's regional ecology must change routes, companions, encounters and rewards together.
- Make agency observable. The *Roadwarden* design deep dive frames role-playing as choices about resources, relationships and priorities whose consequences are reflected by the world. A dialogue option that only changes a line is not enough for a meaningful Mossvale choice.
- Build authoring tools around iteration. Tuxemon's data, maps and scripts and Godosters' pure battle core, replaceable UI, content packs and integration scenes show how a small team can test and revise content without destabilizing the engine.

### Provisional Mossvale north star

Mossvale should be an **ecological companion RPG**: the player learns how each living region behaves, forms a relationship with companions who understand different parts of it, and uses that knowledge to make better traversal and battle decisions. This is a design hypothesis to validate in the vertical slice, not a claim that the current game already delivers it.

Every proposed feature should answer three questions before implementation:

1. What does it teach the player about this region or companion?
2. What decision does it create that another feature cannot replace?
3. What persistent consequence makes the decision matter later?

If it cannot answer all three, it belongs in the backlog rather than in the next production slice.
