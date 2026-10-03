#!/usr/bin/env python3
"""One-off authoring aid for the wetland pair (#52): writes dist/maps/reedfen-wetlands.json and stilt-isles.json.

The maps are plain data once written; re-running this script regenerates them from the layout below.
"""
import json, math, random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / 'dist' / 'maps'
LEGEND = {'.': 'void', 'g': 'ground', 'p': 'path', 'w': 'water', 't': 'tallgrass'}


class Grid:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.c = [['.'] * w for _ in range(h)]

    def inside(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h

    def set(self, x, y, ch, only=None):
        if self.inside(x, y) and (only is None or self.c[y][x] in only):
            self.c[y][x] = ch

    def get(self, x, y):
        return self.c[y][x] if self.inside(x, y) else '.'

    def ellipse(self, cx, cy, rx, ry, ch, only=None):
        for y in range(self.h):
            for x in range(self.w):
                if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1:
                    self.set(x, y, ch, only)

    def rect(self, x0, y0, x1, y1, ch, only=None):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.set(x, y, ch, only)

    def ring(self, ch, n):
        """Wrap the land in n tiles of `ch` where there is void."""
        for _ in range(n):
            add = []
            for y in range(self.h):
                for x in range(self.w):
                    if self.c[y][x] == '.' and any(self.get(x + dx, y + dy) in 'gptw' and self.get(x + dx, y + dy) != '.' for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1))):
                        add.append((x, y))
            for x, y in add:
                self.c[y][x] = ch

    def path(self, pts, width=2):
        """Draw a boardwalk/trail through waypoints (tile coords), `width` tiles wide."""
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            n = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
            for i in range(n + 1):
                x = x0 + (x1 - x0) * i / n
                y = y0 + (y1 - y0) * i / n
                for dx in range(width):
                    for dy in range(width):
                        self.set(int(x) + dx - (width - 1) // 2 - (1 if width % 2 == 0 else 0) + (1 if width % 2 == 0 else 0), int(y) + dy - (width // 2 if width % 2 else 0) , 'p')

    def rows(self):
        return [''.join(r) for r in self.c]

    def near(self, x, y, chars, r):
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if self.get(int(x) + dx, int(y) + dy) in chars:
                    return True
        return False


def river(g, cx, amp, period, y0, y1, half):
    for y in range(y0, y1):
        x = cx + amp * math.sin(y / period)
        for xx in range(int(x - half), int(x + half) + 1):
            g.set(xx, y, 'w', only='g')


def scatter(g, rng, count, ok, avoid):
    out = []
    tries = 0
    while len(out) < count and tries < count * 200:
        tries += 1
        x = rng.randrange(2, g.w - 2) + rng.choice([0.2, 0.5, 0.8])
        y = rng.randrange(2, g.h - 2) + rng.choice([0.2, 0.5, 0.8])
        if g.get(int(x), int(y)) not in 'gt':
            continue
        if not ok(x, y) or g.near(x, y, 'p', 2) or any(math.hypot(x - ax, y - ay) < r for ax, ay, r in avoid):
            continue
        if any(math.hypot(x - ox, y - oy) < 1.1 for ox, oy in out):
            continue
        out.append((x, y))
    return [[round(x, 1), round(y, 1)] for x, y in out]


def patches(g, rng, spots):
    for cx, cy, rx, ry in spots:
        for y in range(g.h):
            for x in range(g.w):
                if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1 + rng.uniform(-0.25, 0.2):
                    g.set(x, y, 't', only='g')


def props_for(g, rng, avoid, n_cat, n_tuft, n_bush):
    cat = scatter(g, rng, n_cat, lambda x, y: g.near(x, y, 'w', 3), avoid)
    tuft = scatter(g, rng, n_tuft, lambda x, y: True, avoid)
    bush = scatter(g, rng, n_bush, lambda x, y: not g.near(x, y, 'w', 1), avoid)
    return [
        {'sprite': 'cattail-clump', 'kind': 'scenery', 'w': 43, 'solid': 0.28, 'at': cat},
        {'sprite': 'grass-tuft', 'kind': 'grass', 'w': 27, 'at': tuft},
        {'sprite': 'bush-flowering', 'kind': 'flower', 'w': 32, 'at': bush},
    ]


def clear(g, x0, y0, x1, y1):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if g.get(x, y) == 't':
                g.set(x, y, 'g')


# ---------------------------------------------------------------- Reedfen
def reedfen():
    rng = random.Random(52)
    g = Grid(64, 56)
    for e in [(33, 28, 28, 23), (11, 28, 10, 7), (50, 12, 11, 9), (52, 44, 10, 8), (17, 10, 10, 7), (16, 46, 9, 7)]:
        g.ellipse(*e, 'g')
    g.rect(1, 26, 8, 30, 'g')  # entry tab to the west
    g.rect(52, 42, 61, 46, 'g')  # exit tab to the east
    g.ring('w', 2)
    g.rect(0, 26, 1, 30, 'w', only='.')
    for e in [(22, 18, 5, 3.5), (44, 36, 6, 4), (24, 38, 4.5, 3), (46, 22, 4, 3), (36, 8, 3, 2.5)]:
        g.ellipse(*e, 'w', only='g')
    river(g, 34, 3, 6, 3, 53, 1.5)
    g.ellipse(44, 36, 1.8, 1.4, 'g')  # chest islet in the south lake
    # trails and boardwalks
    main = [(3, 28), (10, 28), (16, 26), (22, 28), (28, 27), (34, 28), (40, 26), (46, 22), (50, 17), (50, 13)]
    north = [(22, 28), (24, 22), (26, 16), (30, 12), (34, 14), (40, 12), (46, 12), (50, 13)]
    south = [(28, 27), (28, 34), (30, 40), (34, 44), (40, 46), (46, 46), (52, 44), (60, 44)]
    islet = [(40, 46), (42, 42), (44, 39), (44, 37)]
    heron = [(26, 16), (22, 12), (18, 9), (16, 8)]
    reedbed = [(16, 26), (15, 34), (15, 42), (17, 46)]
    for p in (main, north, south, islet, heron, reedbed):
        g.path(p)
    patches(g, rng, [(14, 20, 4, 3), (21, 33, 4, 3), (8, 36, 3, 3), (28, 21, 3, 3), (38, 31, 4, 3), (40, 20, 3, 3), (47, 29, 4, 3), (23, 8, 4, 3), (16, 44, 4, 3), (55, 36, 3, 3), (56, 14, 3, 3), (45, 49, 3, 2), (40, 16, 3, 2), (30, 48, 3, 2)])
    for box in [(0, 24, 14, 32), (46, 8, 54, 18), (56, 40, 62, 48), (14, 6, 20, 12), (31, 24, 38, 31), (30, 42, 38, 48), (41, 8, 47, 14), (42, 35, 46, 41)]:
        clear(g, *box)
    L = {
        'cottage': (13.5, 24.4), 'ranger': (9.5, 25.4), 'sign': (6.5, 28.8), 'shrine': (50, 9.4), 'chest': (44.2, 36.6),
        'heron': (16.4, 8.2), 'west': (1.9, 28), 'east': (60.2, 44),
    }
    avoid = [(x, y, 2.2) for x, y in L.values()]
    props = props_for(g, rng, avoid, 110, 70, 36)
    quiet = [
        {'id': 'camp-boardwalk', 'rect': [2, 25, 24, 31], 'label': 'Camp boardwalk'},
        {'id': 'shrine-approach', 'rect': [46, 8, 54, 18], 'label': 'Shrine approach'},
        {'id': 'river-crossing', 'rect': [31, 25, 38, 31], 'label': 'River crossing'},
        {'id': 'east-landing', 'rect': [56, 41, 62, 47], 'label': 'Stilt landing'},
    ]
    data = {
        'format': 1, 'id': 'reedfen-wetlands', 'biome': 'wetland', 'name': 'Reedfen Wetlands',
        'size': {'w': g.w, 'h': g.h}, 'legend': LEGEND, 'terrain': g.rows(),
        'spawns': {'camp': [4, 28], 'stilt-return': [58.5, 44], 'shrine-landing': [48.5, 14.5]},
        'landmarks': [
            {'id': 'shrine', 'kind': 'shrine', 'sprite': 'shrine-crystal-stone', 'at': list(L['shrine']), 'w': 99, 'solid': 0.65, 'label': 'Visit the shrine', 'flag': 'reedfen-wetlands.seal', 'mapLabel': 'Crystal shrine', 'guardian': {'species': 'siltkip', 'level': 14, 'tactic': 'tidal-current', 'power': 2}, 'reward': {'coins': 75, 'potions': 2, 'xp': 80}},
            {'id': 'cottage', 'kind': 'cottage', 'sprite': 'cottage-tiled', 'at': list(L['cottage']), 'w': 133, 'solid': 1.15, 'mapLabel': "Nell's cottage"},
            {'id': 'ranger', 'kind': 'ranger', 'sprite': 'person-gardener', 'at': list(L['ranger']), 'w': 37, 'label': 'Talk to Ranger Nell', 'name': 'Ranger Nell', 'tag': 'NELL', 'mapLabel': 'Supply point', 'lines': [
                {'when': {'flag': 'reedfen-wetlands.seal'}, 'text': "Reedfen's pools are quiet again. The boardwalk east reaches the stilt isles."},
                {'text': 'The boardwalks are safe to follow. The river is wide; cross where the planks are laid, then look north for the crystal shrine.'}]},
            {'id': 'sign', 'kind': 'sign', 'sprite': 'signpost-wood', 'at': list(L['sign']), 'w': 38, 'label': 'Read the trail sign', 'mapLabel': 'Trail sign', 'text': 'West: Frostveil Grove · North-east: the crystal shrine · South-east: the stilt isles · Gold: treasure'},
            {'id': 'chest', 'kind': 'chest', 'sprite': 'chest-wooden', 'at': list(L['chest']), 'w': 44, 'label': 'Open the treasure chest', 'flag': 'reedfen-wetlands.chest', 'mapLabel': 'Islet chest', 'reward': {'coins': 35, 'potions': 2, 'orbs': 4}},
            {'id': 'heron-blind', 'kind': 'sign', 'sprite': 'signpost-wood', 'at': list(L['heron']), 'w': 38, 'label': 'Read the weathered note', 'secret': True, 'mapLabel': 'Heron blind', 'text': 'A hide for watching herons. Someone scratched in the plank: the shrine guardian loves a strong current.'},
        ],
        'exits': [
            {'id': 'west', 'sprite': 'signpost-wood', 'at': list(L['west']), 'w': 40, 'label': 'Return to Frostveil Grove', 'to': {'map': 'frostveil-grove', 'spawn': 'camp'}},
            {'id': 'east-to-stilts', 'sprite': 'signpost-wood', 'at': list(L['east']), 'w': 40, 'label': 'Take the stilt boardwalk', 'to': {'map': 'stilt-isles', 'spawn': 'camp'}},
        ],
        'props': props,
        'zones': [
            {'id': 'reed-shallows', 'terrain': ['t'], 'rect': [0, 0, 31, 55], 'pool': [{'species': 'brooklet', 'weight': 5}, {'species': 'mushmallow', 'weight': 4}, 'siltkip'], 'level': [11, 12], 'distance': [5, 9]},
            {'id': 'reed-deeps', 'terrain': ['t'], 'pool': [{'species': 'siltkip', 'weight': 4}, {'species': 'brooklet', 'weight': 3}, {'species': 'mushmallow', 'weight': 3}], 'level': [12, 14], 'distance': [4, 8]},
        ],
        'quiet': quiet,
        'triggers': [
            {'id': 'reed-whistle', 'at': [16, 44.5], 'radius': 2, 'on': 'enter', 'once': True, 'do': [{'type': 'toast', 'text': 'A reed whistle trills somewhere in the bed. The hush here is safe.'}]},
        ],
    }
    return data, g


# ---------------------------------------------------------------- Stilt isles
def stilts():
    rng = random.Random(53)
    g = Grid(72, 44)
    isl = {'A': (10, 22, 7, 6), 'B': (24, 11, 6, 5), 'C': (24, 33, 6, 5), 'D': (38, 22, 8, 6.5), 'E': (52, 9, 6, 5), 'F': (52, 34, 7, 5), 'G': (64, 22, 6, 6), 'H': (40, 39, 3, 2.2)}
    for e in isl.values():
        g.ellipse(*e, 'g')
    g.rect(1, 20, 6, 24, 'g')
    g.ring('w', 3)
    g.rect(0, 19, 2, 25, 'w', only='.')
    g.rect(1, 20, 6, 24, 'g', only='w')
    walks = [
        [(10, 22), (14, 18), (19, 14), (24, 12)],  # A-B
        [(10, 22), (14, 27), (19, 31), (24, 33)],  # A-C
        [(24, 12), (29, 15), (33, 19), (38, 22)],  # B-D
        [(24, 33), (29, 30), (33, 26), (38, 22)],  # C-D
        [(38, 22), (43, 17), (48, 13), (52, 10)],  # D-E
        [(38, 22), (43, 28), (48, 31), (52, 34)],  # D-F
        [(52, 10), (58, 14), (62, 18), (64, 22)],  # E-G
        [(52, 34), (58, 30), (62, 26), (64, 22)],  # F-G
        [(38, 22), (44, 22), (50, 22), (58, 22), (64, 22)],  # D-G direct
        [(52, 34), (47, 37), (43, 38), (40, 39)],  # F-H (lantern islet)
        [(3, 22), (10, 22)],  # entry
    ]
    for w in walks:
        g.path(w)
    patches(g, rng, [(8, 17, 3, 2), (24, 8, 3, 2), (22, 35, 3, 2), (36, 18, 3, 2), (41, 26, 3, 2), (54, 6, 3, 2), (55, 36, 3, 2), (66, 19, 2, 2), (61, 24, 2, 2), (14, 25, 2.5, 2)])
    for box in [(0, 18, 14, 26), (34, 19, 42, 26), (62, 19, 68, 25), (38, 37, 42, 41)]:
        clear(g, *box)
    L = {'ranger': (36.2, 24.8), 'cottage': (41.5, 19.6), 'sign': (6.5, 22.8), 'chest': (66.5, 21.5), 'lantern': (40.3, 39.2), 'west': (1.9, 22), 'north': (52, 6.2)}
    avoid = [(x, y, 2.2) for x, y in L.values()]
    props = props_for(g, rng, avoid, 90, 50, 26)
    data = {
        'format': 1, 'id': 'stilt-isles', 'biome': 'wetland', 'name': 'Stilt Isles',
        'size': {'w': g.w, 'h': g.h}, 'legend': LEGEND, 'terrain': g.rows(),
        'spawns': {'camp': [4, 22]},
        'landmarks': [
            {'id': 'stilt-hut', 'kind': 'cottage', 'sprite': 'cottage-tiled', 'at': list(L['cottage']), 'w': 133, 'solid': 1.15, 'mapLabel': 'Stilt hut'},
            {'id': 'stilt-warden', 'kind': 'ranger', 'sprite': 'person-gardener', 'at': list(L['ranger']), 'w': 37, 'label': 'Talk to Stilt Warden Ode', 'name': 'Stilt Warden Ode', 'tag': 'ODE', 'mapLabel': 'Supply point', 'lines': [
                {'when': {'flag': 'reedfen-wetlands.seal'}, 'text': 'The crystal shrine is awake. The north landing walks you back to it. Lantern islet has a view worth the detour.'},
                {'text': 'Rest in the hut any time. Every plank here is sound; the tall grass between the isles is where the shy ones hide.'}]},
            {'id': 'stilt-sign', 'kind': 'sign', 'sprite': 'signpost-wood', 'at': list(L['sign']), 'w': 38, 'label': 'Read the plank sign', 'mapLabel': 'Plank sign', 'text': 'West: Reedfen · Centre: the warden\'s hut · East: the summit isle · South: a small lantern islet'},
            {'id': 'stilt-chest', 'kind': 'chest', 'sprite': 'chest-wooden', 'at': list(L['chest']), 'w': 44, 'label': 'Open the summit chest', 'flag': 'stilt-isles.chest', 'mapLabel': 'Summit chest', 'reward': {'coins': 45, 'potions': 2, 'orbs': 4}},
            {'id': 'lantern-note', 'kind': 'sign', 'sprite': 'signpost-wood', 'at': list(L['lantern']), 'w': 38, 'label': 'Read the lantern note', 'secret': True, 'mapLabel': 'Lantern islet', 'text': 'A hanging lantern for night crossings. Keep to the planks and the water keeps its distance.'},
        ],
        'exits': [
            {'id': 'back-to-reedfen', 'sprite': 'signpost-wood', 'at': list(L['west']), 'w': 40, 'label': 'Return to Reedfen', 'to': {'map': 'reedfen-wetlands', 'spawn': 'stilt-return'}},
            {'id': 'north-landing', 'sprite': 'signpost-wood', 'at': list(L['north']), 'w': 40, 'label': 'Take the high boardwalk to the Reedfen shrine', 'to': {'map': 'reedfen-wetlands', 'spawn': 'shrine-landing'}},
        ],
        'props': props,
        'zones': [
            {'id': 'isle-grass', 'terrain': ['t'], 'pool': [{'species': 'mushmallow', 'weight': 4}, {'species': 'brooklet', 'weight': 3}, {'species': 'siltkip', 'weight': 3}], 'level': [12, 14], 'distance': [4, 8]},
        ],
        'quiet': [
            {'id': 'entry-walk', 'rect': [1, 19, 14, 25], 'label': 'Entry walk'},
            {'id': 'warden-hut', 'rect': [34, 19, 43, 26], 'label': 'Warden hut'},
            {'id': 'summit-approach', 'rect': [60, 19, 68, 25], 'label': 'Summit isle'},
            {'id': 'lantern-walk', 'rect': [40, 36, 50, 41], 'label': 'Lantern walk'},
        ],
        'triggers': [
            {'id': 'high-boardwalk', 'at': [52, 8], 'radius': 2.5, 'on': 'enter', 'once': True, 'do': [{'type': 'toast', 'text': 'The high boardwalk hums underfoot. Reedfen\'s shrine is a short walk beyond.'}]},
        ],
    }
    return data, g


if __name__ == '__main__':
    for fn in (reedfen, stilts):
        data, g = fn()
        (ROOT / f"{data['id']}.json").write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')
        print(data['id'], g.w, g.h, sum(r.count('g') + r.count('p') + r.count('t') for r in g.rows()), 'walkable')
