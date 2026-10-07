import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const ids = ['meadow', 'orchard-ruins', 'reedfen-wetlands', 'stilt-isles', 'amber-ridge', 'stone-basin', 'frostveil-grove', 'frostveil-pass'];
const load = id => JSON.parse(readFileSync(new URL(`../dist/maps/${id}.json`, import.meta.url), 'utf8'));

test('every adventure map carries authored set pieces on open land', () => {
  for (const id of ids) {
    const m = load(id);
    const groups = m.props.filter(g => g.piece);
    assert.ok(new Set(groups.map(g => g.piece)).size >= 3, `${id} needs at least three set pieces`);
    for (const g of groups)
      for (const [x, y] of g.at) assert.ok('gt'.includes(m.terrain[Math.floor(y)][Math.floor(x)]), `${id} ${g.piece} at ${x},${y} is not on land`);
  }
});

test('set pieces never crowd spawns, exits, landmarks or paths a player needs', () => {
  for (const id of ids) {
    const m = load(id);
    const keep = [...Object.values(m.spawns), ...m.exits.map(e => e.at), ...m.landmarks.map(l => l.at)];
    for (const g of m.props.filter(p => p.piece && p.solid))
      for (const [x, y] of g.at) {
        for (const [kx, ky] of keep) assert.ok(Math.hypot(x - kx, y - ky) > 2.5, `${id} ${g.piece} blocks ${kx},${ky}`);
        assert.notEqual(m.terrain[Math.floor(y)][Math.floor(x)], 'p', `${id} ${g.piece} stands on a path`);
      }
  }
});

test('the committed maps match the set piece generator', () => {
  const r = spawnSync('python3', ['scripts/gen-set-pieces.py', '--check'], {encoding: 'utf8'});
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
