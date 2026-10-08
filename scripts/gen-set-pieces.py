#!/usr/bin/env python3
"""Compose authored set pieces (standing stones, groves, cairns, reed banks) from existing prop sprites.

Idempotent: every group this script writes carries a `piece` tag; re-running removes and re-places them.
Placement is deterministic and conservative: a piece needs a clear disc of open ground, away from paths,
quiet corridors, spawns, exits, landmarks, triggers and other props, so routes and encounters stay as authored.

    python3 scripts/gen-set-pieces.py            # rewrite dist/maps/*.json
    python3 scripts/gen-set-pieces.py --check    # exit 1 when a map is out of date
"""
import json, math, random, sys
from pathlib import Path

MAPS = Path(__file__).resolve().parent.parent / 'dist' / 'maps'

STONE = ('rock-spire-red', 'scenery', 71, 0.36)
BOULDER = ('boulder-mossy', 'scenery', 49, 0.42)
OAK = ('tree-oak', 'scenery', 79, 0.52)
PINE = ('tree-pine', 'scenery', 79, 0.52)
SNOWPINE = ('tree-pine-snow', 'scenery', 79, 0.52)
CATTAIL = ('cattail-clump', 'scenery', 43, 0.28)
BUSH = ('bush-flowering', 'flower', 32, None)


def ring(sprite, n, r, start=0.0, skip=()):
    return [(sprite, r * math.cos(start + 2 * math.pi * i / n), r * math.sin(start + 2 * math.pi * i / n)) for i in range(n) if i not in skip]


PIECES = {
    # six standing stones around an open floor, one pair of boulders as lintel
    'standing-stones': (3.4, ring(STONE, 6, 2.6, 0.3) + [(BUSH, 0.0, 0.0), (BOULDER, 0.0, 1.0)]),
    # an oak ring with a clearing, entrance to the south-east
    'oak-grove': (4.4, ring(OAK, 7, 3.4, 0.9, skip=(0,)) + [(BUSH, -0.8, 0.3), (BUSH, 0.7, -0.6), (BUSH, 0.4, 0.9)]),
    'pine-grove': (4.4, ring(PINE, 7, 3.4, 0.9, skip=(0,)) + [(BUSH, 0.2, 0.2)]),
    'snow-grove': (4.4, ring(SNOWPINE, 7, 3.4, 0.9, skip=(0,)) + [(BOULDER, 0.3, 0.2)]),
    # a small ruined cluster: boulders leaning together
    'cairn': (2.6, [(BOULDER, 0.0, 0.0), (BOULDER, 1.5, 0.5), (BOULDER, 0.6, -1.4), (BUSH, -1.1, 0.8), (BUSH, 1.9, -0.6)]),
    # reeds and flowers hugging a shoreline
    'reed-bank': (2.0, [(CATTAIL, i * 0.9 - 1.8 + (j % 2) * 0.25, j * 0.7 - 0.7) for i in range(5) for j in range(2)] + [(BUSH, 0.0, 1.4)]),
}

RECIPES = {
    'meadow': ['oak-grove', 'oak-grove', 'pine-grove', 'cairn', 'cairn'],
    'orchard-ruins': ['oak-grove', 'oak-grove', 'cairn', 'cairn', 'cairn'],
    'reedfen-wetlands': ['reed-bank'] * 5 + ['cairn'],
    'stilt-isles': ['reed-bank'] * 4,
    'amber-ridge': ['standing-stones', 'standing-stones', 'cairn', 'cairn', 'cairn'],
    'stone-basin': ['standing-stones', 'standing-stones', 'cairn', 'cairn'],
    'frostveil-grove': ['snow-grove', 'snow-grove', 'cairn', 'cairn'],
    'frostveil-pass': ['snow-grove', 'cairn', 'cairn'],
}
# keep the original hub of the first map exactly as playtested
PROTECTED = {'meadow': (0, 0, 26, 26)}


def land(ch):
    return ch in 'gt'


def pieces_in(m):
    return [g for g in m.get('props', []) if 'piece' in g]


def place(m, name, rng, used):
    radius, parts = PIECES[name]
    terrain = m['terrain']
    w, h = m['size']['w'], m['size']['h']
    quiet = [q['rect'] for q in m.get('quiet', [])]
    avoid = [tuple(p) for p in m.get('spawns', {}).values()]
    avoid += [tuple(e['at']) for e in m.get('exits', [])]
    avoid += [tuple(l['at']) for l in m.get('landmarks', [])]
    avoid += [tuple(t['at']) for t in m.get('triggers', [])]
    avoid_r = [5.0] * len(avoid)
    for t_i, t in enumerate(m.get('triggers', [])):
        avoid_r[len(avoid) - len(m['triggers']) + t_i] = 5.0 + t.get('radius', 2)
    protected = PROTECTED.get(m['id'])
    for _ in range(4000):
        cx, cy = rng.uniform(4, w - 4), rng.uniform(4, h - 4)
        if protected and protected[0] - radius <= cx <= protected[2] + radius and protected[1] - radius <= cy <= protected[3] + radius:
            continue
        if any(q[0] - radius <= cx <= q[2] + radius and q[1] - radius <= cy <= q[3] + radius for q in quiet):
            continue
        if any(math.hypot(cx - ax, cy - ay) < r + radius for (ax, ay), r in zip(avoid, avoid_r)):
            continue
        if any(math.hypot(cx - ux, cy - uy) < radius + ur + 2 for ux, uy, ur in used):
            continue
        bank = name == 'reed-bank'
        ok, shore = True, False
        reach = math.ceil(radius) + 1
        for ty in range(int(cy) - reach, int(cy) + reach + 1):
            for tx in range(int(cx) - reach, int(cx) + reach + 1):
                if not (0 <= tx < w and 0 <= ty < h):
                    ok = False
                    continue
                if math.hypot(tx + 0.5 - cx, ty + 0.5 - cy) > (radius + 0.3 if bank else radius * 0.75):
                    continue
                ch = terrain[ty][tx]
                if ch == 'p' or ch == '.' or (ch == 'w' and not bank):
                    ok = False
                shore = shore or ch == 'w'
        if not ok or (bank and not shore):
            continue
        # every part must stand on land
        pts = [(s, round(cx + dx, 1), round(cy + dy, 1)) for s, dx, dy in parts]
        pts = [q for q in pts if 0 <= q[1] < w and 0 <= q[2] < h and land(terrain[int(q[2])][int(q[1])])]
        if len(pts) < 0.8 * len(parts):
            continue
        used.append((cx, cy, radius))
        return pts
    return None


def build(m):
    rng = random.Random(f"pieces:{m['id']}")
    m['props'] = [g for g in m.get('props', []) if 'piece' not in g]
    used = []
    for i, name in enumerate(RECIPES[m['id']]):
        pts = place(m, name, rng, used)
        if pts is None:
            raise SystemExit(f"{m['id']}: no room for {name} #{i}")
        by_sprite = {}
        for (sprite, kind, w, solid), x, y in pts:
            by_sprite.setdefault((sprite, kind, w, solid), []).append([round(x, 1), round(y, 1)])
        for (sprite, kind, w, solid), at in by_sprite.items():
            g = {'sprite': sprite, 'kind': kind, 'w': w}
            if solid:
                g['solid'] = solid
            g['at'] = at
            g['piece'] = f'{name}-{i + 1}'
            m['props'].append(g)
    return m


def main():
    check = '--check' in sys.argv
    stale = []
    writes = {}
    for map_id in RECIPES:
        path = MAPS / f'{map_id}.json'
        before = path.read_text()
        m = build(json.loads(before))
        after = json.dumps(m, indent=2) + '\n'
        if m != json.loads(before):
            stale.append(map_id)
            writes[path] = after
    if not check:
        for path, text in writes.items():
            path.write_text(text)
    if check and stale:
        print('out of date:', ', '.join(stale))
        sys.exit(1)
    print('updated' if stale else 'unchanged', ', '.join(stale))


main()
