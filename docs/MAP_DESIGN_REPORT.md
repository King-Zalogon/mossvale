# Spatial design report

Run `npm run maps:design-report` after changing map geometry or before a map playtest. The command first validates the shipped adventure through the normal pack/map validator, then writes `build/map-design-report/report.md`, `report.json`, and one zoomable SVG per map. Use `--out <directory>` to choose a different output location. The final terminal table summarizes all maps.

## Reading the report

- **Reachable coverage** compares walkable tile centers with those reachable from any authored spawn. A gap points to geometry to inspect; normal map validation already rejects required entities the game cannot reach.
- **Journey probes** list each spawn and required/optional destination. Route length counts adjacent tile-center moves (diagonal moves count as one step). An alternate path is a vertex-disjoint route: the report removes interior cells of the shortest route and checks whether another route remains.
- **Encounter exposure** divides tile steps spent in encounter zones by each zone's midpoint encounter interval. It is a comparative estimate, not a promised number of battles. It does not replay RNG or encounter cooldowns.
- **No safe return** means an exit has no reverse exit in the destination map without a progression gate or concealed-route requirement. Confirm intended one-way transitions with a designer.
- **Unreachable feature** means no walkable tile center falls within the runtime interaction radius. **Trigger in collision** means the trigger has no walkable center inside its activation radius.
- **Unavailable encounter zone** means no reachable tile activates that zone after the engine applies first-match precedence. This can expose an authored zone hidden entirely under an earlier footprint.
- **Rewardless branch** flags a dead-end corridor at least six tile centers long without a nearby shrine, cache, scene reward, or authored secret. A detected secret branch is listed as informational so authors can inspect its reveal and payoff without treating it as an error.
- **Missing wayfinding cue** is a prompt to inspect signs near exits. It only recognizes authored sign text and matching `routeHint` data; it cannot determine whether prose points in the wrong direction.
- **Repeated landmark silhouette** compares major landmark sprites within the map. It does not decide whether repeated art is intentional.

SVG overlays show collision at tile centers in red, encounter zones in dashed rose, quiet corridors in cyan, and separate symbols for spawns, exits with return status/destination, landmarks, and triggers. A green ring identifies an authored reward; dashed marker rings indicate concealed or secret content. The drawing is top-down so tile topology is legible; it is a diagnostic view, not the isometric gameplay camera.

All reported issues are design warnings, separate from schema/pack validation. Walk the highest-risk route in the game after reviewing the report, record whether the warning is intentional, and adjust one map element at a time. The graph uses the engine's collision function at integer tile centers and diagonal/cardinal directions, allowing a diagonal when at least one adjacent cardinal center is walkable. Runtime movement is continuous and slides along obstacles, so route length and alternate-path results are estimates. The report makes no automatic judgement about fun, pacing quality or whether a secret is fair.
