# Battle rules

Issue [#16](https://github.com/King-Zalogon/mossvale/issues/16). Rules are in `dist/src/domain/battle.js` (`resolveTurn` resolves a whole round); numbers are in `dist/src/config.js`. The battle screen shows the same values the code uses.

| Action | Effect | Tradeoff |
| --- | --- | --- |
| **Quick strike** (1) | Reliable damage (base 10) | Builds +1 Focus |
| **Elemental move** (2) | Type-based damage (base 16, 20 after level 10; super effective ×1.6, weak ×0.65) | Costs 1 Focus; unavailable at 0 Focus |
| **Capture orb** (3) | Chance shown on the button | Spends an orb; guardians cannot be caught |
| **Potion** (4) | Restore 24 HP | Spends a potion; uses the turn |
| **Guard** (5) | Next enemy hit deals 65% less | Builds +1 Focus; uses the turn |
| **Prepare relay** (6) | Spend 1 Focus to prepare a two-turn handoff; switching to a healthy teammate arms the next strike | Cannot stack; the enemy still replies and the relay expires after two enemy turns |
| **Switch** (7) | Swap to a teammate with HP left (team of up to 3) | Uses the turn, so the enemy still replies; a prepared relay amplifies the next move |

**Focus** runs 0–3 and each fight starts with 2. The pips next to the matchup line show it. Bursting with the elemental move is strong; running dry means striking or guarding to rebuild. A type matchup, low HP, or a teammate with the advantage are the reasons to switch, guard or heal instead of attacking.

The enemy alternates a plain strike and its elemental move. The optional relay is the first bounded temporary condition: it is stored in the battle checkpoint, cannot stack, expires after two replies and is consumed by the first strike after the prepared switch. An elemental move gets a 1.35 factor; a quick strike still consumes the relay without the bonus. Capture chance is `25% + 67% × missing enemy HP + 2.5% per level above the enemy`, capped at 96%, and is exactly what the button shows.

## Guardian forecasts and tactics (#23, #256)

Wild creatures strike and use their elemental move in turn. Each regional guardian follows a short repeating **tactic** from `dist/src/data/tactics.js`, chosen in the shrine's map data (`guardian: { species, level, tactic, power }`). A guardian forecast means **after your current choice**, the guardian takes its listed action; if your action defeats it, the reply does not happen. Damage is shown as a range for the current active companion because the enemy damage roll is random. Switching to a different type matchup changes that range. Guard covers only the one enemy action that follows the Guard choice.

| Guardian | Tactic | Pattern | What it asks of you |
| --- | --- | --- | --- |
| Meadow (Mushmallow) | Spore guard | strike, brace | Brace follows your choice and deals no damage. After it braces, a Quick Strike uses a 0.12 damage factor (3 minimum); an Element move uses a 1.5 factor and costs 1 Focus. Those factors affect the next attack, not the action before the brace. Guard does not carry past a no-damage brace. |
| Amber Ridge (Pebblit) | Rolling charge | strike, charge, heavy | Charge follows your choice and deals no damage; heavy follows on the guardian's next turn. Save Guard for the heavy forecast: it multiplies damage by 0.35 and returns the prevented damage (factor 1.0). Guarding charge itself protects against no hit and expires. |
| Frostveil Grove (Frostowl) | Frost chorus | element, element, strike | The second consecutive Element move uses a 1.7 raw damage factor before matchup, defense and Guard. Switch to a healthy Ice-resistant teammate when that repeat is forecast; the enemy still attacks after you switch. |
| Reedfen Wetlands (Siltkip) | Tidal current | element, charge, heavy | Charge follows your choice, deals no damage, and can restore up to 12% of maximum HP. An Element move chosen this turn (1 Focus) interrupts that recovery. Guard charge itself does not protect against the later heavy; Guard the heavy forecast to reduce damage and riposte. |

`power` (0.5–3, default 1) scales a guardian's damage; the meadow and amber guardians use 1.5. The fourth biome's guardian will reuse these actions or add one to the vocabulary.

The forecast panel is derived from the same tactic fields and damage formula as the battle resolver. It identifies reply timing, the current active target, a random damage range, Guard's reduced range/riposte, Focus costs, interruption windows and any configured response reward. A no-damage Brace or Charge consumes Guard's one-action protection; Guard still grants Focus. Element is unavailable at 0 Focus. The panel is static text and remains present with reduced motion.

## Pack-authored encounter objectives (#264)

Scene challenge actions may include one optional `survive` objective. The pack supplies a stable id, title, description, turn target and a bounded reward. The objective is visible in the battle panel and advances after each completed enemy reply; any legal action can contribute, so the player can choose Guard, attack, potion or a switch. Once the target is reached, **Complete objective** explicitly commits the reward and records `battle-objective:<id>` in the canonical event journal. Defeat, capture or leaving before completion gives no objective reward, and the completion marker prevents duplicate payment.

The registry defaults allow at most 8 turns and 999 units of each reward field. Progress and the authored objective are included in the battle checkpoint, so a reload resumes the same encounter. Encounters without an objective keep their existing action and reward flow.

Successful responses pay a small bonus only when their matching window occurs and the fight is won: breaking Meadow's already-active brace, Guarding a forecast heavy blow, switching to a healthy resistant teammate for Frostveil's repeated volley, interrupting Reedfen's charge, and Guarding its crash each grant +8 coins and +10 XP once per fight. Killing Reedfen before its charge resolves does not award an “interrupted recovery” bonus. Response IDs remain in the existing battle checkpoint; no save schema change is needed.

Guardians can be retried freely: a defeat heals the team and returns you to camp, and the seal reward is only paid the first time. `tests/guardians.test.mjs` compares attack-only, Focus-burst and responsive policies over 50 seeded fights per guardian and two synthetic team profiles. All three policies win all sampled fights; responsive play reduces incoming damage on the advanced profile. This test does not model player behavior or prove balance/enjoyment on a real save.

## Local decision trace and policy report (#257)

The opt-in trace records the starting encounter and party, supplies, the player's legal actions and their unavailable reasons, the selected action, visible guardian intent, turn outcomes, and resulting HP/Focus. It stays in memory, keeps the most recent 200 records, never changes a save or consumes RNG, and is never uploaded. To collect one, open a local debug build at `/?debug&combatTrace&seed=77`, play an encounter, then call `window.mossvale.exportCombatTrace()` in the browser console. The browser downloads a JSON file with a unique trace ID, timestamp, pack/build/seed metadata and a count of records omitted by the rolling cap. Guardian entries include the active type multiplier and structured response windows. Normal play has no trace hook or trace collection. Reloading or closing the page discards the trace.

Run `npm run combat:balance -- --seeds 50` for a reproducible Markdown comparison, or add `--format json` for machine-readable output. `--output FILE` writes a new report file without overwriting an existing one. The strongest-legal-move policy compares Quick strike and elemental damage over 32 deterministic, evenly spaced damage rolls and prefers Quick strike on ties. The same seed set is applied to the attack-only, strongest-legal-move and intent-responsive policies for normal progression, a level-15 starter with level-5 teammates, every registered species-versus-species elemental matchup, and all four guardians at normal and overleveled profiles. The report separates how often an action was available from how often each policy chose it, and reports outcomes, duration, incoming/counter damage, healing, potions, switches, response windows, rewards and failed seal objectives.

These scripted fights are diagnostic evidence, not a fun score. They do not model player perception or human experimentation, and a small seed range cannot establish broad balance. The objective metric covers the four guardian seals; pack-authored encounter objectives are validated separately through domain and save tests.
