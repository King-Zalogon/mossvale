# Movement, collision and the companion

Issue [#15](https://github.com/King-Zalogon/mossvale/issues/15). Code: `dist/src/domain/exploration.js` (movement, trail), `domain/mapdata.js` (`walkableAt`), `domain/world.js` (`isWalkable`, `nearestWalkable`). Numbers: `dist/src/config.js`.

- **Eight directions, one speed.** Input becomes a screen direction; the world step is normalized so all eight directions cover the same ground per second (walk 2.8, run 4.7 tiles/s).
- **Frame-rate independent.** Each frame is split into 1/60 s slices (`MOVE_STEP`), so distance walked and collisions are the same at 20 or 144 fps, and a long hitch cannot jump through water.
- **One footprint.** The player stands on a `PLAYER_RADIUS` (0.25 tile) footprint: terrain is sampled at its four corners (void and water block) and solid props are circles. The same function (`walkableAt`) validates maps, so a map that validates can be walked. Shorelines and solid props retain the same footprint collision checks. When a step is blocked, movement tests both world-axis and screen-axis component orders and keeps the walkable result closest to the requested step, so isometric diagonals can slide along house and tree boundaries without tunneling.
- **Narrow routes.** Map validation flood-fills over 4-neighbour tiles (a diagonal gap is too narrow for the footprint), then checks every landmark, exit and encounter zone is reachable.
- **Stuck recovery.** If the player ever stands somewhere unwalkable (bad save position, map edit), the game moves them to the nearest standing spot, or to camp if there is none. "Return to camp" in the side panel remains the manual escape.
- **Companion.** The companion trails the player along every recorded simulation step (`FOLLOW_GAP` 1 tile behind) and interpolates its exact place on that path, so it can never be on water or inside a prop. Its four walk frames advance every 0.72 traveled tiles (about a 1.0-second cycle at walking speed), with a subtle gait bob synchronized to the cycle. It starts on the nearest free ground beside the player and restarts after travel, camp and defeat.
- **Transitions.** Arriving on a new map fades in from dark (skipped with calm motion). Pressing interact twice within 250 ms does nothing the second time.
- **Zoom.** The zoom you choose is saved and survives resizing; without a saved zoom the default depends on screen width.

Not changed: walk/run speeds (tune from play feedback), camera follow smoothing, and camera bounds (the island is small and the player cannot leave it).
