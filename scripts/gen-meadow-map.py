#!/usr/bin/env python3
"""One-off authoring aid for the large Sunlit Trail (#51): writes dist/maps/meadow.json.

Reuses the grid helpers of gen-wetland-maps.py. The map is plain data once written.
"""
import importlib.util, json, math, random
from pathlib import Path

spec = importlib.util.spec_from_file_location('wet', Path(__file__).with_name('gen-wetland-maps.py'))
wet = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wet)
Grid, patches, clear, LEGEND, ROOT = wet.Grid, wet.patches, wet.clear, wet.LEGEND, wet.ROOT


OLD = Path(__file__).with_name('meadow-hub.json')  # the original 25x25 Sunlit Trail, kept as the generator's source


def trees(g, rng, belts, avoid, per_belt):
    """Dense tree cover inside the given belt ellipses, never on or beside a trail."""
    oak, pine = [], []
    for (cx, cy, rx, ry), n in zip(belts, per_belt):
        placed = 0
        tries = 0
        while placed < n and tries < n * 80:
            tries += 1
            a = rng.uniform(0, math.tau)
            r = math.sqrt(rng.random())
            x, y = cx + math.cos(a) * rx * r, cy + math.sin(a) * ry * r
            if g.get(int(x), int(y)) not in 'gt' or g.near(x, y, 'p', 2) or g.near(x, y, 'w', 1):
                continue
            if any(math.hypot(x - ax, y - ay) < rr for ax, ay, rr in avoid):
                continue
            if any(math.hypot(x - ox, y - oy) < 1.5 for ox, oy in oak + pine):
                continue
            (oak if rng.random() < 0.55 else pine).append((round(x, 1), round(y, 1)))
            placed += 1
    return [[x, y] for x, y in oak], [[x, y] for x, y in pine]


def meadow():
    """The original 25x25 hub (camp, shrine, Iris, chest and tall grass keep their coordinates and flags) grows east
    and south into a large meadow; the old map is read from the git-tracked JSON so only the extension is generated."""
    rng = random.Random(51)
    old = json.loads(OLD.read_text())
    g = Grid(72, 64)
    for y, row in enumerate(old['terrain']):
        for x, ch in enumerate(row):
            g.c[y][x] = ch
    hub_land = {(x, y) for y in range(25) for x in range(25) if g.c[y][x] != '.'}
    for e in [(46, 28, 24, 21), (22, 46, 21, 14), (52, 52, 17, 10), (48, 8, 14, 7)]:
        g.ellipse(*e, 'g', only='.')
    g.rect(24, 8, 40, 16, 'g', only='.')  # land bridge east of the hub
    g.rect(8, 24, 17, 38, 'g', only='.')  # land bridge south of the hub
    g.rect(62, 25, 70, 35, 'g', only='.')  # orchard gate shelf
    # a ring of marsh water around the new land only
    outer = Grid(72, 64)
    for y in range(64):
        for x in range(72):
            outer.c[y][x] = g.c[y][x]
    g.ring('w', 2)
    for y in range(64):
        for x in range(72):
            if (x, y) in hub_land or (x < 25 and y < 25):
                g.c[y][x] = outer.c[y][x]
    for e in [(46, 11, 4.5, 3), (31, 41, 5, 3.5), (60, 46, 4, 2.5)]:
        g.ellipse(*e, 'w', only='g')
    wet.river(g, 40, 2.5, 7, 28, 62, 1.0)
    east = [(24, 12), (31, 13), (38, 17), (44, 23), (50, 28), (56, 30), (62, 30), (69, 30)]
    south = [(12, 24), (12, 31), (14, 38), (20, 44), (28, 48), (36, 50), (44, 50), (50, 46), (54, 40), (56, 31)]
    north_east = [(38, 17), (44, 12), (50, 8), (56, 6), (62, 8)]
    ridge = [(50, 28), (54, 22), (60, 18), (64, 14)]
    well = [(54, 22), (58, 24), (60, 26)]
    stream_cross = [(40, 30), (40, 38)]
    spur = [(44, 50), (46, 56), (52, 58)]
    for pth in (east, south, north_east, ridge, well, spur):
        g.path(pth)
    # the hidden cut-through: a narrow ground corridor under the trees, not drawn as a trail
    for x, y in [(24, 47), (24, 50), (25, 54), (28, 57), (32, 58), (36, 58), (40, 58), (44, 57), (46, 56)]:
        g.rect(x - 1, y - 1, x, y, 'g', only='gw.')
    patches(g, rng, [(30, 22, 5, 3), (42, 28, 4, 3), (48, 36, 5, 3), (60, 38, 4, 3), (62, 18, 4, 3), (32, 34, 3, 3), (22, 40, 4, 3), (40, 44, 4, 2.5), (56, 56, 4, 2.5), (18, 54, 4, 2.5), (52, 14, 3, 2), (30, 28, 3, 2)])
    for box in [(36, 14, 40, 20), (60, 27, 70, 33), (10, 26, 15, 32)]:
        clear(g, *box)
    L = {'well': (60.4, 26.8), 'hollow': (44.2, 56.4), 'east': (68.6, 30), 'cut': (24.6, 49)}
    keep = [(l['at'][0], l['at'][1], 2.4) for l in old['landmarks']]
    avoid = [(x, y, 2.4) for x, y in L.values()] + keep
    belts = [(32, 32, 7, 5), (48, 44, 7, 4), (60, 12, 6, 3), (30, 8, 5, 4), (22, 56, 8, 3), (58, 54, 7, 4), (66, 40, 4, 4), (40, 58, 6, 2)]
    oak, pine = trees(g, rng, belts, avoid, [24, 20, 16, 14, 24, 20, 12, 12])
    lone = wet.scatter(g, rng, 26, lambda x, y: x > 25 or y > 25, avoid + [(a, b, 1.2) for a, b in oak + pine])
    tuft = wet.scatter(g, rng, 120, lambda x, y: x > 25 or y > 25, avoid)
    bush = wet.scatter(g, rng, 34, lambda x, y: (x > 25 or y > 25) and not g.near(x, y, 'w', 1), avoid)

    def merged(sprite, extra):
        group = next(p for p in old['props'] if p['sprite'] == sprite)
        return {**group, 'at': group['at'] + extra}

    props = [
        merged('grass-tuft', tuft),
        merged('bush-flowering', bush),
        merged('tree-oak', oak + lone[: len(lone) // 2]),
        merged('tree-pine', pine + lone[len(lone) // 2 :]),
    ]
    landmarks = [dict(l) for l in old['landmarks']]
    for l in landmarks:
        if l['id'] == 'sign':
            l['text'] = 'North: crystal shrine · East: the long trail to the orchard · South: the pond trail and a quiet grove · Blue minimap marker: shrine'
    landmarks += [
        {'id': 'old-well', 'kind': 'sign', 'sprite': 'signpost-wood', 'at': list(L['well']), 'w': 38, 'label': 'Read the mossy plaque', 'secret': True, 'mapLabel': 'Old well', 'text': 'An old well, long dry. Carved beneath: the shy ones nap where the grass is longest.'},
        {'id': 'hollow-note', 'kind': 'sign', 'sprite': 'signpost-wood', 'at': list(L['hollow']), 'w': 38, 'label': 'Read the carved bark', 'secret': True, 'mapLabel': 'Whispering hollow', 'text': 'A hollow among the old trees. If you hear a rustle, wait: someone is watching.'},
    ]
    data = {
        'format': 1, 'id': 'meadow', 'biome': 'meadow', 'name': 'Sunlit Trail',
        'size': {'w': g.w, 'h': g.h}, 'legend': LEGEND, 'terrain': g.rows(),
        'spawns': {'camp': old['spawns']['camp'], 'orchard-return': [65.5, 30]},
        'landmarks': landmarks,
        'exits': [
            {'id': 'east', 'sprite': 'signpost-wood', 'at': list(L['east']), 'w': 40, 'label': 'Follow the long eastern trail to the orchard', 'to': {'map': 'orchard-ruins', 'spawn': 'camp'}},
        ],
        'props': props,
        'zones': [
            {**old['zones'][0], 'rect': [0, 0, 24, 24]},
            {'id': 'meadow-wilds', 'terrain': ['t'], 'pool': [{'species': 'emberkin', 'weight': 4}, {'species': 'bramblebuck', 'weight': 4}, {'species': 'fernling', 'weight': 2}], 'level': [6, 7], 'distance': [4, 8]},
        ],
        'quiet': [
            {'id': 'camp-lawn', 'rect': [8, 10, 16, 16], 'label': 'Camp lawn'},
            {'id': 'shrine-climb', 'rect': [9, 2, 15, 8], 'label': 'Shrine climb'},
            {'id': 'long-trail', 'rect': [24, 10, 40, 16], 'label': 'Long trail'},
            {'id': 'orchard-gate', 'rect': [60, 27, 70, 33], 'label': 'Orchard gate'},
        ],
        'triggers': [
            {'id': 'quiet-grove', 'at': [28, 56.5], 'radius': 3, 'on': 'enter', 'once': True, 'do': [{'type': 'environment', 'text': 'A narrow track slips under the oldest trees. It is quiet here, and it rejoins the south trail.'}]},
        ],
    }
    return data, g


if __name__ == '__main__':
    data, g = meadow()
    (ROOT / 'meadow.json').write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')
    print('meadow', g.w, g.h, sum(r.count('g') + r.count('p') + r.count('t') for r in g.rows()), 'walkable')
