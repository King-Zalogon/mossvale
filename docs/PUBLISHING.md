# Traceable builds and rollback

Issue [#21](https://github.com/King-Zalogon/mossvale/issues/21). What this repository can do on its own, and what it cannot know.

## What is established

- The game is static files (`dist/`). Anything that serves that folder plays it.
- Every push and pull request runs CI on Ubuntu and Windows (`.github/workflows/ci.yml`). Each run builds the game and keeps a GitHub Actions artifact named `mossvale-<full commit sha>-ubuntu-latest` or `mossvale-<full commit sha>-windows-latest` for 90 days. The artifact contains a complete, stamped copy for exactly that commit; use one only when its run is green.
- `npm run build` writes `build/` (a copy of `dist/` plus `version.json`: commit, short commit, branch, whether the tree was dirty, build time and the save schema). The title and Escape menus show `Build #abcdef0 · 2026-10-01`, or "development build" when no stamp exists, so you can tell which commit you are playing.
- Packaged builds may set `MOSSVALE_PORTAL_RETURN_URL` to a public HTTPS workspace URL; the in-game menu then offers **Return to dashboard** after saving. Without it, the standalone game has no portal link. The build script puts only this URL into `src/build-config.js`; private gate keys never enter the static game files.
- For quick local development, `npm start` serves the current working `dist/` files and exposes its live commit, branch and dirty state in `version.json`. For a stamped snapshot, run `npm run build:game` and serve `build/` (for example, `py -m http.server 8080 --directory build` on Windows or `python3 -m http.server 8080 --directory build` elsewhere).
- Frozen saves from supported schema generations live in `tests/fixtures/saves/` and tests fail if one stops loading or changes meaning ([SAVE_FORMAT.md](SAVE_FORMAT.md)). Forward migrations preserve older saves. If a rollback build is older than a save's schema, it leaves the save untouched and read-only; export a backup before trying a downgrade.
- Checked 2026-10-03 through the GitHub API: the repository **is public** (`visibility: public`). Nothing here changed that.
- The owner’s current instruction is to leave both repository visibility and the hosted game audience unchanged. This repository does not push or deploy the site, so a merged commit is not represented as a published playable update.

## What this repository does not know

- How the hosted site (the link in the README) receives its files. The roadmap describes the source as a snapshot imported from a separately hosted Sites repository; nothing in this repo publishes to it, and no deployment credentials are stored here. Until that is checked, treat "main changed" and "the site changed" as unrelated events.
- The audience of the hosted site. Publishing must keep it as it is today; nothing in this repo touches it.
- Source visibility is separate from site access: a private game site does not make this repository private. Making the repository private is a GitHub settings change for the owner; it is recorded as a decision to take, not something assumed done.

## A simple publish and rollback routine

1. Choose the exact commit to play. Wait for its CI run to finish green on both platforms.
2. Download an artifact named `mossvale-<full sha>-<runner>` from that run, or check out the exact commit and run `npm ci && npm run build`. Check `build/version.json` shows the commit you chose and `dirty: false`.
3. Serve `build/` locally to try the stamped snapshot. If you publish it to a static host, upload the contents of `build/`; this repository does not publish to the existing hosted site automatically.
4. Record the full commit SHA and the Actions run/artifact name with the play notes. Artifacts expire after 90 days; an optional Git tag on an accepted build preserves a durable name and lets CI rebuild the same source later.
5. **Roll back** by serving or deploying the artifact of the last known-good commit. Before a rollback, export a save backup. If the older code cannot read the newer save schema, the game keeps the save untouched and read-only ("Newer save found") until a compatible build is restored.

## Optional later

Automatic upload to the host is possible once the host's import mechanism and credentials are known; it is deliberately not guessed at here.
