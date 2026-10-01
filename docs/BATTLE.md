# Battle rules

Issue [#16](https://github.com/King-Zalogon/mossvale/issues/16). Rules are in `dist/src/domain/battle.js` (`resolveTurn` resolves a whole round); numbers are in `dist/src/config.js`. The battle screen shows the same values the code uses.

| Action | Effect | Tradeoff |
| --- | --- | --- |
| **Quick strike** (1) | Reliable damage (base 10) | Builds +1 Focus |
| **Elemental move** (2) | Type-based damage (base 16, 20 after level 10; super effective ×1.6, weak ×0.65) | Costs 1 Focus; unavailable at 0 Focus |
| **Capture orb** (3) | Chance shown on the button | Spends an orb; guardians cannot be caught |
| **Potion** (4) | Restore 24 HP | Spends a potion; uses the turn |
| **Guard** (5) | Next enemy hit deals 65% less | Builds +1 Focus; uses the turn |
| **Switch** (6) | Swap to a teammate with HP left (team of up to 3) | Uses the turn, so the enemy still replies |

**Focus** runs 0–3 and each fight starts with 2. The pips next to the matchup line show it. Bursting with the elemental move is strong; running dry means striking or guarding to rebuild. A type matchup, low HP, or a teammate with the advantage are the reasons to switch, guard or heal instead of attacking.

The enemy alternates a plain strike and its elemental move; there are no status effects (deliberately: Focus is the one extra decision). Capture chance is `25% + 67% × missing enemy HP + 2.5% per level above the enemy`, capped at 96%, and is exactly what the button shows.

## Guardian tactics (#23)

Wild creatures strike and use their elemental move in turn. Each regional guardian follows a short repeating **tactic** from `dist/src/data/tactics.js`, chosen in the shrine's map data (`guardian: { species, level, tactic, power }`). While you fight a guardian, the line under the log tells you its next move, so the decision is yours, not a guess.

| Guardian | Tactic | Pattern | What it asks of you |
| --- | --- | --- | --- |
| Meadow (Mushmallow) | Spore guard | strike, brace | After it braces your next attack is halved: Guard or heal that turn, burst when it opens up |
| Amber Ridge (Pebblit) | Rolling charge | strike, charge, heavy | The heavy blow is 1.8× a strike; Guard the turn it comes |
| Frostveil Grove (Frostowl) | Frost chorus | element, element, strike | Its elemental hits make the matchup matter: bring a teammate that resists Ice, and heal |

`power` (0.5–3, default 1) scales a guardian's damage; the meadow and amber guardians use 1.5. The fourth biome's guardian will reuse these actions or add one to the vocabulary.

Guardians can be retried freely: a defeat heals the team and returns you to camp, and the seal reward is only paid the first time. `tests/guardians.test.mjs` plays each guardian with three simple policies. At one level under the guardian, a Focus-burst policy and a read-the-intent policy both win most of the time, while plain striking fails the amber and frostveil guardians. (The bot only uses a Fernling, a Leaf creature that is weak against Ice, so the Frostveil numbers are a worst case.)
