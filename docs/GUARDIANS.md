# Guardian challenge notes

Each shrine uses the shared battle actions with a pack-defined tactic and an intent forecast:

| Region | Pattern | Useful response |
| --- | --- | --- |
| Meadow | Strike, brace | Use the no-damage brace turn to strike. Guard or heal after the brace, when the next strike would be halved. |
| Amber Ridge | Strike, charge, heavy | Attack during the harmless charge; Guard when the heavy blow is forecast. |
| Frostveil Grove | Element, element, strike | Switch to a healthy resistant teammate or heal between elemental volleys. |
| Reedfen Wetlands | Element, charge, heavy | Respond to the element with a resistant teammate; attack during the charge and Guard the heavy blow. |

The enemy forecast describes what happens after the player's selected action. In particular, when it says **bracing**, the player's action still happens before the brace. The reduced player strike is the next turn. The Meadow intro now spells out that timing.

## Overlevel check

`tests/guardians.test.mjs` compares 30 deterministic seeded battles per shrine for a solo level-12 starter, using either attack-only actions or the existing intent-aware policy. This is a deliberately overleveled player model, not a complete replay or a claim about owner enjoyment.

| Guardian | Attack only | Intent-aware |
| --- | ---: | ---: |
| Meadow | 30/30 | 30/30 |
| Amber Ridge | 26/30 | 30/30 |
| Frostveil Grove | 7/30 | 30/30 |
| Reedfen Wetlands | 0/30 | 30/30 |

Design decision: progression levels stay fixed; voluntary leveling can make earlier shrines easier. Wild encounters never scale with the player's level. Later guardians still materially reward responding to forecasts even with a level-12 lead. This domain simulation does not establish whether the owner experiences the tactics as distinct in a normal party save. The issue remains open for a playable owner check.
