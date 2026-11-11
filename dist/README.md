# dist/ is hand-written source

`dist/` is the **game's source and the root that `npm start` serves**. Edit it. It is not build output: `npm run build` writes `build/`, and the private site serves a copy under `public/game/`. (The name is historical; renaming it was considered and rejected in #448 because it would conflict with every open branch, doc and test.)

- `index.html`, `style.css`, `src/`, `maps/`, `assets/`, `resources/`: shipped to players.
- Top-level `*.html`/`*.css` other than `index.html` and `style.css` (map editor, creature/character previews, `testing.html`) and `reviews/`: development tools. Production builds leave them out (`scripts/lib/dev-pages.mjs`); `npm run build -- --with-dev-pages` keeps them for local authoring builds. Moving them under `dist/dev/` remains an option in #448 once the pull-request queue is quiet.
