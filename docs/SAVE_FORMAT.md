# Save format and recovery

Implemented in `dist/src/save.js` (pure, tested without a browser). Issue: [#8](https://github.com/King-Zalogon/mossvale/issues/8).

## Storage keys

| Key | Purpose |
| --- | --- |
| `mossvale-v3` | Current save (schema 3, stable string IDs). The only key the game writes progress to. |
| `mossvale-backup` | Checkpoint of the last valid v3 save, copied once at each successful start. |
| `mossvale-quarantine` | Up to the 3 most recent unreadable payloads (`key`, `reason`, `at`, `raw`). Never auto-deleted. |
| `mossvale-archive` | One adventure set aside by **New game** (or swapped in by **Restore previous adventure**): `{at, raw}` where `raw` is a v3 payload. Never deleted automatically. |
| `mossvale-settings` | Preferences (`sound`, `motion` auto/reduced, `zoom`, touch `run`), separate from the save so New game and Restore keep them. |
| `mossvale-v2`, `mossvale-v1` | Legacy saves. Read for migration only and left untouched. |

## Schema 3

Species and regions are stored by ID, not array position, so content can be reordered or extended safely. Current IDs: species `fernling emberkin brooklet duskwing voltkit mushmallow frostowl pebblit`; regions `meadow amber-ridge frostveil-grove`. Never rename or reuse an ID.

Fields: `version, region, x, y, active, orbs, potions, coins, seen[], caught[], team{speciesId:{xp,hp}}, badges[], chests[], visited[], met, wins, playTime`. Team: `party` lists the (at most 3) companions who can fight, by species ID; the active companion is always on it and everyone else captured waits in the reserve. Saves without `party` get the active companion plus the first captures.

Interrupted encounters: `battle` (`{id, hp, max, level, boss, guard, turn, focus}`, species by ID) is the checkpoint of a fight in progress, and `recap` is a one-line summary of an encounter that finished before its result screen was shown. Both are optional; older builds ignore them. See [Encounter durability](#encounter-durability).

In memory the game still uses indexes; `save.js` converts at the load/serialize boundary.

## Load order and outcomes

Candidates are tried in order: `v3`, `backup`, `v2`, `v1`.

| Situation | Status | Behavior |
| --- | --- | --- |
| No save | `new` | Fresh game |
| Valid v3 | `ok` | Loaded; backup refreshed |
| Valid v1/v2 | `migrated` | Converted; legacy key untouched; v3 written on first save |
| Invalid JSON/structure, older candidate valid | `restored` | Bad payload quarantined, older save loaded, recovery dialog shown |
| Invalid and nothing else usable | `recovered` | Bad payload quarantined, new game, recovery dialog shown |
| `version` greater than 3 | `future` | Left untouched; session is not saved; dialog shown |
| Storage throws on read | `unavailable` | Plays in memory ("SESSION ONLY"); dialog shown |

Validation: every field is type-checked; numbers must be finite and are clamped (counts 0–9999, XP 0–450 (the level-15 cap), HP 0–max for level, position inside the map); IDs must exist; duplicates removed; `seen ⊇ caught`; every caught species has a team record; `active` must be caught; a locked region falls back to the meadow.

## Tests

`npm test` (codec fixtures in `tests/save.test.mjs`), `npm run test:browser` (needs Playwright + Chromium).

## Encounter durability

Issue [#11](https://github.com/King-Zalogon/mossvale/issues/11). A battle round is resolved completely in `domain/battle.js: resolveTurn` before anything is shown: the orb or potion is spent, damage and the enemy reply are applied, and any win/capture/defeat reward is granted exactly once. The save is written immediately after resolution. The animation that follows is purely cosmetic, so a refresh at any moment cannot spend an item and discard its effect.

| When the page reloads | Result |
| --- | --- |
| Mid-fight, after a round resolved | The encounter resumes at the next player choice (`battle` checkpoint) |
| After a capture or win resolved but before its result screen | Rewards are already saved; a toast shows `recap` instead of the result screen |
| Checkpoint invalid (unknown species, bad HP/level) | Dropped without penalty |
| Checkpoint is a guardian already beaten, or the whole team is down | Dropped; the team is healed if no companion can fight |

Double taps and stale timers: an ended battle returns `null` from `resolveTurn` (no duplicate rewards), `battle.busy` blocks input while a round plays, and the cancellable `services/timeline.js` ignores callbacks from cancelled playbacks. Hiding the tab or leaving the page flushes the animation to its final frame and saves.

## Starting over and restoring

Issue [#20](https://github.com/King-Zalogon/mossvale/issues/20). **New game** copies the current adventure into `mossvale-archive` (only if it has progress), then writes a fresh save and resets the checkpoint so corruption recovery cannot resurrect the old one. If a different adventure was already archived, the confirmation says it will be replaced. **Restore previous adventure** swaps the archive and the current save, so nothing is lost either way. Both are disabled when the save is read-only (newer schema or storage unavailable), write nothing if the archive write fails, and reload the page afterwards.
