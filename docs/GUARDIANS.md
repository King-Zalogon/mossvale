# Guardian challenge notes

Each shrine uses the shared battle actions with a pack-defined tactic and a visible intent forecast. These are the four current decisions:

| Region | Pattern | Useful response |
| --- | --- | --- |
| Meadow | Strike, brace | The forecasted brace resolves after the player's action. After it braces, Quick strike deals 12% damage; an elemental move breaks through at 150%. |
| Amber Ridge | Strike, charge, heavy | Guard when the heavy blow is forecast. It cuts damage and ripostes for all the damage prevented. |
| Frostveil Grove | Element, element, strike | The repeated elemental volley is 70% stronger. Switch to a healthy teammate that resists the element before it repeats. |
| Reedfen Wetlands | Element, charge, heavy | The current restores up to 12% of its health while charging. An elemental hit while it gathers cancels that recovery; Guard the heavy blow that follows. |

Successful responses now pay a small guardian bonus when the fight is won: breaking Meadow's brace, Guarding a forecast heavy blow, switching to a resistant teammate for Frostveil's repeated volley, disrupting Reedfen's recovery, and Guarding its crash each grant +8 coins and +10 XP once per fight. The response is declared in the tactic data, recorded in the battle checkpoint, and named on the victory result so a player can connect the forecast to the reward.

Shrine levels are at least their map levels and rise to the rounded average level of the current party. The level is fixed when the battle begins and is already stored in the battle checkpoint, so refreshes resume the same fight. Ordinary wild encounters keep their configured levels. This lets a progressed party keep a meaningful shrine fight without scaling every encounter.

Guardian durability is a pack-level tuning value: `registries.tactics.guardianHpBonus` (integer 0..200). Mossvale uses 48 additional HP, up from the backward-compatible default of 18 for older registries. It applies only to guardian battles; ordinary encounters and save data are unchanged. Other packs can tune this independently without editing every shrine or changing engine rules.

## Deterministic combat comparison

`tests/guardians.test.mjs` compares three legal policies over 50 seeded battles per guardian and per save profile. It records turns and team damage, checks attack-only viability, and requires responsive play to reduce damage while giving the forecasted tactic at least three turns to matter for the advanced party:

- **Attack-only:** Quick strike every turn.
- **Burst:** use an elemental move whenever Focus allows; heal below 35% health.
- **Responsive:** heal when low, Guard a forecast heavy blow, break the Meadow brace with an elemental move, interrupt Reedfen’s forecast charge with an elemental move, and switch to a healthier matchup before elemental attacks.

Every policy won all 50 battles in these two synthetic profiles. Each cell reports average turns and average party damage per battle (`turns; damage`) for attack-only versus responsive play. Responsive play includes the explicitly forecast elemental interruption during Reedfen’s charge; the advanced save has a level-15 starter and two level-10 companions.

| Guardian | Near-arrival party | Advanced party |
| --- | --- | --- |
| Meadow | 11.9 → 8.9; 104.6 → 70.7 | 8.1 → 7.0; 95.3 → 72.2 |
| Amber Ridge | 7.0 → 4.0; 99.4 → 28.7 | 6.0 → 3.0; 75.1 → 32.2 |
| Frostveil Grove | 6.4 → 6.0; 100.6 → 60.9 | 5.6 → 6.6; 106.1 → 73.4 |
| Reedfen Wetlands | 7.5 → 3.0; 151.0 → 33.6 | 7.3 → 3.0; 143.0 → 33.6 |

The near-arrival profile has three companions one level below the shrine's map level. These results show that the added health creates several forecast cycles and responsive play lowers damage, not that a tactic is mandatory or that the win rate improves: attack-only still won all sampled battles. The simulator does not model the owner's complete save, decision-making, or enjoyment. A normal playable build and focused owner feedback are still needed before closing #23/#229.
