# Save format and recovery

Implemented in `dist/src/save.js` (pure, tested without a browser). Issue: [#8](https://github.com/King-Zalogon/mossvale/issues/8).

## Storage keys

| Key | Purpose |
| --- | --- |
| `mossvale-v3` | Current save (schema 3, stable string IDs). The only key the game writes progress to. |
| `mossvale-backup` | Checkpoint of the last valid v3 save, copied once at each successful start. |
| `mossvale-quarantine` | Up to the 3 most recent unreadable payloads (`key`, `reason`, `at`, `raw`). Never auto-deleted. |
| `mossvale-archive` | One adventure set aside by **New game** (or swapped in by **Restore previous adventure**): `{at, raw}` where `raw` is a v3 payload. Never deleted automatically. |
| `mossvale-save-transaction` | Recovery journal for multi-key operations (import, new game, restore). Present only while an operation's copies are still being synchronized. |
| `mossvale-settings` | Preferences (`sound`, `motion` auto/reduced, `zoom`, touch `run`), separate from the save so New game and Restore keep them. |
| `mossvale-v2`, `mossvale-v1` | Legacy saves. Read for migration only and left untouched. |

### One set of keys per adventure (#67)

Every adventure keeps its progress, checkpoint, archive, quarantine and recovery journal under its own keys, so adventures never mix. The first adventure (`mossvale`) keeps the names above, which means its saves never move and older builds still find them. Any other pack `<id>` uses `mossvale-pack-<id>-v3`, `-backup`, `-archive`, `-quarantine` and `-save-transaction` (and has no `v2`/`v1` generations). `save.js: keysFor(pack)` is the one place these names are built, and `codec.keys` carries them to the services.

Two keys are shared by all adventures on purpose: `mossvale-settings` (sound, text size and zoom are about the player) and `mossvale-adventure` (the adventure to open next, written by the chooser or `?adventure=<id>`).

**Relocation.** A build of a single pack made before the chooser stored that pack's saves under the first adventure's keys (marked with `pack`). On start, if `mossvale-v3` holds another pack's save, it is copied together with its checkpoint and archive to that pack's keys through that pack's recovery journal, and only then removed. An interrupted copy leaves the original in place and is finished by the journal; a repeated run finds nothing to move; progress already present for that pack is never overwritten (the other copy stays and is reported). It waits while a first-adventure journal is pending so the normal load can finish and report it.

## Schema 3

Species and regions are stored by ID, not array position, so content can be reordered or extended safely. Current IDs: species `fernling emberkin brooklet duskwing voltkit mushmallow frostowl pebblit`; regions `meadow amber-ridge frostveil-grove`. Never rename or reuse an ID.

Fields: `version, region, x, y, active, orbs, potions, coins, seen[], caught[], team{speciesId:{xp,hp}}, badges[], chests[], visited[], met, wins, playTime`. Goal: `goal` is the id of the last objective shown (see [OBJECTIVES.md](OBJECTIVES.md)); it only drives the "New goal" toast, and progress itself is derived from the save.

Story: `hints` lists the one-time tips and cards already shown (at most 30 ids) and `completed` marks the ending as seen; both optional ([STORY.md](STORY.md)).

Team: `party` lists the (at most 3) companions who can fight, by species ID; the active companion is always on it and everyone else captured waits in the reserve. Saves without `party` get the active companion plus the first captures.

Interrupted encounters: `battle` (`{id, hp, max, level, boss, guard, turn, focus}`, species by ID) is the checkpoint of a fight in progress, and `recap` is a one-line summary of an encounter that finished before its result screen was shown. Both are optional; older builds ignore them. See [Encounter durability](#encounter-durability).

Adventure pack: `pack` names the adventure the save belongs to ([PACKS.md](PACKS.md)). The first adventure (`mossvale`) omits it, which keeps its saves identical to older ones; a save from another pack is reported as `foreign`, never loaded, overwritten or imported.

In memory the game still uses indexes; `save.js` converts at the load/serialize boundary.

## Load order and outcomes

Candidates are tried in order: `v3`, `backup`, `v2`, `v1`.

| Situation | Status | Behavior |
| --- | --- | --- |
| No save | `new` | Fresh game |
| Save written for a different adventure pack | `foreign` | Left untouched, not writable, explained; not treated as damage |
| Valid v3 | `ok` | Loaded; backup refreshed |
| Valid v1/v2 | `migrated` | Converted; legacy key untouched; v3 written on first save |
| Invalid JSON/structure, older candidate valid | `restored` | Bad payload quarantined, older save loaded, recovery dialog shown |
| Invalid and nothing else usable | `recovered` | Bad payload quarantined, new game, recovery dialog shown |
| `version` greater than 3 | `future` | Left untouched; session is not saved; dialog shown |
| Storage throws on read | `unavailable` | Plays in memory ("SESSION ONLY"); dialog shown |

Validation: every field is type-checked; numbers must be finite and are clamped (coins 0–9999, orbs and potions 0–99, other counts 0–9999, XP 0–450 (the level-15 cap), HP 0–max for level, position inside the map); IDs must exist; duplicates removed; `seen ⊇ caught`; every caught species has a team record; `active` must be caught; a locked region falls back to the meadow.

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

## Export and import

Issue [#30](https://github.com/King-Zalogon/mossvale/issues/30). A backup file is `{ kind: "mossvale-save-backup", format: 1, exportedAt, build, save: <v3 save> }`; a bare save payload is also accepted on import. See [BACKUP.md](BACKUP.md).

## Consistent import, new game and restore (#60)

Import, **New game**, restore checkpoint and restore archive change several keys (archive, primary, checkpoint). localStorage cannot do that atomically, so they commit through a journal (``save.js: commitSaveTransaction`):

1. The complete intent (`changes` for the archive, primary and checkpoint keys) is written to `mossvale-save-transaction` first. If that single write fails, nothing has changed and the operation reports failure with the current adventure untouched.
2. Once the journal is written, the operation is committed: the journal is authoritative (reads go through `readSaveItem`), the keys are copied from it, and the journal is removed.
3. If a copy fails (quota, denied), the live game and storage still agree. The next load, or the next save attempt, finishes the copy (`recoverSaveTransaction`) and reports `transaction-recovered`. While copies still cannot be written the status is `transaction-pending`: the game is read-only, says so, and **Backup & restore** can still export the adventure.
4. The archive is never replaced without the previous copy being part of the same committed intent, so a failure cannot leave the only recovery copy overwritten.

Covered by `tests/save-transaction.test.mjs` (fault injection at each write, quota and denied reads) and `tests/save-transaction.browser.mjs` (reload checks).
