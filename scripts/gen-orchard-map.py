#!/usr/bin/env python3
"""One-off authoring aid for the large Ruined Orchard (#51): writes dist/maps/orchard-ruins.json.

The original 25x25 orchard (scripts/orchard-hub.json) keeps its coordinates, landmarks, flags and hidden cut-through
and grows east and south. Reuses the grid helpers of gen-wetland-maps.py. The map is plain data once written.
"""
import importlib.util, json, math, random
from pathlib import Path

spec = importlib.util.spec_from_file_location('wet', Path(__file__).with_name('gen-wetland-maps.py'))
wet = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wet)
Grid, patches, clear, LEGEND, ROOT = wet.Grid, wet.patches, wet.clear, wet.LEGEND, wet.ROOT
OLD = Path(__file__).with_name('orchard-hub.json')


def orchard():
    rng = random.Random(54)
    old = json.loads(OLD.read_text())
    g = Grid(64, 56)
    for y, row in enumerate(old['terrain']):
        for x, ch in enumerate(row):
            g.c[y][x] = ch
    for e in [(46, 24, 16, 20), (16, 42, 13, 10), (48, 46, 12, 8)]:
        g.ellipse(*e, 'g', only='.')
    g.rect(22, 9, 34, 15, 'g', only='.')  # bridge east of the old orchard island
    g.rect(9, 22, 16, 32, 'g', only='.')  # bridge south
    g.rect(54, 10, 62, 18, 'g', only='.')  # gate shelf
    for e in [(40, 14, 4, 3), (24, 44, 4, 2.5), (52, 34, 3.5, 3)]:
        g.ellipse(*e, 'w', only='g')
    east = [(22, 12), (28, 12), (34, 14), (40, 19), (46, 18), (52, 15), (57, 14), (61, 14)]
    ruins_loop = [(40, 19), (42, 26), (47, 31), (52, 38), (46, 44), (38, 42), (30, 38), (26, 40)]
    south = [(12, 21), (12, 28), (14, 34), (18, 40), (24, 40), (30, 38)]
    hollow = [(46, 31), (52, 30), (56, 28)]
    cider = [(30, 38), (30, 46), (36, 50)]
    for pth in (east, ruins_loop, south, hollow, cider):
        g.path(pth)
    # a second hidden cut-through: a narrow ground corridor under the apple rows, not drawn as a trail
    for x, y in [(34, 22), (36, 25), (38, 28), (41, 31), (44, 33), (46, 35), (47, 38)]:
        g.rect(x - 1, y - 1, x, y, 'g', only='gw.')
    patches(g, rng, [(36, 22, 4, 3), (50, 22, 4, 3), (42, 40, 4, 2.5), (20, 46, 4, 2.5), (14, 30, 3, 2), (56, 38, 3, 3), (30, 30, 3, 2)])
    for box in [(0, 9, 5, 15), (50, 12, 62, 17), (10, 22, 14, 28), (28, 36, 32, 40)]:
        clear(g, *box)
    L = {'cider': (36.4, 50.4), 'wall': (56.4, 27.4), 'press': (30.4, 44.4), 'east': (61.2, 14)}
    keep = [(l['at'][0], l['at'][1], 2.4) for l in old['landmarks']] + [(l['at'][0], l['at'][1], 2.4) for l in old['exits']]
    avoid = [(x, y, 2.4) for x, y in L.values()] + keep
    # apple rows: oaks on a loose grid across the new orchard, never on or beside a trail
    oak, pine = [], []
    for gx in range(30, 60, 4):
        for gy in range(10, 54, 4):
            x, y = gx + rng.uniform(-0.4, 0.4), gy + rng.uniform(-0.4, 0.4)
            if g.get(int(x), int(y)) not in 'gt' or g.near(x, y, 'p', 2) or g.near(x, y, 'w', 1) or g.near(x, y, '.', 1):
                continue
            if any(math.hypot(x - ax, y - ay) < r for ax, ay, r in avoid):
                continue
            (oak if rng.random() < 0.7 else pine).append([round(x, 1), round(y, 1)])
    for gx in range(6, 28, 4):
        for gy in range(34, 52, 4):
            x, y = gx + rng.uniform(-0.4, 0.4), gy + rng.uniform(-0.4, 0.4)
            if g.get(int(x), int(y)) not in 'gt' or g.near(x, y, 'p', 2) or g.near(x, y, 'w', 1) or g.near(x, y, '.', 1):
                continue
            if any(math.hypot(x - ax, y - ay) < r for ax, ay, r in avoid):
                continue
            (oak if rng.random() < 0.7 else pine).append([round(x, 1), round(y, 1)])
    boulders = wet.scatter(g, rng, 34, lambda x, y: (x > 25 or y > 25) and g.near(x, y, '.', 3), avoid)
    tuft = wet.scatter(g, rng, 90, lambda x, y: x > 25 or y > 25, avoid)
    bush = wet.scatter(g, rng, 26, lambda x, y: (x > 25 or y > 25) and not g.near(x, y, 'w', 1), avoid)

    def merged(sprite, extra):
        group = next(p for p in old['props'] if p['sprite'] == sprite)
        return {**group, 'at': group['at'] + extra}

    props = [
        merged('grass-tuft', tuft),
        merged('bush-flowering', bush),
        merged('tree-oak', oak),
        merged('tree-pine', pine),
        {'sprite': 'boulder-mossy', 'kind': 'scenery', 'w': 49, 'solid': 0.52, 'at': boulders},
    ]
    landmarks = [dict(l) for l in old['landmarks']]
    landmarks += [
        {'id': 'cider-press', 'kind': 'sign', 'sprite': 'signpost-wood', 'at': list(L['press']), 'w': 38, 'label': 'Read the weathered tag', 'secret': True, 'mapLabel': 'Old cider press', 'text': 'The old cider press. The last pressing was a good year: the apples here never stopped falling.'},
        {'id': 'fallen-wall', 'kind': 'sign', 'sprite': 'signpost-wood', 'at': list(L['wall']), 'w': 38, 'label': 'Read the mossy stone', 'secret': True, 'mapLabel': 'Fallen wall', 'text': 'Part of the old orchard wall. The ruins keep going east, but the trail is safe.'},
    ]
    exits = [dict(e) for e in old['exits']]
    for e in exits:
        if e['id'] == 'east-to-ridge':
            e['at'] = list(L['east'])
            e['label'] = 'Take the long eastern trail to Amber Ridge'
    spawns = dict(old['spawns'])
    spawns['ridge-return'] = [58.5, 14]
    data = {
        'format': 1, 'id': 'orchard-ruins', 'biome': 'meadow', 'name': old['name'],
        'size': {'w': g.w, 'h': g.h}, 'legend': LEGEND, 'terrain': g.rows(),
        'spawns': spawns,
        'landmarks': landmarks,
        'exits': exits,
        'props': props,
        'zones': [
            {**old['zones'][0], 'rect': [0, 0, 24, 24]},
            old['zones'][1],
            {'id': 'orchard-wilds', 'terrain': ['t'], 'pool': [{'species': 'bramblebuck', 'weight': 4}, {'species': 'emberkin', 'weight': 3}, {'species': 'fernling', 'weight': 2}, {'species': 'duskwing', 'weight': 1}], 'level': [6, 7], 'distance': [4, 8]},
        ],
        'quiet': [
            {'id': 'orchard-camp', 'rect': [1, 9, 9, 16], 'label': 'Orchard camp'},
            {'id': 'long-trail', 'rect': [22, 9, 34, 15], 'label': 'Long trail'},
            {'id': 'ridge-gate', 'rect': [54, 10, 62, 18], 'label': 'Ridge gate'},
        ],
        'triggers': [
            old['triggers'][0],
            {'id': 'hidden-lower-row', 'at': [41, 31], 'radius': 2, 'on': 'enter', 'once': True, 'do': [{'type': 'toast', 'text': 'Another quiet row slips between the trees, down to the old ruins.'}]},
        ],
    }
    return data, g


if __name__ == '__main__':
    data, g = orchard()
    (ROOT / 'orchard-ruins.json').write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')
    print('orchard', g.w, g.h, sum(r.count('g') + r.count('p') + r.count('t') for r in g.rows()), 'walkable')
