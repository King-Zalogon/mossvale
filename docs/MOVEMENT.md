# Movement, collision and the companion

Issue [#15](https://github.com/King-Zalogon/mossvale/issues/15). Code: `dist/src/domain/exploration.js` (movement, trail), `domain/mapdata.js` (`walkableAt`), `domain/world.js` (`isWalkable`, `nearestWalkable`). Numbers: `dist/src/config.js`.

- **Eight directions, one speed.** Input becomes a screen direction; the world step is normalized so all eight directions cover the same ground per second (walk 2.8, run 4.7 tiles/s).
- **Frame-rate independent.** Each frame is split into 1/60 s slices (`MOVE_STEP`), so distance walked and collisions are the same at 20 or 144 fps, and a long hitch cannot jump through water.
- **One footprint.** The player stands on a `PLAYER_RADIUS` (0.25 tile) footprint: terrain is sampled at its four corners (void and water block) and solid props are circles. The same function (`walkableAt`) validates maps, so a map that validates can be walked. Shorelines and solid props retain the same footprint collision checks. When a step is blocked, movement tests both world-axis and screen-axis component orders and keeps the walkable result closest to the requested step, so isometric diagonals can slide along house and tree boundaries without tunneling.
- **Narrow routes.** Map validation flood-fills over 4-neighbour tiles (a diagonal gap is too narrow for the footprint), then checks every landmark, exit and encounter zone is reachable.
- **Stuck recovery.** If the player ever stands somewhere unwalkable (bad save position, map edit), the game moves them to the nearest standing spot, or to camp if there is none. "Return to camp" in the side panel remains the manual escape.
- **Companion.** The companion trails the player along every recorded simulation step (`FOLLOW_GAP` 1 tile behind) and interpolates its exact place on that path, so it can never be on water or inside a prop. Its four walk frames advance every 0.56 traveled tiles (about a 0.8-second cycle at walking speed), matching the player's stride distance. Walking cells keep the feet anchored without a separate vertical bob; idle retains a subtle bob. It starts on the nearest free ground beside the player and restarts after travel, camp and defeat.
- **Transitions.** Arriving on a new map fades in from dark (skipped with calm motion). Pressing interact twice within 250 ms does nothing the second time.
- **Zoom.** The zoom you choose is saved and survives resizing; without a saved zoom the default depends on screen width.

Not changed: walk/run speeds (tune from play feedback), camera follow smoothing, and camera bounds (the island is small and the player cannot leave it).

## Movement controls and input method

The movement HUD initially uses the browser's primary pointer: coarse starts with touch controls; fine starts with desktop instructions. Available touch hardware alone does not force the pad onto a touchscreen laptop's keyboard/mouse session. Actual touch or pen presses reveal the pad and Run. The eight touch directions stay dimly visible at rest; pressing one reveals and highlights it immediately, and dragging across the pad changes direction during the same press. The pad fades back after release. Mouse presses and keyboard movement switch to desktop presentation; keyboard reading/menu navigation does not change the movement method. The screen width controls layout, not which input method is active.

Changing movement method releases held keys/captured touch movement, and focus moves from a hidden pad/Run button back to the canvas. Run preferences remain intact. Mode is temporary UI state and does not change the save format. Phone rotation and fullscreen retain the current method; touch dragging still changes direction continuously. Browser regression: `tests/input-mode.browser.mjs`; responsive/fullscreen regression: `tests/responsive-journal.browser.mjs`. The hybrid case combines emulated fine/coarse capabilities with real Chromium touch/key events; physical hardware coverage remains #35.
