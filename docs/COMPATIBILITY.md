# Pack and save compatibility

Issue [#283](https://github.com/King-Zalogon/mossvale/issues/283). The contract lives in `dist/src/compatibility.js` (pure, tested in `tests/compatibility.test.mjs`); this page is what it means for authors and for engine changes.

## Audit: what happened before this contract

- A pack declared `requires: {engineVersion, saveSchema}` and the game accepted **only an exact match**. The error said `requires 99; this game supports 5` and never said whether to update the game or the pack.
- Missing, string, fractional or negative levels were reported with the same wording as a real mismatch.
- The pack `format` was checked by equality only.
- Saves were already safe: a newer save is `future` (never loaded, overwritten, downgraded or quarantined), another pack's save is `foreign`, and v1–v4 saves migrate in memory without rewriting the stored copy. Only the manifest side lacked a policy.
- Sharp edge that remains by design: the requirement hashes are not covered by `integrity` (they are metadata, not content), so they are only as honest as the tool that wrote them. `refresh-manifest`, `create-pack` and `build` always stamp the current levels.

## The contract

Every level is a positive **integer**; nothing compares dotted version strings.

| Level | Declared by | Meaning | Today's support window |
| --- | --- | --- | --- |
| `format` | pack manifest | Shape of `index.json` | 1 |
| `requires.engineVersion` | pack manifest | Capabilities the engine must provide | 1 |
| `requires.saveSchema` | pack manifest | Save layout the pack's progress is written in | 5 |
| `contentVersion` | pack manifest | Saved identities / progression semantics of this pack (see [PACKS.md](PACKS.md)) | any positive integer |

`SUPPORT` holds an inclusive `{min, max}` per level. The window is deliberately **one level wide** today, so oldest-supported, current and "too old" are all decided by the same code a wider window would use. The tests widen the window by injection to prove the in-between and boundary cases.

| Verdict (`assessPackRequirements`) | Cause | Message tells you to |
| --- | --- | --- |
| `compatible` | every level inside the window | nothing |
| `requires-newer-game` | a level above `max` | update the game or restore a build that supports it |
| `pack-too-old` | a level below `min` | port the pack deliberately to the current contract; never edit the numbers |
| `invalid` | missing / non-integer / non-positive / no `requires` object | fix the manifest; never coerced |

An invalid declaration outranks a newer one, which outranks an older one (updating the game is the cheaper fix).

## Order of events at startup

1. Fetch `index.json` only. Check format and requirements. A rejected pack stops here with the specific message: no other pack file, no save, checkpoint or archive has been read or written.
2. Verify every selected file's SHA-256, then open the save codec.
3. The codec classifies the stored save (`classifySaveSchema`): `current` loads, `migrate` is converted in memory and only rewritten by the next normal save, `future` is read-only and untouched, `invalid` is quarantined only when it is unreadable, never because it is newer.
4. A save for another pack is `foreign`; a save whose pack content version is newer than the installed pack is left untouched with a restore-the-matching-build explanation.

## Changing the window (engine maintainers)

- **Compatible engine update** (new optional capability, same layouts): bump nothing a pack declares. Add the capability to the catalogue with its status.
- **Save layout change**: raise `VERSION`, add a deterministic migration for the previous schema in `dist/src/save.js`, keep the storage keys and the recovery journal, add a frozen fixture to `tests/fixtures/saves/`, and decide `SUPPORT.saveSchema.min`. A migration must keep pack identity, stable creature/item/flag IDs, both backup copies on failure, once-only reward claims and account revision rules. There is no catch-all migration and no silent downgrade; add one only for a real change.
- **Engine capability change** that old packs cannot satisfy: raise `ENGINE_VERSION`; raise `SUPPORT.engineVersion.min` only when old packs genuinely cannot run, and say so in the release notes.
- Never reuse or rename a canonical ID. Retire it and add a new one.

## Builders

Your exported pack names the contract it was built for in `requires`. Run `npm run pack -- refresh-manifest <folder>` after a game update that you have checked your content against, then `validate-pack`, and `npm run adventure:report -- <folder>` to see the compatibility result next to the other checks. A `pack-too-old` result means content review, not a number change.

## Not covered yet

- No second independent pack at a different level exists, because the window is one level wide; the fixture packs under `tests/fixtures/packs/` all declare the current level and are checked by the test.
- The account-level (cloud) revision rules are exercised by the account tests, not by this page.
- No migration registry exists: there has been no real schema change since schema 5. When one ships, register it here and in `SAVE_FORMAT.md`.
