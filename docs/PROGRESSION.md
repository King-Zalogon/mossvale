# Growth and progression

Issue [#25](https://github.com/King-Zalogon/mossvale/issues/25). Optional polish: small, bounded and tunable. All numbers live in `dist/src/config.js`; the logic is in `dist/src/domain/rules.js` (`awardXP`, `addXP`, `level`, `moveName`).

| Rule | Value | Why |
| --- | --- | --- |
| XP per level | 45, flat (unchanged) | Old saves keep exactly the levels they had |
| Level range | 5 – 15 (`MAX_LEVEL`) | The strongest planned enemy is level 11, so a capped companion is strong, never absurd. XP is clamped at 450, so values cannot overflow |
| HP and damage growth | +4 HP and about +1.25 damage per level (unchanged) | Simple and already tuned for level 5–11 enemies |
| Level-up | Heals 12 HP per level gained | Unchanged |
| Bench share | Companions that did not fight earn 50% of each XP award (minimum 1) | Unused friends do not fall behind |
| Catch-up | A fighter 2+ levels below the team's best earns 1.5× XP | Switching to a newly caught creature is viable without grinding |
| Move upgrade | At level 10 the elemental move becomes `<name>+` and its base power goes from 12 to 16 | One visible milestone; no learnsets, evolutions or move choices |
| New catches | Start at the wild creature's level (unchanged) | Immediately usable |

Rewards per outcome are unchanged (wild win 24 XP, guardian 65 for a new seal, capture 20), so a lone fighter reaches the cap after roughly 19 wins; with the bench share and catch-up, a rotating team gets there sooner. Nothing requires reaching it: the test bot beats the meadow guardian at about level 7.

## Migration

`save.js` clamps stored XP to 450. A save above the cap keeps its previous level up to 15 and loses only the excess; saves at or below the cap are unchanged. Levels are derived from XP, so nothing else needs to migrate.

## Tuning from play

Change values in `config.js` and run `npm test`. If levels feel too fast or slow, adjust `BENCH_SHARE`, `CATCH_UP_BONUS` or `MAX_LEVEL` first; avoid touching `XP_PER_LEVEL` without a migration, since it changes every existing save's level. Evolution lines and elaborate learnsets stay out of the first adventure.
