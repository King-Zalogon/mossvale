#!/usr/bin/env python3
"""Compose the Brackenwake Commons settlement map (#277) from existing shared art.

Deterministic and idempotent: every run rebuilds dist/maps/brackenwake-commons.json from the layout below.
The terrain is drawn from a few shapes (island mask, spring pond, town loop, lanes, creek with the survey bridge),
then buildings, habitat props and creature spots are placed by hand-chosen coordinates; only the decorative
trees are scattered, with a seeded RNG, in clear ground away from every path, building and service.

    python3 scripts/gen-brackenwake.py            # rewrite dist/maps/brackenwake-commons.json (then run prettier and refresh-manifest)
    python3 scripts/gen-brackenwake.py --check    # exit 1 when the map is out of date
"""
import json, math, random, sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'dist' / 'maps' / 'brackenwake-commons.json'
W, H = 56, 44
CX, CY = 28.0, 22.0  # island centre
POND = (28.0, 20.0, 5.2, 3.7)  # spring pond: cx, cy, rx, ry
LOOP = (28.0, 20.0, 9.8, 7.6)  # town loop ring: cx, cy, rx, ry
BRIDGE_X = (27, 28)


def inside_island(x, y, pad=0.0):
    nx, ny = (x + 0.5 - CX) / (26.8 + pad), (y + 0.5 - CY) / (20.6 + pad)
    return abs(nx) ** 2.6 + abs(ny) ** 2.6 <= 1.0


def creek_rows(x):
    base = 31 + round(math.sin(x / 6.0))
    return range(base, base + 3)


def terrain():
    grid = [['.'] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            if inside_island(x, y):
                grid[y][x] = 'g'
            elif inside_island(x, y, 2.4):
                grid[y][x] = 'w'
    # spring pond
    for y in range(H):
        for x in range(W):
            if ((x + 0.5 - POND[0]) / POND[2]) ** 2 + ((y + 0.5 - POND[1]) / POND[3]) ** 2 <= 1.0:
                grid[y][x] = 'w'
    # the creek that carries the spring south, then the survey bridge over it
    for x in range(W):
        for y in creek_rows(x):
            if grid[y][x] != '.':
                grid[y][x] = 'w'

    def path(x0, y0, x1, y1):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if grid[y][x] in 'gtw' or (grid[y][x] == 'p'):
                    grid[y][x] = 'p'

    # town loop
    for y in range(H):
        for x in range(W):
            d = ((x + 0.5 - LOOP[0]) / LOOP[2]) ** 2 + ((y + 0.5 - LOOP[1]) / LOOP[3]) ** 2
            if 0.74 <= d <= 1.13 and grid[y][x] == 'g':
                grid[y][x] = 'p'
    path(27, 2, 28, 12)  # north lane from the gate
    path(7, 19, 18, 20)  # west lane to the keeper's cottage
    path(38, 19, 49, 20)  # east lane to the press green and the lookout
    path(27, 28, 28, 30)  # south lane to the bridge
    for x in BRIDGE_X:  # the old survey bridge: a plank causeway across the creek
        for y in creek_rows(x):
            grid[y][x] = 'p'
    path(27, 34, 28, 36)  # across to the habitat garden
    path(20, 36, 36, 36)  # garden walk
    path(36, 13, 40, 15)  # compact side street to the press green
    path(14, 26, 18, 27)  # compact side street to the keeper's cottage
    path(18, 11, 20, 13)  # steps to the ranger hall
    # a few tufts of tall grass for texture (no encounter zone reads them)
    for (x, y) in [(10, 12), (11, 13), (44, 31), (45, 30), (8, 24), (9, 25), (46, 26), (47, 27)]:
        if grid[y][x] == 'g':
            grid[y][x] = 't'
    return [''.join(row) for row in grid]


COTTAGE = ('cottage-tiled', 133, 1.15)


def landmark(id_, kind, sprite, at, w, **extra):
    return {'id': id_, 'kind': kind, 'sprite': sprite, 'at': list(at), 'w': w, **extra}


def habitat(id_, species, at, label, lines):
    return landmark(id_, 'sign', f'creature-{species}', at, 40, label=label, mapLabel=label, lines=lines)


def build():
    rows = terrain()
    landmarks = [
        landmark('ranger-hall', 'cottage', *COTTAGE[:1], (18.5, 11.5), 150, solid=1.3, label='Ranger hall'),
        landmark(
            'warden',
            'ranger',
            'person-gardener',
            (21.5, 14.6),
            37,
            name='Warden Hollis',
            tag='HOLLIS',
            label='Talk to Warden Hollis',
            lines=[
                {'when': {'flag': 'meadow.seal'}, 'text': 'The Meadow seal is awake, I hear. Rest here whenever you like. The hall keeps the lamp lit and the beds free.'},
                {'text': 'Welcome to Brackenwake Commons. Rest costs nothing here, and the shelf holds what a day on the trail needs.'},
            ],
        ),
        landmark(
            'survey-board',
            'sign',
            'signpost-wood',
            (31.4, 11.2),
            38,
            label='Survey board',
            mapLabel='Survey board',
            lines=[
                {'when': {'flag': 'amber-ridge.seal'}, 'text': 'SURVEY BOARD. Spring Pond · Survey Bridge south · Lookout east. Rumour: travellers back from the red ridge say the badlands shrine is calm again.'},
                {'when': {'visited': 'amber-ridge'}, 'text': 'SURVEY BOARD. Spring Pond · Survey Bridge south · Lookout east. Rumour: dry-country friends are bold near the ridge shrine. Bring rested companions.'},
                {'when': {'visited': 'orchard-ruins'}, 'text': 'SURVEY BOARD. Spring Pond · Survey Bridge south · Lookout east. Rumour: the old orchard keeps its water tidy; someone has been reading the sluice marks.'},
                {'text': 'SURVEY BOARD. Spring Pond · Survey Bridge south · Lookout east. Rumour: the meadow trail runs north; the Warden keeps the way home lit.'},
            ],
        ),
        landmark(
            'spring-stone',
            'sign',
            'prop-well-ruined',
            (28.0, 25.0),
            46,
            label='Spring stone',
            mapLabel='The spring',
            lines=[{'text': 'The spring rises here and runs through the commons pond, then south under the survey bridge. Everything in town drinks from it.'}],
        ),
        landmark(
            'commons-press',
            'sign',
            'prop-cider-press',
            (46.0, 13.8),
            64,
            solid=0.7,
            label='Commons cider press',
            mapLabel='Commons press',
            lines=[{'text': 'The commons cider press. The apples are shared out evenly after the pressing, and the long bench beside it is for resting between turns.'}],
        ),
        landmark(
            'wren',
            'sign',
            'person-traveler',
            (43.0, 18.2),
            37,
            name='Wren the potter',
            tag='WREN',
            label='Wren the potter',
            mapLabel='Press green',
            lines=[
                {'when': {'active': 'fernling'}, 'text': 'Is that a Fernling walking at your heel? Mine stands among the pots by the hour. It mistakes my pots for a garden.'},
                {'when': {'active': 'emberkin'}, 'text': 'An Emberkin! Keep it off the kiln shelf. It keeps trying to help.'},
                {'when': {'active': 'brooklet'}, 'text': 'A Brooklet is a fine friend for a potter. Wet clay never frightened it.'},
                {'when': {'active': 'duskwing'}, 'text': 'A Duskwing is welcome on the press frame. We hang a nest box for each that visits.'},
                {'when': {'party': 'voltkit'}, 'text': 'A Voltkit in your party? Keep it away from my kiln wire; it hums at it.'},
                {'when': {'caught': 6}, 'text': 'So many friends in tow! The green is open to all of them. Sit, share the bench, tell me which one is the troublemaker.'},
                {'text': 'Welcome to the press green. Sit anywhere. The benches are for everyone, and so are the stories.'},
            ],
        ),
        landmark(
            'tobin',
            'sign',
            'person-gardener',
            (23.5, 37.4),
            37,
            name='Tobin',
            tag='TOBIN',
            label='Tobin, garden helper',
            mapLabel='Habitat garden',
            lines=[
                {'when': {'party': 'bramblebuck'}, 'text': 'Your Bramblebuck is shaking its antlers at the garden gate! The wild ones in the straw are shy. Let it sniff first.'},
                {'when': {'party': 'pebblit'}, 'text': 'Is that a Pebblit with you? The wild ones sleep under the garden stones. Do not tell them yours can roll.'},
                {'when': {'caught': 3}, 'text': 'You have a proper team! The garden is for resting, not fighting. Watch the little ones, say hello, then go on your way.'},
                {'text': 'This is the habitat garden. Nest boxes, a drinking trough and a warm wall: each friend likes a different corner. They are shy but never in a fight.'},
            ],
        ),
        landmark(
            'survey-plaque',
            'sign',
            'prop-hanging-lantern',
            (26.2, 29.6),
            36,
            label='Survey bridge plaque',
            mapLabel='Survey bridge',
            lines=[{'text': 'SURVEY BRIDGE. Laid for the first land survey and kept in repair by the commons ever since. South: the habitat garden.'}],
        ),
        landmark(
            'lookout',
            'sign',
            'prop-rim-overlook',
            (49.6, 19.8),
            58,
            label='Survey lookout',
            mapLabel='Survey lookout',
            lines=[
                {'when': {'visited': 'amber-ridge'}, 'text': 'From the lookout you can pick out the red spires of the far shore: the ridge you have walked. The survey line ends here.'},
                {'text': 'The survey line ends at this lookout. Past the water, red spires stand on a far shore, much further than they look.'},
            ],
        ),
        habitat(
            'hab-brooklet',
            'brooklet',
            (31.4, 23.8),
            'Brooklet at the spring',
            [
                {'when': {'party': 'brooklet'}, 'text': 'A wild Brooklet is paddling at the spring edge. Yours looks over with interest.'},
                {'text': 'A Brooklet is paddling at the edge of the spring. It does not mind being watched.'},
            ],
        ),
        habitat(
            'hab-duskwing',
            'duskwing',
            (49.6, 15.6),
            'Duskwing nest box',
            [
                {'when': {'party': 'duskwing'}, 'text': 'A Duskwing blinks from the nest box. Yours answers with a little chirp.'},
                {'text': 'A Duskwing is tucked into the nest box on the press frame, eyes half shut.'},
            ],
        ),
        habitat(
            'hab-emberkin',
            'emberkin',
            (10.4, 22.0),
            'Emberkin on the wall',
            [
                {'when': {'party': 'emberkin'}, 'text': 'A wild Emberkin basks on the sun-warmed wall. Yours curls up on the stones beside it.'},
                {'text': 'An Emberkin is sprawled along the sun-warmed wall, soaking up the last of the day.'},
            ],
        ),
        habitat(
            'hab-fernling',
            'fernling',
            (31.6, 38.0),
            'Fernling among the pots',
            [
                {'when': {'party': 'fernling'}, 'text': 'A wild Fernling has settled among the plant pots. Yours trots over and sniffs the leaves.'},
                {'text': 'A Fernling is sitting in the middle of the plant pots, very much like another plant.'},
            ],
        ),
        habitat(
            'hab-pebblit',
            'pebblit',
            (36.4, 39.6),
            'Pebblit under the stones',
            [
                {'when': {'party': 'pebblit'}, 'text': 'A Pebblit sleeps in the stones. Yours sits next to it and does not say a word.'},
                {'text': 'A Pebblit is asleep among the garden stones. It looks like a stone, and probably knows it.'},
            ],
        ),
        habitat(
            'hab-bramblebuck',
            'bramblebuck',
            (22.0, 40.4),
            'Bramblebuck in the straw',
            [
                {'when': {'party': 'bramblebuck'}, 'text': 'A Bramblebuck is chewing straw by the trough. Yours trots up and joins in.'},
                {'text': 'A Bramblebuck is chewing straw beside the drinking trough, quite content.'},
            ],
        ),
    ]
    # Optional one-time finds use stable per-cache map flags (not the legacy
    # one-chest-per-map save field), so both caches remain independently claimable.
    landmarks += [
        landmark('cache-north-garden', 'chest', 'chest-wooden', (4, 13), 44,
                 label='Open the trail cache', flag='brackenwake-commons.chest:cache-north-garden',
                 reward={'coins': 6, 'potions': 0, 'orbs': 1}, secret=True,
                 mapLabel='North garden cache',
                 discoveryText='North garden cache: Tucked beside the north garden path, a small chest holds a few supplies.'),
        landmark('cache-south-lane', 'chest', 'chest-wooden', (15, 31), 44,
                 label='Open the trail cache', flag='brackenwake-commons.chest:cache-south-lane',
                 reward={'coins': 6, 'potions': 0, 'orbs': 1}, secret=True,
                 mapLabel='South lane cache',
                 discoveryText='South lane cache: A quiet nook beside the south lane hides a few useful supplies.'),
    ]
    spawns = {'camp': [28.0, 4.8]}
    exits = [
        {
            'id': 'north-to-meadow',
            'sprite': 'signpost-wood',
            'at': [28.0, 3.0],
            'w': 40,
            'label': 'Take the north trail back to the Meadow',
            'to': {'map': 'meadow', 'spawn': 'brackenwake-return'},
        }
    ]
    # --- authored props: hand-placed habitat details, benches, lanterns and fences ---
    def group(sprite, kind, w, points, solid=None, piece=None):
        g = {'sprite': sprite, 'kind': kind, 'w': w}
        if solid:
            g['solid'] = solid
        g['at'] = [[round(x, 1), round(y, 1)] for x, y in points]
        if piece:
            g['piece'] = piece
        return g

    props = [
        # press green: benches and a lantern to make a social space
        group('wood-plank-stack', 'scenery', 32, [(41.0, 21.6), (45.0, 21.8), (47.0, 17.6)], 0.3, 'press-green'),
        group('prop-hanging-lantern', 'scenery', 36, [(41.2, 16.8), (47.8, 20.6)], 0.2, 'press-green'),
        group('plant-pot-yellow-bloom', 'scenery', 28, [(42.2, 12.0), (44.0, 16.4)], None, 'press-green'),
        # ranger hall front
        group('plant-pot-red-bloom', 'scenery', 28, [(16.6, 14.0), (23.4, 12.4)], None, 'ranger-hall'),
        group('wood-firewood-bundle', 'scenery', 26, [(20.6, 8.8), (22.6, 12.6)], None, 'ranger-hall'),
        # the keeper's cottage: a lived-in house on the west street (scenery, so the town has one landmark building)
        group('cottage-tiled', 'scenery', 112, [(13.5, 28.0)], 1.0, 'keeper'),
        group('plant-pot-round', 'scenery', 28, [(12.0, 31.0), (16.0, 31.0)], None, 'keeper'),
        group('wood-plank-stack', 'scenery', 27, [(9.6, 28.6)], 0.3, 'keeper'),
        # sun-warmed wall along the west lane
        group('prop-orchard-wall-broken', 'scenery', 68, [(9.0, 23.8), (13.0, 23.2)], 0.4, 'warm-wall'),
        # survey bridge approaches
        group('prop-hanging-lantern', 'scenery', 36, [(29.6, 29.8), (29.6, 34.4), (26.2, 34.4)], 0.2, 'survey-bridge'),
        group('wood-plank-stack', 'scenery', 27, [(30.0, 31.2)], 0.3, 'survey-bridge'),
        # habitat garden: nest boxes, trough, straw and planted beds
        group('wood-plank-stack', 'scenery', 32, [(21.0, 38.6), (35.4, 37.2)], 0.3, 'habitat-garden'),
        group('straw-bundle', 'scenery', 24, [(20.8, 40.6), (23.0, 41.2), (25.4, 40.4), (33.0, 40.8)], None, 'habitat-garden'),
        group('plant-pot-fronds', 'scenery', 28, [(29.6, 37.4), (33.2, 38.4), (30.6, 39.8)], None, 'habitat-garden'),
        group('plant-pot-small', 'scenery', 24, [(27.4, 40.6), (29.0, 41.2), (31.2, 41.4)], None, 'habitat-garden'),
        group('plant-sprout', 'grass', 24, [(26.0, 38.2), (34.4, 38.8), (24.4, 38.6)], None, 'habitat-garden'),
        group('bush-flowering', 'flower', 32, [(22.4, 36.8), (35.0, 36.2), (20.0, 37.8)], None, 'habitat-garden'),
        # a view out over the water: the red spires of the far shore
        group('rock-spire-red', 'scenery', 71, [(46.8, 34.8), (50.0, 33.4), (49.0, 37.0)], 0.36, 'far-shore'),
        # the spring commons: reeds and flowers at the pond edge
        group('cattail-clump', 'scenery', 43, [(23.4, 21.6), (33.6, 17.6), (24.2, 17.2)], 0.28, 'spring-edge'),
        group('bush-flowering', 'flower', 32, [(25.0, 24.2), (31.0, 26.2), (35.4, 22.6), (21.6, 24.6)], None, 'spring-edge'),
    ]
    props.extend(scatter(rows, landmarks, spawns, exits, props))
    return {
        'format': 1,
        'id': 'brackenwake-commons',
        'biome': 'meadow',
        'name': 'Brackenwake Commons',
        'preview': 'cottage-tiled',
        'size': {'w': W, 'h': H},
        'legend': {'.': 'void', 'g': 'ground', 'p': 'path', 'w': 'water', 't': 'tallgrass'},
        'terrain': rows,
        'spawns': spawns,
        'landmarks': landmarks,
        'exits': exits,
        'props': props,
        'zones': [],
        'triggers': [
            {
                'id': 'arrival',
                'at': [28.0, 7.5],
                'radius': 3,
                'on': 'enter',
                'once': True,
                'do': [{'type': 'environment', 'text': 'Roofs, a ring of paths and a spring-fed green: Brackenwake Commons. The way back north stays open.'}],
            },
            {
                'id': 'bridge-view',
                'at': [28.0, 30.5],
                'radius': 2.4,
                'on': 'enter',
                'once': True,
                'do': [{'type': 'environment', 'text': 'The old survey bridge: the garden lies south, and red spires stand on the far shore.'}],
            },
        ],
    }


def scatter(rows, landmarks, spawns, exits, props):
    """Decorative oaks and bushes in open ground, away from paths, water, buildings and services."""
    rng = random.Random('brackenwake-commons')
    taken = [(l['at'][0], l['at'][1], 3.2 if l['kind'] == 'cottage' else 1.8) for l in landmarks]
    taken += [(p[0], p[1], 1.6) for g in props for p in g['at']]
    taken += [(sp[0], sp[1], 3.0) for sp in spawns.values()]
    taken += [(e['at'][0], e['at'][1], 3.0) for e in exits]

    def clear(x, y, r):
        for ty in range(int(y - r), int(y + r) + 2):
            for tx in range(int(x - r), int(x + r) + 2):
                if not (0 <= tx < W and 0 <= ty < H) or rows[ty][tx] in 'p.w':
                    if math.hypot(tx + 0.5 - x, ty + 0.5 - y) <= r:
                        return False
        return True

    out = {'tree-oak': [], 'tree-oak-round': [], 'bush-woodland-low': []}
    for _ in range(6000):
        x, y = rng.uniform(3, W - 3), rng.uniform(3, H - 3)
        kind = rng.choice(['tree-oak', 'tree-oak-round', 'bush-woodland-low'])
        radius = 1.5 if kind != 'bush-woodland-low' else 0.9
        if len(out[kind]) >= (9 if kind != 'bush-woodland-low' else 12):
            continue
        if not clear(x, y, radius + 0.6):
            continue
        if any(math.hypot(x - tx, y - ty) < tr + radius + 0.4 for tx, ty, tr in taken):
            continue
        out[kind].append((round(x, 1), round(y, 1)))
        taken.append((x, y, radius))
        if sum(len(v) for v in out.values()) >= 30:
            break
    groups = []
    for sprite, pts in out.items():
        if not pts:
            continue
        if sprite == 'tree-oak':
            groups.append({'sprite': sprite, 'kind': 'scenery', 'w': 79, 'solid': 0.52, 'at': [list(p) for p in pts], 'piece': 'town-trees'})
        elif sprite == 'tree-oak-round':
            groups.append({'sprite': sprite, 'kind': 'scenery', 'w': 72, 'solid': 0.48, 'at': [list(p) for p in pts], 'piece': 'town-trees'})
        else:
            groups.append({'sprite': sprite, 'kind': 'flower', 'w': 31, 'at': [list(p) for p in pts], 'piece': 'town-bushes'})
    return groups


def main():
    built = build()
    text = json.dumps(built, indent=2) + '\n'
    if '--check' in sys.argv:
        # The committed file is Prettier-formatted, so compare the data, not the bytes.
        if not OUT.exists() or json.loads(OUT.read_text()) != built:
            print('out of date: brackenwake-commons')
            sys.exit(1)
        print('unchanged')
        return
    OUT.write_text(text)
    print('wrote', OUT.name)


main()
