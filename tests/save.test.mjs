import test from 'node:test';
import assert from 'node:assert/strict';
import {create, KEYS} from '../dist/src/save.js';

const species = ['fernling', 'emberkin', 'brooklet', 'duskwing', 'voltkit', 'mushmallow', 'frostowl', 'pebblit'].map((id, i) => ({id, hp: 40 + i}));
const regions = ['meadow', 'amber-ridge', 'frostveil-grove'].map(id => ({id}));
const codec = create({species, regions, size: 25});
const store = (init = {}) => {
  const m = new Map(Object.entries(init));
  return {m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v))};
};
const v2 = over =>
  JSON.stringify({
    version: 2,
    region: 1,
    x: 5,
    y: 6,
    active: 1,
    orbs: 7,
    potions: 2,
    coins: 50,
    seen: [0, 1, 2],
    caught: [0, 1],
    team: {0: {xp: 90, hp: 30}, 1: {xp: 10, hp: 20}},
    badges: [0],
    chests: [0],
    visited: [0, 1],
    met: true,
    wins: 3,
    playTime: 99,
    ...over,
  });

test('malformed nested team fixture does not throw and is playable', () => {
  const r = codec.load(store({[KEYS.v2]: v2({team: {0: 7}, caught: [0]})}));
  assert.equal(r.status, 'migrated');
  assert.equal(r.save.team[0].xp, 0);
  assert.ok(r.save.team[0].hp > 0);
});
test('v2 progress is preserved when migrated to stable IDs', () => {
  const s = store({[KEYS.v2]: v2()}),
    r = codec.load(s);
  assert.deepEqual([r.save.caught, r.save.badges, r.save.region, r.save.orbs, r.save.coins, r.save.team[0].xp], [[0, 1], [0], 1, 7, 50, 90]);
  const out = JSON.parse(codec.serialize(r.save));
  assert.equal(out.version, 3);
  assert.deepEqual(out.caught, ['fernling', 'emberkin']);
  assert.deepEqual(out.badges, ['meadow']);
  assert.equal(out.region, 'amber-ridge');
  assert.equal(s.m.get(KEYS.v2), v2(), 'legacy payload is left untouched');
});
test('v3 identities survive reordering of definitions', () => {
  const r = codec.load(store({[KEYS.v2]: v2()}));
  const raw = codec.serialize(r.save),
    reordered = create({species: [...species].reverse(), regions, size: 25});
  const back = reordered.load(store({[KEYS.v3]: raw})).save;
  assert.deepEqual(back.caught.map(i => [...species].reverse()[i].id).sort(), ['emberkin', 'fernling']);
  assert.equal([...species].reverse()[back.active].id, 'emberkin');
});
test('v3 round trip is unchanged and checkpoints a backup', () => {
  const raw = codec.serialize(codec.fresh()),
    s = store({[KEYS.v3]: raw}),
    r = codec.load(s);
  assert.equal(r.status, 'ok');
  assert.equal(codec.serialize(r.save), raw);
  assert.equal(s.m.get(KEYS.backup), raw);
});
test('positions near the far edge of the large-map coordinate range survive reload', () => {
  const largeMapCodec = create({
    species,
    regions,
    size: 128,
    bounds: {
      meadow: {w: 25, h: 25, spawn: {x: 12, y: 13}},
      'amber-ridge': {w: 120, h: 80, spawn: {x: 2, y: 3}},
    },
  });
  const save = largeMapCodec.fresh();
  save.region = 1;
  save.badges = [0];
  save.x = 119;
  save.y = 79;
  const restored = largeMapCodec.load(store({[KEYS.v3]: largeMapCodec.serialize(save)}));
  assert.deepEqual([restored.save.region, restored.save.x, restored.save.y], [1, 119, 79]);
  save.x = 190;
  save.y = 190;
  const bounded = largeMapCodec.normalize(JSON.parse(largeMapCodec.serialize(save)), false);
  assert.deepEqual([bounded.x, bounded.y], [119, 79]);
});
test('v1 saves migrate', () => {
  const r = codec.load(store({[KEYS.v1]: JSON.stringify({seen: [0, 2], caught: [0, 2], orbs: 4, wins: 2, met: true, hp: 30})}));
  assert.equal(r.status, 'migrated');
  assert.deepEqual(r.save.caught, [0, 2]);
  assert.equal(r.save.orbs, 4);
  assert.equal(r.save.team[0].xp, 28);
});
test('extreme, NaN-like, duplicate and unknown values are sanitized', () => {
  const r = codec.load(
    store({
      [KEYS.v2]: v2({
        orbs: 1e308,
        coins: 'x',
        potions: -5,
        x: null,
        y: 9999,
        seen: [1, 1, 99, 'a', null],
        caught: [3, 3, 42],
        active: 77,
        region: 9,
        team: {3: {xp: -1, hp: 1e9}},
      }),
    }),
  ).save;
  assert.deepEqual([r.orbs, r.coins, r.potions, r.region], [99, 0, 0, 0]);
  assert.deepEqual([r.x, r.y], [12, 24]);
  assert.deepEqual(r.caught, [3]);
  assert.deepEqual(r.seen, [1, 3]);
  assert.equal(r.active, 3);
  assert.equal(r.team[3].hp, species[3].hp);
  assert.equal(r.team[3].xp, 0);
});
test('locked region falls back to the meadow', () => assert.equal(codec.load(store({[KEYS.v2]: v2({badges: [], region: 2})})).save.region, 0));
test('corrupt JSON is quarantined and a fresh save starts', () => {
  const s = store({[KEYS.v3]: '{"version":3,'}),
    r = codec.load(s);
  assert.equal(r.status, 'recovered');
  assert.equal(s.m.get(KEYS.v3), '{"version":3,', 'original is not erased');
  assert.equal(JSON.parse(s.m.get(KEYS.quarantine))[0].raw, '{"version":3,');
});
test('corrupt primary falls back to the checkpoint', () => {
  const good = codec.serialize(codec.load(store({[KEYS.v2]: v2()})).save),
    r = codec.load(store({[KEYS.v3]: 'nope', [KEYS.backup]: good}));
  assert.equal(r.status, 'restored');
  assert.deepEqual(r.save.caught, [0, 1]);
});
test('future schema is never overwritten', () => {
  const r = codec.load(store({[KEYS.v3]: JSON.stringify({version: 9})}));
  assert.equal(r.status, 'future');
  assert.equal(r.writable, false);
});
test('unavailable storage plays in memory', () => {
  const r = codec.load({
    getItem() {
      throw new Error('denied');
    },
  });
  assert.equal(r.status, 'unavailable');
  assert.equal(r.writable, false);
  assert.equal(r.save.caught[0], 0);
});
test('non-object payloads are recovered', () => {
  for (const bad of ['null', '[]', '7', '"x"']) assert.equal(codec.load(store({[KEYS.v3]: bad})).status, 'recovered');
});

test('random starter uses injected RNG and stays consistent through save/load', () => {
  for (const roll of [0, 0.4, 0.99]) {
    const s = codec.fresh(() => roll);
    assert.deepEqual(s.caught, [s.active]);
    assert.deepEqual(s.party, [s.active]);
    assert.deepEqual(s.seen, [s.active]);
    assert.ok(s.team[s.active].hp > 0);
    assert.equal(codec.normalize(JSON.parse(codec.serialize(s))).active, s.active);
  }
});
