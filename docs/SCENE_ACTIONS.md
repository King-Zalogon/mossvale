# Authored scene actions

Map trigger events use a bounded data vocabulary. Scene actions are validated with the map, compiled by `domain/scenes.js`, and presented by the controller; authored packs never provide JavaScript callbacks.

Scene `when` conditions may reference a completed one-time scene with `{ "event": "map-id/event-id" }`. Combine independent clues with `all`, alternatives with `any`, and exclusions with `not`. Event keys are the same stable IDs persisted in the save event journal; they do not add a second save format.

## Actor and route actions

Movable actor IDs are `player` and ranger landmark IDs on the current map. Destinations are integer tile coordinates, must be walkable under the map collision rules, and cannot be outside the map. A move uses deterministic eight-direction pathfinding, refuses diagonal corner cutting, and is limited to 128 steps and 4096 inspected cells. If a route cannot be found, the action returns `blocked`; the actor stays where it is. If already on the requested tile, it returns `arrived` immediately without a teleport.

```json
{
  "type": "move",
  "actor": "player",
  "to": [12, 9]
}
```

`face` points one actor at another supported actor. Ranger art has north, east, south and west poses; the player retains all eight directions. `react` supports `notice`, `surprise` and `happy`, rendered as a brief readable cue above the actor. These are the currently supported reactions; there is no custom animation or arbitrary pose scripting. `wait` accepts 0–5000 milliseconds.

```json
{"type":"move","actor":"ranger","to":[12,10]}
{"type":"face","actor":"player","target":"ranger"}
{"type":"react","actor":"ranger","pose":"notice"}
{"type":"wait","ms":350}
{"type":"dialogue","speaker":"ranger","text":"I heard you coming."}
```

Actions execute in authored order. A move completes before the next action starts, so actors can approach in sequence. Parallel action groups are not supported. Missing actors and blocked routes stop choreography with an explicit `blocked` result; cancellation produces `cancelled`. In both cases the controller releases movement ownership and presents any remaining dialogue when the same map is still active and the UI is available.

NPC speech and landmark descriptions use the same light dialogue panel. It is centered in the lower part of the map and moves only when needed to keep its speaker or landmark visible. On touch layouts the movement pad and Run button pause while the panel is open; the single Next/Done button advances or closes it. Short lines stay compact, while long text scrolls inside the panel.

## Interruption and persistence

The event's one-time key, flags and rewards are saved together before any visual movement begins. A failed save rolls that transaction back. Presentation is transient: pause, menu, map travel, battle, hidden tab, page exit or another interruption cancels the current movement and cannot invoke late callbacks. A cancelled one-time event remains consumed because its durable effects have already committed; its presentation does not replay after reload. Repeatable events can be activated again under their authored condition.

Reduced-motion mode moves actors directly between the same validated route points, with no animated travel delay; waits are capped to a short pause. The outcome and collision rules are unchanged.

## Verification expectations

`tests/scenes.test.mjs` covers actor/reference validation, bounded routes, walkable destinations and explicit blocked/arrived results. Browser choreography proofs should also check that controls cannot move the player during a sequence and that pause/menu/travel/hidden-tab release ownership. Use the standard scene speech UI for desktop and narrow/landscape viewport checks.
