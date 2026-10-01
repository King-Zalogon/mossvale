# Traceable private updates

Issue [#21](https://github.com/King-Zalogon/mossvale/issues/21). What this repository can do on its own, and what it cannot know.

## What is established

- The game is static files (`dist/`). Anything that serves that folder plays it.
- Every push and pull request runs CI (`.github/workflows/ci.yml`). It also runs `npm run build` and keeps the result as a GitHub Actions artifact named `mossvale-<commit sha>` for 90 days: a complete, stamped copy of the game for exactly that commit.
- `npm run build` writes `build/` (a copy of `dist/` plus `version.json`: commit, short commit, branch, whether the tree was dirty, build time and the save schema). The in-game menu shows `build abcdef0 · 2026-10-01`, or "development build" when no stamp exists, so you can tell which commit you are playing.
- Saves are compatible across updates: frozen saves from every schema generation live in `tests/fixtures/saves/` and `npm test` fails if one stops loading or changes meaning ([SAVE_FORMAT.md](SAVE_FORMAT.md)). Preferences and the "new game" backup are separate keys that updates never touch.
- Checked 2026-10-01 through the GitHub API: the repository **is public** (`visibility: public`). Nothing here changed that.

## What this repository does not know

- How the hosted site (the link in the README) receives its files. The roadmap describes the source as a snapshot imported from a separately hosted Sites repository; nothing in this repo publishes to it, and no deployment credentials are stored here. Until that is checked, treat "main changed" and "the site changed" as unrelated events.
- The audience of the hosted site. Publishing must keep it as it is today; nothing in this repo touches it.
- Source visibility is separate from site access: a private game site does not make this repository private. Making the repository private is a GitHub settings change for the owner; it is recorded as a decision to take, not something assumed done.

## A simple publish and rollback routine

1. Merge to `main` (or push) and wait for the **CI** check to go green. A red check is visible on the commit but does not block anything.
2. Download the `mossvale-<sha>` artifact of the commit you want from the run's page, or run `npm ci && npm run build` on that commit locally. Check `build/version.json` shows the commit you expect.
3. Upload the contents of `build/` to the hosting you use (the audience stays whatever it already is). Play for a minute: the menu should show the new build label, and an existing save should show Continue with its progress.
4. Optional: tag what you published, e.g. `git tag play-2026-10-01 <sha> && git push origin play-2026-10-01`, so the exact version has a name.
5. **Roll back** by repeating steps 2–3 with the artifact (or tag) of the last good commit. Saves keep working because newer builds only add optional fields; if a rollback goes to a build that is older than your save's schema, the game keeps the save untouched and plays read-only rather than overwrite it ("Newer save found").

## Optional later

Automatic upload to the host is possible once the host's import mechanism and credentials are known; it is deliberately not guessed at here.
