# Guardian challenge notes

Each shrine uses the shared battle actions with a pack-defined tactic and a visible intent forecast. These are the four current decisions:

| Region | Pattern | Useful response |
| --- | --- | --- |
| Meadow | Strike, brace | The forecasted brace resolves after the player's action. After it braces, Quick strike deals 25% damage; an elemental move breaks through at 125%. |
| Amber Ridge | Strike, charge, heavy | Guard when the heavy blow is forecast. It cuts damage and ripostes for 85% of the damage prevented. |
| Frostveil Grove | Element, element, strike | The repeated elemental volley is 30% stronger. Switch to a healthy teammate that resists the element before it repeats. |
| Reedfen Wetlands | Element, charge, heavy | The current restores up to 7% of its health while charging. Keep pressure on it during the lull, then Guard the heavy blow. |

Shrine levels are at least their map levels and rise to the rounded average level of the current party. The level is fixed when the battle begins and is already stored in the battle checkpoint, so refreshes resume the same fight. Ordinary wild encounters keep their configured levels. This lets a progressed party keep a meaningful shrine fight without scaling every encounter.

## Deterministic combat comparison

`tests/guardians.test.mjs` compares three legal policies over 50 seeded battles per guardian and per save profile:

- **Attack-only:** Quick strike every turn.
- **Burst:** use an elemental move whenever Focus allows; heal below 35% health.
- **Responsive:** heal when low, Guard a forecast heavy blow, break the Meadow brace with an elemental move, and switch to a healthier matchup before elemental attacks.

Every policy won all 50 battles in these two synthetic profiles. The table reports average damage received by the party per battle for attack-only versus responsive play; the advanced save has a level-15 starter and two level-10 companions.

| Guardian | Near-arrival party | Advanced party |
| --- | ---: | ---: |
| Meadow | 70.4 → 61.5 | 71.6 → 47.5 |
| Amber Ridge | 67.0 → 28.7 | 65.9 → 19.8 |
| Frostveil Grove | 76.5 → 20.6 | 65.3 → 25.7 |
| Reedfen Wetlands | 81.4 → 17.1 | 81.4 → 17.1 |

The near-arrival profile has three companions one level below the shrine's map level. These results show safer play, not that a tactic is mandatory or that the win rate improves: even attack-only won all sampled battles. The simulator does not model the owner's complete save, decision-making, or enjoyment. A normal playable build and focused owner feedback are still needed before closing #23.
