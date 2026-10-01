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
