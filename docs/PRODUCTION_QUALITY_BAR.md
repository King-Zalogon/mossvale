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
