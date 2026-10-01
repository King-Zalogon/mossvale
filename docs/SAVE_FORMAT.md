# Save format and recovery

Implemented in `dist/src/save.js` (pure, tested without a browser). Issue: [#8](https://github.com/King-Zalogon/mossvale/issues/8).

## Storage keys

| Key | Purpose |
| --- | --- |
| `mossvale-v3` | Current save (schema 3, stable string IDs). The only key the game writes progress to. |
| `mossvale-backup` | Checkpoint of the last valid v3 save, copied once at each successful start. |
| `mossvale-quarantine` | Up to the 3 most recent unreadable payloads (`key`, `reason`, `at`, `raw`). Never auto-deleted. |
| `mossvale-v2`, `mossvale-v1` | Legacy saves. Read for migration only and left untouched. |

## Schema 3

Species and regions are stored by ID, not array position, so content can be reordered or extended safely. Current IDs: species `fernling emberkin brooklet duskwing voltkit mushmallow frostowl pebblit`; regions `meadow amber-ridge frostveil-grove`. Never rename or reuse an ID.

Fields: `version, region, x, y, active, orbs, potions, coins, seen[], caught[], team{speciesId:{xp,hp}}, badges[], chests[], visited[], met, wins, playTime`. In memory the game still uses indexes; `save.js` converts at the load/serialize boundary.

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

Validation: every field is type-checked; numbers must be finite and are clamped (counts 0–9999, XP 0–4275, HP 0–max for level, position inside the map); IDs must exist; duplicates removed; `seen ⊇ caught`; every caught species has a team record; `active` must be caught; a locked region falls back to the meadow.

## Tests

`npm test` (codec fixtures in `tests/save.test.mjs`), `npm run test:browser` (needs Playwright + Chromium).
