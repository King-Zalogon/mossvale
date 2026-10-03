# Save backup and restore

Issue [#30](https://github.com/King-Zalogon/mossvale/issues/30). Code: `dist/src/services/backup.js` (pure parsing and storage writes) and the "Backup & restore" view of the menu (title screen or Esc).

Saves live in this browser, on this address, only: the hosted game and `localhost` do not share progress. To move progress:

1. **Export**: Menu → Backup & restore → *Export save file*. You get `mossvale-save-YYYY-MM-DD.json`: a small envelope (`kind`, `exportedAt`, `build`) around the normal v4 save.
2. **Import**: in the other browser, Menu → Backup & restore → *Import save file…*, pick the file. You see a preview of the file and of your current adventure (friends, seals, playtime) and confirm with *Replace my current adventure*. The page reloads on the imported progress.

Safety:

- A file is validated like any save: size limit (1 MB), JSON, schema. Files from a newer game version, unsupported versions and anything that does not look like a Mossvale save are refused with a plain message, and **nothing is changed**. Valid content is sanitized the same way as a normal load (caps, IDs, team).
- Before replacing, the current adventure is kept in the single backup slot (the same one *New game* uses; the menu warns when a different backup would be replaced) and can be brought back with *Restore previous adventure*.
- *Restore the checkpoint from your last session* puts back the copy taken when the game last started successfully (useful after a bad session); the current save is archived first.
- Import and checkpoint restore are disabled when the save is read-only (newer schema, or storage unavailable); export always works.

Not included, by design: named slots, cloud sync, accounts.
