#!/usr/bin/env python3
"""One-off authoring aid for the badlands pair (#53): writes dist/maps/amber-ridge.json and stone-basin.json.

Reuses the grid helpers of gen-wetland-maps.py. The maps are plain data once written.
"""
import importlib.util, json, math, random
from pathlib import Path

spec = importlib.util.spec_from_file_location('wet', Path(__file__).with_name('gen-wetland-maps.py'))
wet = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wet)
Grid, patches, clear, LEGEND, ROOT = wet.Grid, wet.patches, wet.clear, wet.LEGEND, wet.ROOT


def cliffs(g, rng, x0, x1, y0, y1, gaps):
    """A ragged void band (a cliff) with ground gaps at the given x ranges."""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if g.get(x, y) in 'g':
                g.set(x, y, '.')
    for a, b in gaps:
        for y in range(y0 - 1, y1 + 2):
            for x in range(a, b + 1):
                if g.get(x, y) == '.' and y0 <= y <= y1:
                    g.set(x, y, 'g')


def rock_props(g, rng, avoid, n_spire, n_boulder, n_tuft):
    def edge(x, y):
        return g.near(x, y, '.', 1) and g.get(int(x), int(y)) in 'gt'
    spire = wet.scatter(g, rng, n_spire, edge, avoid)
    boulder = wet.scatter(g, rng, n_boulder, lambda x, y: True, avoid)
    tuft = wet.scatter(g, rng, n_tuft, lambda x, y: True, avoid)
    return [
        {'sprite': 'rock-spire-red', 'kind': 'scenery', 'w': 71, 'solid': 0.52, 'at': spire},
        {'sprite': 'boulder-mossy', 'kind': 'scenery', 'w': 49, 'solid': 0.52, 'at': boulder},
        {'sprite': 'grass-tuft', 'kind': 'grass', 'w': 27, 'at': tuft},
    ]


def ridge():
    rng = random.Random(530)
    g = Grid(64, 56)
    g.ellipse(33, 28, 29, 25, 'g')
    g.rect(1, 26, 8, 30, 'g')
    g.rect(56, 26, 62, 30, 'g')
    cliffs(g, rng, 6, 49, 17, 19, [(14, 15)])
    cliffs(g, rng, 8, 55, 37, 39, [(18, 19), (56, 59)])
    for e in [(24, 8, 3, 2), (46, 46, 3, 2), (10, 46, 2.5, 2)]:
        g.ellipse(*e, '.', only='g')  # small sinkholes
    main = [(3, 28), (12, 28), (24, 27), (36, 28), (48, 28), (60, 28)]
    north_open = [(48, 28), (52, 22), (54, 16), (52, 10), (44, 8), (36, 7), (32, 6)]
    north_narrow = [(14.5, 28), (14.5, 22), (14.5, 18), (14.5, 12), (20, 9), (28, 7), (32, 6)]
    south_narrow = [(18.5, 28), (18.5, 38), (20, 44), (26, 48), (32, 50)]
    south_open = [(48, 28), (54, 34), (57, 38), (54, 44), (46, 49), (38, 51), (32, 52)]
    chest_spur = [(52, 13), (47, 13), (45.5, 12.5)]
    lookout = [(14.5, 14), (11, 12)]
    for p in (main, north_open, north_narrow, south_narrow, south_open, chest_spur, lookout):
        g.path(p)
    patches(g, rng, [(24, 22, 5, 3), (40, 23, 4, 3), (30, 33, 6, 3), (46, 33, 4, 3), (10, 33, 4, 3), (27, 44, 4, 3), (50, 15, 3, 3), (56, 14, 3, 3), (58, 42, 3, 3), (40, 46, 4, 2.5), (22, 13, 4, 3), (40, 11, 3, 2), (10, 22, 3, 2.5), (22, 52, 3, 2)])
    for box in [(0, 24, 14, 32), (28, 3, 36, 9), (55, 25, 62, 31), (28, 48, 36, 53), (44, 10, 48, 14), (9, 10, 13, 14), (14, 12, 16, 20), (17, 36, 21, 41)]:
        clear(g, *box)
    L = {'cottage': (13.5, 24.4), 'ranger': (9.5, 25.4), 'sign': (6.5, 28.8), 'shrine': (32, 4.8), 'chest': (45.4, 12.0), 'lookout': (10.8, 11.6), 'west': (1.9, 28), 'east': (60.2, 28), 'basin': (32, 52.6)}
    avoid = [(x, y, 2.2) for x, y in L.values()]
    props = rock_props(g, rng, avoid, 80, 60, 70)
    data = {
        'format': 1, 'id': 'amber-ridge', 'biome': 'badlands', 'name': 'Amber Ridge',
        'size': {'w': g.w, 'h': g.h}, 'legend': LEGEND, 'terrain': g.rows(),
        'spawns': {'camp': [4, 28], 'east-return': [57.5, 28], 'basin-landing': [49.5, 9.6], 'basin-return': [32, 50]},
        'landmarks': [
            {'id': 'shrine', 'kind': 'shrine', 'sprite': 'shrine-crystal-stone', 'at': list(L['shrine']), 'w': 99, 'solid': 0.65, 'label': 'Visit the shrine', 'flag': 'amber-ridge.seal', 'mapLabel': 'Crystal shrine', 'guardian': {'species': 'pebblit', 'level': 10, 'tactic': 'rolling-charge', 'power': 1.5}, 'reward': {'coins': 60, 'potions': 2, 'xp': 65}},
            {'id': 'cottage', 'kind': 'cottage', 'sprite': 'cottage-tiled', 'at': list(L['cottage']), 'w': 133, 'solid': 1.15, 'mapLabel': "Rowan's lodge"},
            {'id': 'ranger', 'kind': 'ranger', 'sprite': 'person-traveler', 'at': list(L['ranger']), 'w': 37, 'label': 'Talk to Ranger Rowan', 'name': 'Ranger Rowan', 'tag': 'ROWAN', 'mapLabel': 'Supply point', 'lines': [
                {'when': {'flag': 'amber-ridge.seal'}, 'text': 'The ridge shrine hums again. Frostveil Grove lies far to the east.'},
                {'text': 'Two ways north: the narrow cut is quick but tight, the eastern trail is long and open. The south trail drops into the Stone Basin.'}]},
            {'id': 'sign', 'kind': 'sign', 'sprite': 'signpost-wood', 'at': list(L['sign']), 'w': 38, 'label': 'Read the trail sign', 'mapLabel': 'Trail sign', 'text': 'North: crystal shrine (narrow cut or the long east trail) · South: Stone Basin · East: the next island · Gold: treasure'},
            {'id': 'chest', 'kind': 'chest', 'sprite': 'chest-wooden', 'at': list(L['chest']), 'w': 44, 'label': 'Open the treasure chest', 'flag': 'amber-ridge.chest', 'mapLabel': 'Overlook chest', 'reward': {'coins': 30, 'potions': 2, 'orbs': 4}},
            {'id': 'lookout-note', 'kind': 'sign', 'sprite': 'signpost-wood', 'at': list(L['lookout']), 'w': 38, 'label': 'Read the sun-bleached note', 'secret': True, 'mapLabel': 'Sunstone lookout', 'text': 'A lookout carved into the cliff. Voltkit love the bright trail; Pebblit prefer to bask where the grass is warm.'},
        ],
        'exits': [
            {'id': 'west', 'sprite': 'signpost-wood', 'at': list(L['west']), 'w': 40, 'label': 'Take the western trail', 'to': {'map': 'orchard-ruins', 'spawn': 'ridge-return'}},
            {'id': 'east', 'sprite': 'signpost-wood', 'at': list(L['east']), 'w': 40, 'label': 'Take the eastern trail', 'to': {'map': 'frostveil-grove', 'spawn': 'camp'}, 'requires': 'amber-ridge.seal'},
            {'id': 'down-to-basin', 'sprite': 'signpost-wood', 'at': list(L['basin']), 'w': 40, 'label': 'Take the south trail into the Stone Basin', 'to': {'map': 'stone-basin', 'spawn': 'camp'}},
        ],
        'props': props,
        'zones': [
            {'id': 'ridge-grass-west', 'terrain': ['t'], 'rect': [0, 0, 31, 55], 'pool': [{'species': 'pebblit', 'weight': 4}, {'species': 'voltkit', 'weight': 4}, 'sunskitter'], 'level': [7, 8], 'distance': [5, 9]},
            {'id': 'ridge-grass-east', 'terrain': ['t'], 'pool': [{'species': 'sunskitter', 'weight': 4}, {'species': 'voltkit', 'weight': 4}, {'species': 'pebblit', 'weight': 3}], 'level': [8, 10], 'distance': [4, 8]},
        ],
        'quiet': [
            {'id': 'camp-trail', 'rect': [2, 25, 24, 31], 'label': 'Camp trail'},
            {'id': 'narrow-cut', 'rect': [13, 10, 17, 21], 'label': 'Narrow cut'},
            {'id': 'shrine-approach', 'rect': [27, 3, 38, 9], 'label': 'Shrine approach'},
            {'id': 'east-gate', 'rect': [55, 25, 62, 31], 'label': 'East gate'},
            {'id': 'basin-stair', 'rect': [28, 48, 36, 54], 'label': 'Basin stair'},
        ],
        'triggers': [
            {'id': 'echo-hollow', 'at': [24, 46], 'radius': 2, 'on': 'enter', 'once': True, 'do': [{'type': 'toast', 'text': 'Your footsteps echo from a hollow in the rock. Nothing stirs here.'}]},
        ],
    }
    return data, g


def basin():
    rng = random.Random(531)
    g = Grid(60, 50)
    g.ellipse(30, 25, 28, 23, 'g')
    g.rect(27, 0, 33, 6, 'g')
    g.rect(52, 23, 58, 27, 'g')
    g.ellipse(30, 26, 10, 7, '.')  # the chasm in the middle
    for e in [(14, 38, 4, 3), (46, 13, 4, 3), (10, 14, 3, 2.5), (49, 38, 3, 2.5)]:
        g.ellipse(*e, '.', only='g')
    ring = [(30, 14), (41, 16), (44, 25), (41, 34), (30, 37), (19, 34), (16, 25), (19, 16), (30, 14)]
    for p in (
        ring,
        [(30, 3), (30, 14)],
        [(44, 25), (56, 25)],
        [(30, 37), (30, 43)],
        [(16, 25), (9, 25), (7, 22)],
        [(19, 34), (14, 39), (12, 41)],
        [(41, 16), (45, 11), (47, 9)],
    ):
        g.path(p)
    patches(g, rng, [(22, 9, 4, 3), (38, 8, 4, 2.5), (50, 18, 3, 3), (51, 32, 3, 3), (40, 43, 5, 3), (20, 43, 4, 3), (8, 31, 3, 3), (24, 22, 2.5, 2.5), (37, 30, 2.5, 2), (10, 20, 2.5, 2), (47, 44, 3, 2)])
    for box in [(27, 0, 33, 8), (26, 40, 34, 46), (50, 22, 58, 28), (5, 20, 10, 24), (10, 38, 14, 43), (44, 8, 48, 12)]:
        clear(g, *box)
    L = {'ranger': (27.2, 43.2), 'cottage': (33.6, 43.6), 'sign': (31.5, 6.2), 'chest': (11.6, 41.6), 'quarry': (6.6, 21.4), 'vista': (47.4, 8.6), 'north': (30, 1.8), 'east': (57, 25)}
    avoid = [(x, y, 2.2) for x, y in L.values()]
    props = rock_props(g, rng, avoid, 90, 60, 60)
    data = {
        'format': 1, 'id': 'stone-basin', 'biome': 'badlands', 'name': 'Stone Basin',
        'size': {'w': g.w, 'h': g.h}, 'legend': LEGEND, 'terrain': g.rows(),
        'spawns': {'camp': [30, 5]},
        'landmarks': [
            {'id': 'basin-hut', 'kind': 'cottage', 'sprite': 'cottage-tiled', 'at': list(L['cottage']), 'w': 133, 'solid': 1.15, 'mapLabel': 'Quarry hut'},
            {'id': 'quarry-keeper', 'kind': 'ranger', 'sprite': 'person-traveler', 'at': list(L['ranger']), 'w': 37, 'label': 'Talk to Quarry Keeper Tamsin', 'name': 'Quarry Keeper Tamsin', 'tag': 'TAMSIN', 'mapLabel': 'Supply point', 'lines': [
                {'when': {'flag': 'amber-ridge.seal'}, 'text': 'The seal is yours. The east gate walks back up to the ridge, right beside the overlook.'},
                {'text': 'Rest here as long as you like. The path rings the chasm; the shy ones nap in the grass between the rim and the path.'}]},
            {'id': 'basin-sign', 'kind': 'sign', 'sprite': 'signpost-wood', 'at': list(L['sign']), 'w': 38, 'label': 'Read the plank sign', 'mapLabel': 'Basin sign', 'text': 'Around the chasm: the quarry hut south · a west alcove · a south-west nook · East gate: back up to Amber Ridge'},
            {'id': 'basin-chest', 'kind': 'chest', 'sprite': 'chest-wooden', 'at': list(L['chest']), 'w': 44, 'label': 'Open the nook chest', 'flag': 'stone-basin.chest', 'mapLabel': 'Nook chest', 'reward': {'coins': 40, 'potions': 2, 'orbs': 4}},
            {'id': 'quarry-note', 'kind': 'sign', 'sprite': 'signpost-wood', 'at': list(L['quarry']), 'w': 38, 'label': 'Read the chiselled note', 'secret': True, 'mapLabel': 'Old quarry alcove', 'text': 'Cut by hand, a block at a time. The guardian above sleeps lightly: roll with its charge, do not stand against it.'},
            {'id': 'vista-note', 'kind': 'sign', 'sprite': 'signpost-wood', 'at': list(L['vista']), 'w': 38, 'label': 'Read the vista marker', 'secret': True, 'mapLabel': 'Rim vista', 'text': 'From the rim you can see the whole basin and the long road up to the shrine.'},
        ],
        'exits': [
            {'id': 'back-to-ridge', 'sprite': 'signpost-wood', 'at': list(L['north']), 'w': 40, 'label': 'Return to Amber Ridge', 'to': {'map': 'amber-ridge', 'spawn': 'basin-return'}},
            {'id': 'east-gate', 'sprite': 'signpost-wood', 'at': list(L['east']), 'w': 40, 'label': 'Take the east gate up to the ridge overlook', 'to': {'map': 'amber-ridge', 'spawn': 'basin-landing'}},
        ],
        'props': props,
        'zones': [
            {'id': 'basin-grass', 'terrain': ['t'], 'pool': [{'species': 'pebblit', 'weight': 4}, {'species': 'sunskitter', 'weight': 3}, {'species': 'voltkit', 'weight': 3}], 'level': [9, 10], 'distance': [4, 8]},
        ],
        'quiet': [
            {'id': 'entry-stair', 'rect': [27, 0, 33, 14], 'label': 'Entry stair'},
            {'id': 'quarry-hut', 'rect': [24, 39, 37, 46], 'label': 'Quarry hut'},
            {'id': 'east-gate', 'rect': [42, 22, 58, 28], 'label': 'East gate'},
            {'id': 'rim-path', 'rect': [17, 13, 43, 17], 'label': 'North rim'},
        ],
        'triggers': [
            {'id': 'chasm-edge', 'at': [30, 15], 'radius': 2, 'on': 'enter', 'once': True, 'do': [{'type': 'toast', 'text': 'The chasm falls away below the rail. The path keeps you safe.'}]},
        ],
    }
    return data, g


if __name__ == '__main__':
    for fn in (ridge, basin):
        data, g = fn()
        (ROOT / f"{data['id']}.json").write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')
        print(data['id'], g.w, g.h, sum(r.count('g') + r.count('p') + r.count('t') for r in g.rows()), 'walkable')
