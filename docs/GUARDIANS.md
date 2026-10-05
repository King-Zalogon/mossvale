# Guardian challenge notes

Each shrine uses the shared battle actions with a pack-defined tactic and a visible intent forecast. These are the four current decisions:

| Region | Pattern | Useful response |
| --- | --- | --- |
| Meadow | Strike, brace | The forecasted brace resolves after the player's action. After it braces, Quick strike deals 12% damage; an elemental move breaks through at 150%. |
| Amber Ridge | Strike, charge, heavy | Guard when the heavy blow is forecast. It cuts damage and ripostes for all the damage prevented. |
| Frostveil Grove | Element, element, strike | The repeated elemental volley is 70% stronger. Switch to a healthy teammate that resists the element before it repeats. |
| Reedfen Wetlands | Element, charge, heavy | The current restores up to 12% of its health while charging. An elemental hit while it gathers cancels that recovery; Guard the heavy blow that follows. |

Shrine levels are at least their map levels and rise to the rounded average level of the current party. The level is fixed when the battle begins and is already stored in the battle checkpoint, so refreshes resume the same fight. Ordinary wild encounters keep their configured levels. This lets a progressed party keep a meaningful shrine fight without scaling every encounter.

## Deterministic combat comparison

`tests/guardians.test.mjs` compares three legal policies over 50 seeded battles per guardian and per save profile:

- **Attack-only:** Quick strike every turn.
- **Burst:** use an elemental move whenever Focus allows; heal below 35% health.
- **Responsive:** heal when low, Guard a forecast heavy blow, break the Meadow brace with an elemental move, interrupt Reedfen’s forecast charge with an elemental move, and switch to a healthier matchup before elemental attacks.

Every policy won all 50 battles in these two synthetic profiles. The table reports average damage received by the party per battle for attack-only versus responsive play. Responsive play now includes the explicitly forecast elemental interruption during Reedfen’s charge; the advanced save has a level-15 starter and two level-10 companions.

| Guardian | Near-arrival party | Advanced party |
| --- | ---: | ---: |
| Meadow | 70.4 → 56.1 | 71.6 → 47.5 |
| Amber Ridge | 67.0 → 28.7 | 65.9 → 19.8 |
| Frostveil Grove | 79.5 → 24.0 | 74.3 → 30.5 |
| Reedfen Wetlands | 81.4 → 17.1 | 81.4 → 17.1 |

The near-arrival profile has three companions one level below the shrine's map level. These results show safer play, not that a tactic is mandatory or that the win rate improves: even attack-only won all sampled battles. The simulator does not model the owner's complete save, decision-making, or enjoyment. Attack-only still won every sampled battle, so tactics currently improve safety and efficiency rather than gate progress. A normal playable build and focused owner feedback are still needed before closing #23.
