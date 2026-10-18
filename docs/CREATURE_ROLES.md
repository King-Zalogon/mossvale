# Creature role briefs

Issue #262 uses the existing encounter and companion contracts to make three species read differently in the field and in battle. The species IDs, portraits, follower atlases and combat atlases remain unchanged.

| Species | Body and field read | Battle role | Acquisition and later use |
| --- | --- | --- | --- |
| Fernling | Quadruped; a wary watch state keeps distance for 2.5 seconds inside a 3-tile local window. It retreats and can be encountered again if the approach is abandoned. | Wary brace pattern; Quick Strike is reduced until an Element move breaks through. | Starter-capable meadow friend and dependable Leaf option for the meadow route. |
| Bramblebuck | Hopper; a territorial defend state holds a 2-tile patch for 3 seconds and returns there after a failed approach. | Territorial charge; the telegraphed heavy turn rewards Guard or an effective Element move. | Optional meadow capture that adds a defensive anchor to the party. |
| Brooklet | Water quadruped; a curious approach state opens a 4-tile, 1.5-second observation window and circles back after a missed opportunity. | Curious, easier to befriend, with no forced battle tactic. | Wetland capture unlocks the existing shallow-water companion route; the ordinary boardwalk remains the fallback. |

## Authoring contract

Encounter pool entries may set `behavior` to `wary`, `territorial` or `curious`, plus an optional `field` object:

```json
{"species":"brooklet","behavior":"curious","field":{"duration":1.5,"radius":4,"recovery":"circle-and-retry"}}
```

`duration` is 0.5–5 seconds and `radius` is 1–6 tiles. `recovery` is one of `retreat-and-retry`, `return-to-patch` or `circle-and-retry`. The runtime clamps authored values, stores the resolved profile in the existing battle checkpoint and falls back to the curious profile for older packs or invalid optional values. The bounded profile describes the observation window and recovery path; it does not create autonomous pursuit or block map entry.

The encounter cue is shown before the first action, and a reload resumes the same resolved profile. Reduced motion changes presentation only; the field role and recovery rules are unchanged.
