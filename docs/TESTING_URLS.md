# Local review pages

Open **Testing URLs** from the title screen or in-game menu. It opens `testing.html` in a new tab and leaves the adventure tab open. The index works with `npm start`, a static server serving `dist/`, a packaged build and a build mounted below a path such as `/game/`; links are relative to that build. These pages use the current build's shipped assets. Existing hosting access rules continue to apply.

| Page | What to review |
| --- | --- |
| `creature-follower-preview.html` | All registered creatures, eight facings, idle/four-frame walk, own-motion turns, retained facing at rest, reduced motion and foreground occlusion at gameplay scale. |
| `creature-combat-preview.html` | Creature combat idle, attack, hit, faint and capture states with calm-motion playback. |
| `character-preview.html` | Red-cap player walk/idle directions and reusable traveler/gardener appearances. |
| `player-idle-review.html` | Neutral standing pose compared with walking poses in all directions. |
| `map-editor.html` | Map Workshop topology, authored terrain and terrain-family compilation. Editing remains in workshop memory until an explicit export or edited-map play action. |

The index keeps each opened review in a separate tab. Close it to return to the index or use its Mossvale link to open the game. The index itself also has a Mossvale return link. It contains no debug cheats, credentials, grant changes, save mutations or server-only API links. The separately served authoring catalogue is available through `npm run catalogue:browse`; it is not a static game URL.

The follower preview derives the creature list and atlas rows/mirroring from the canonical species registry and asset manifest. It uses the game's normalized `movementFacing`, stride-based `playerFrame`/`followerFrame`, `directionPose` and player mirroring. Facing follows the follower's own displacement, not the player's direction. A stopped or manually paused follower uses idle and retains its last direction; reduced motion keeps facing changes while using idle cells. The trail demonstration is illustrative, not an adventure collision or acquisition test.

Regression coverage: `tests/creature-follower.browser.mjs` checks actual stage draw rows in all eight directions, including nonstandard row orders, small displacements, idle, manual pause and calm motion. `tests/testing-urls.browser.mjs` exercises keyboard title-menu and touch in-game-menu access, every index destination, safe new tabs and source/packaged paths. Both run in `npm run verify`.

Owner feedback recorded for the Sunsifter/Rillume batch (#290/#291): “Los sprites están muy bien.” This is artwork approval; normal-play enjoyment/balance acceptance remains separate. The reported follower-preview facing bug is tracked in #318 and does not invalidate the runtime-facing behavior already observed by the owner.
