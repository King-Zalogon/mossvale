#!/usr/bin/env python3
"""Generate the authored Rootglass Canopy / Hollow map pair (#278).

The geometry is intentionally data-driven and deterministic; run with --check to verify
the checked-in exports match this source. Existing region/save identities are untouched.
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAPS = ROOT / "dist/maps"
W, H = 60, 48


def blank():
    return [["."] * W for _ in range(H)]


def island(grid, cx, cy, rx, ry, edge=1.12):
    for y in range(H):
        for x in range(W):
            d = ((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2
            if d <= 1:
                grid[y][x] = "g"
            elif d <= edge:
                grid[y][x] = "w"


def path(grid, points, radius=1):
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        steps = max(abs(x1 - x0), abs(y1 - y0), 1) * 3
        for i in range(steps + 1):
            x = round(x0 + (x1 - x0) * i / steps)
            y = round(y0 + (y1 - y0) * i / steps)
            for dy in range(-radius, radius + 1):
                for dx in range(-radius, radius + 1):
                    if math.hypot(dx, dy) <= radius + .2 and grid[y + dy][x + dx] in "gpw":
                        grid[y + dy][x + dx] = "p"


def patch(grid, cx, cy, rx, ry, tile):
    for y in range(max(0, cy - ry), min(H, cy + ry + 1)):
        for x in range(max(0, cx - rx), min(W, cx + rx + 1)):
            if ((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2 <= 1 and grid[y][x] != ".":
                grid[y][x] = tile


def rows(grid):
    return ["".join(row) for row in grid]


def landmark(id_, kind, sprite, at, w, **extra):
    return {"id": id_, "kind": kind, "sprite": sprite, "at": list(at), "w": w, **extra}


def canopy():
    grid = blank()
    island(grid, 30, 24, 28, 21, 1.12)
    # Wind-scoured ridge cuts and two shallow pools separate wide exposed shelves.
    for y in range(4, 43):
        x = round(24 + 0.38 * (y - 4))
        for dx in range(-1, 2):
            if grid[y][x + dx] not in ".p":
                grid[y][x + dx] = "w"
    for x in range(19, 27):
        grid[22][x] = "p"  # old stone causeway across the ridge split
        grid[23][x] = "p"
    path(grid, [(7, 37), (12, 33), (18, 31), (23, 24), (29, 22), (37, 23), (46, 20), (54, 16)], 2)
    # Exposed upper ridge and a lower sheltered return form the primary loop.
    path(grid, [(10, 17), (18, 14), (30, 15), (39, 12), (50, 15), (54, 16)], 1)
    path(grid, [(12, 33), (19, 38), (29, 39), (39, 36), (48, 32), (54, 26)], 1)
    # Wind shelter pockets, clearly separate from the main route.
    path(grid, [(30, 22), (34, 27), (36, 31)], 1)
    patch(grid, 36, 31, 2, 2, "t")
    patch(grid, 14, 25, 2, 2, "t")
    patch(grid, 47, 25, 2, 2, "t")
    # A narrow spring-fed spill gives Brooklet a safe, optional shortcut.
    for y in range(31, 37):
        for x in range(48, 52):
            if grid[y][x] != ".":
                grid[y][x] = "w"
    path(grid, [(46, 33), (49, 33), (52, 34)], 1)
    for x in range(48, 51):
        grid[33][x] = "p"

    return {
        "format": 1,
        "id": "rootglass-canopy",
        "biome": "snowy-forest",
        "name": "Rootglass Canopy",
        "preview": "prop-rootglass-sentinel",
        "size": {"w": W, "h": H},
        "legend": {".": "void", "g": "ground", "p": "path", "w": "water", "t": "tallgrass"},
        "terrain": rows(grid),
        "spawns": {"camp": [12, 34], "pass-return": [12, 34], "hollow-return": [49, 32]},
        "landmarks": [
            landmark("glassbark-sentinel", "sign", "prop-rootglass-sentinel", (12, 29), 132,
                     label="Inspect the glass-barked tree", mapLabel="Glassbark Sentinel", discoveryText="The Glassbark Sentinel rises above the ridge; its roots carry a cold, steady murmur.",
                     lines=[{"text": "The pale glass bark catches the wind. At the roots, cold air rises with the sound of moving water. The old path bends south; the spring seems to run deeper."}]),
            landmark("wind-shelf", "sign", "prop-rim-overlook", (45, 12.7), 94,
                     label="Look across the canopy", mapLabel="Wind shelf", lines=[{"text": "From this shelf the glass tree is the tallest thing for miles. Below it, snowmelt vanishes into the roots."}]),
            landmark("pass-return-clue", "sign", "tree-fir-slim", (12, 34), 48,
                     label="Read the weathered trail marks", mapLabel="Pass trail", text="The pines thin to the west, where the old pass loops back toward the grove."),
            landmark("root-stair-clue", "sign", "prop-rootglass-hollow", (30, 38.5), 68,
                     label="Listen beneath the roots", mapLabel="Root stair", text="A low, steady rush rises from beneath the glassbark. A worn stair descends into the spring chambers."),
            landmark("root-seep-clue", "sign", "prop-icefall-ledge", (47.2, 30.4), 76,
                     secret=True, routeHint="rootglass-seep", label="Listen at the seep", mapLabel="Root seep", discoveryText="Root seep: water threads beneath the ridge, where Brooklet may find a way through.", lines=[{"text": "Water threads between the roots and under the rock. A Brooklet might follow the current through the narrow seam."}]),
            landmark("canopy-cache", "chest", "chest-pine-frost", (17.5, 17.2), 45,
                     solid=0.45, label="Open the ridge cache", flag="rootglass-canopy.chest", reward={"coins": 8, "potions": 1, "orbs": 1}),
        ],
        "exits": [
            {"id": "frostveil-return", "sprite": "signpost-wood", "at": [8, 38], "w": 38, "label": "Return to Frostveil Pass", "to": {"map": "frostveil-pass", "spawn": "rootglass-return"}},
            {"id": "hollow-stair", "sprite": "prop-rootglass-hollow", "at": [29, 41], "w": 100, "label": "Descend to Rootglass Hollow", "to": {"map": "rootglass-hollow", "spawn": "canopy-entry"}},
            {"id": "brooklet-seep", "sprite": "prop-icefall-ledge", "at": [50, 33], "w": 75, "label": "Follow the water under the roots", "to": {"map": "rootglass-hollow", "spawn": "spring-seep"},
             "route": {"id": "rootglass-seep", "requires": {"ability": "cross-shallow-water"}, "hint": "The current is too tight to cross here. Brooklet could feel a way through.", "unlockedText": "Brooklet finds a narrow water path beneath the glass roots. A shortcut to the spring is open.", "reward": {"orbs": 1}}},
        ],
        "props": [
            {"sprite": "tree-pine-snow", "kind": "scenery", "w": 82, "solid": 0.55, "at": [[9, 11], [15, 9], [40, 8], [53, 23], [11, 29], [39, 41], [21, 5]]},
            {"sprite": "tree-fir-slim", "kind": "scenery", "w": 57, "solid": 0.35, "at": [[5, 20], [18, 6], [43, 6], [55, 30], [20, 43], [39, 29]]},
            {"sprite": "boulder-mossy", "kind": "scenery", "w": 45, "solid": 0.35, "at": [[6, 28], [21, 18], [42, 19], [31, 35], [54, 21]]},
            {"sprite": "grass-tuft", "kind": "grass", "w": 24, "at": [[12, 23], [16, 28], [34, 10], [41, 25], [34, 34], [52, 12]]},
        ],
        "zones": [
            {"id": "canopy-ferns", "terrain": ["t"], "pool": ["duskwing", "frostowl"], "level": [7, 9], "distance": [12, 24]},
        ],
        "quiet": [{"id": "glassbark-approach", "rect": [25, 18, 35, 25], "label": "Glassbark clearing"}],
    }


def hollow():
    grid = blank()
    island(grid, 30, 25, 28, 21, 1.12)
    # Short chambers wrap around three reflective pools; stone ribs make readable forks.
    patch(grid, 18, 18, 5, 3, "w")
    patch(grid, 39, 21, 4, 5, "w")
    patch(grid, 30, 31, 6, 3, "w")
    path(grid, [(29, 42), (29, 35), (22, 29), (17, 23), (21, 17), (29, 14), (39, 16), (47, 22), (42, 29), (35, 34), (29, 35)], 1)
    path(grid, [(29, 35), (37, 38), (46, 35), (50, 31)], 1)
    path(grid, [(29, 14), (30, 8), (35, 6)], 1)
    # Crystal spring chamber and root-garden alcove are optional quiet detours.
    patch(grid, 34, 8, 2, 2, "t")
    patch(grid, 47, 35, 2, 2, "t")
    # Leave the spring reflective and impassable; the walk loops around its shore.
    for x, y in [(18, 18), (39, 21), (30, 31)]:
        grid[y][x] = "w"
    return {
        "format": 1,
        "id": "rootglass-hollow",
        "biome": "snowy-forest",
        "name": "Rootglass Hollow",
        "preview": "prop-rootglass-hollow",
        "size": {"w": W, "h": H},
        "legend": {".": "void", "g": "ground", "p": "path", "w": "water", "t": "tallgrass"},
        "terrain": rows(grid),
        "spawns": {"camp": [29, 42], "canopy-entry": [29, 42], "spring-seep": [49, 32], "canopy-return": [30, 7]},
        "landmarks": [
            landmark("root-arch", "sign", "prop-rootglass-hollow", (30, 12.3), 155,
                     label="Inspect the living roots", mapLabel="Rootglass spring", discoveryText="A spring shines under the living roots; the stream runs back beneath the ridge.",
                     lines=[{"text": "The glassbark's roots hold the cavern roof in a wide arch. Water returns to the ridge through a seam too narrow to follow without help."}]),
            landmark("echo-pool", "sign", "prop-well-ruined", (17, 22), 57,
                     label="Listen at the echo pool", mapLabel="Echo pool", lines=[{"text": "Drops ring against the pool and answer from somewhere above. These chambers are short, but every stream leads back to the great roots."}]),
            landmark("canopy-ascent-clue", "sign", "prop-rootglass-sentinel", (29, 39.5), 58,
                     label="Read the root-carved marks", mapLabel="Canopy stair", text="The roots grow outward toward the upper ridge. Climb the worn stair to return to the canopy."),
            landmark("spring-seam-clue", "sign", "prop-icefall-ledge", (47, 31.5), 52,
                     label="Follow the spring marks", mapLabel="Spring seam", text="A narrow stream runs west beneath the roots. It leads back toward the bright canopy."),
            landmark("root-chest", "chest", "chest-pine-frost", (48, 36), 45,
                     solid=0.45, label="Open the root cache", flag="rootglass-hollow.chest", reward={"coins": 10, "potions": 1, "orbs": 1}),
        ],
        "exits": [
            {"id": "canopy-return", "sprite": "prop-rootglass-hollow", "at": [29, 43], "w": 94, "label": "Climb to Rootglass Canopy", "to": {"map": "rootglass-canopy", "spawn": "hollow-return"}},
            {"id": "seep-return", "sprite": "prop-icefall-ledge", "at": [48, 32], "w": 68, "label": "Return through the water seam", "to": {"map": "rootglass-canopy", "spawn": "hollow-return"}},
            {"id": "upper-root-return", "sprite": "prop-icefall-ledge", "at": [35, 6], "w": 65, "label": "Return by the upper root stair", "to": {"map": "rootglass-canopy", "spawn": "hollow-return"}},
        ],
        "props": [
            {"sprite": "tree-oak-hollow", "kind": "scenery", "w": 77, "solid": 0.55, "at": [[12, 18], [49, 17], [20, 35], [42, 9]]},
            {"sprite": "prop-hanging-lantern", "kind": "scenery", "w": 48, "solid": 0.3, "at": [[13, 14], [44, 13], [24, 34], [46, 30]]},
            {"sprite": "rock-field-large", "kind": "scenery", "w": 62, "solid": 0.55, "at": [[10, 25], [25, 12], [44, 26], [37, 38]]},
            {"sprite": "rock-field-small", "kind": "scenery", "w": 29, "at": [[15, 29], [24, 8], [42, 31], [34, 37], [51, 26]]},
            {"sprite": "grass-tuft", "kind": "grass", "w": 22, "at": [[32, 9], [35, 10], [46, 35], [48, 36]]},
        ],
        "zones": [
            {"id": "rootglass-deep", "terrain": ["t"], "pool": ["pebblit", "hushram"], "level": [8, 10], "distance": [10, 20]},
        ],
        "quiet": [
            {"id": "spring-approach", "rect": [25, 8, 38, 17], "label": "Root spring"},
            {"id": "lower-root-walk", "rect": [26, 37, 34, 43], "label": "Lower roots"},
        ],
    }


def main():
    outputs = {"rootglass-canopy": canopy(), "rootglass-hollow": hollow()}
    for map_id, value in outputs.items():
        path_out = MAPS / f"{map_id}.json"
        encoded = json.dumps(value, indent=2, ensure_ascii=False) + "\n"
        if "--check" in sys.argv:
            try:
                current = json.loads(path_out.read_text(encoding="utf-8"))
            except (FileNotFoundError, json.JSONDecodeError):
                current = None
            if current != value:
                raise SystemExit(f"{path_out.relative_to(ROOT)} is stale; run python3 scripts/gen-rootglass.py")
        else:
            path_out.write_text(encoded, encoding="utf-8")


if __name__ == "__main__":
    main()
