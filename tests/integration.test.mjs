// Whole-adventure integration (#27): the connected routes, unlock order, return trips, spawns and saves of every shipped map.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {codec, content, mapsById, newSave, rawMaps, rawPack} from './helpers.mjs';

const raw = rawMaps();
const byId = new Map(raw.map(m => [m.id, m]));
const pack = rawPack();
const flagsOf = m => [...m.landmarks.filter(l => l.flag).map(l => l.flag)];
const dist = ([ax, ay], [bx, by]) => Math.hypot(ax - bx, ay - by);
/** Maps reachable from the first map once exactly `held` flags are held; flags are earned on the maps you reach. */
function reach(start, earnable = true) {
  const held = new Set();
  const seen = new Set([start]);
  for (let changed = true; changed;) {
    changed = false;
    for (const id of [...seen]) {
      const m = byId.get(id);
      if (earnable) for (const f of flagsOf(m)) if (!held.has(f)) (held.add(f), (changed = true));
      for (const e of m.exits) if (!seen.has(e.to.map) && (!e.requires || held.has(e.requires))) (seen.add(e.to.map), (changed = true));
    }
  }
  return {seen, held};
}

test('every shipped map opens up in the intended progression and is listed by the pack', () => {
  assert.deepEqual(
    pack.maps,
    raw.map(m => m.id),
  );
  const {seen, held} = reach(pack.maps[0]);
  assert.deepEqual([...seen].sort(), [...pack.maps].sort());
  for (const flag of pack.milestones) assert.ok(held.has(flag), `${flag} is earnable`);
  // a fresh save (no seals) still reaches the first biome's maps but not the gated ones
  const early = reach(pack.maps[0], false).seen;
  assert.ok(early.has('orchard-ruins') && !early.has('frostveil-grove'));
});

test('every exit has a way back: the route graph is strongly connected once the seals are earned', () => {
  for (const m of raw) {
    for (const e of m.exits) {
      const target = byId.get(e.to.map);
      assert.ok(target.spawns[e.to.spawn], `${m.id}/${e.id} lands on a real spawn`);
      assert.ok(
        target.exits.some(x => x.to.map === m.id),
        `${e.to.map} has an exit back to ${m.id} (arrived by ${m.id}/${e.id})`,
      );
    }
    assert.ok(reach(m.id).seen.size === raw.length, `${m.id} can reach every map`);
  }
});

/** Onward loops that deliberately land beside a different landmark (the shrine, the overlook) instead of at the way back. */
const LOOP_EXITS = new Set(['stilt-isles/north-landing', 'stone-basin/east-gate']);

test('arrival spawns are close to the exit that leads back, never on top of one', () => {
  for (const m of raw) {
    for (const e of m.exits) {
      const target = byId.get(e.to.map);
      const spawn = target.spawns[e.to.spawn];
      const back = target.exits.filter(x => x.to.map === m.id);
      const nearest = Math.min(...back.map(x => dist(spawn, x.at)));
      if (!LOOP_EXITS.has(`${m.id}/${e.id}`))
        assert.ok(nearest <= 16, `${m.id}/${e.id}: you land ${nearest.toFixed(1)} tiles from the way back in ${target.id}`);
      for (const x of target.exits) assert.ok(dist(spawn, x.at) >= 0.9, `${target.id}: spawn ${e.to.spawn} is too close to exit ${x.id}`);
    }
  }
});

test('every spawn sits on walkable ground inside its map', () => {
  for (const m of raw) {
    for (const [name, [x, y]] of Object.entries(m.spawns)) {
      assert.ok(x >= 0 && y >= 0 && x < m.size.w && y < m.size.h, `${m.id}/${name} is inside`);
      assert.match(m.terrain[Math.floor(y)][Math.floor(x)], /[gpt]/, `${m.id}/${name} is on land`);
    }
  }
});

test('each biome is recognisable: pairs differ in layout and no two maps share a geometry', () => {
  const shapes = new Map();
  for (const m of raw) {
    const key = m.terrain.join('/');
    assert.ok(!shapes.has(key), `${m.id} repeats the terrain of ${shapes.get(key)}`);
    shapes.set(key, m.id);
  }
  const biomes = Map.groupBy(raw, m => m.biome);
  assert.equal(biomes.size, 4);
  for (const [biome, maps] of biomes) {
    assert.ok(maps.length >= 2, `${biome} has a map pair`);
    // the pair differ in size, in how much of the map is water/void, or in their activities
    const profile = m => `${m.size.w}x${m.size.h}:${m.terrain.join('').replace(/[gpt]/g, '').length}:${m.landmarks.map(l => l.kind).sort()}`;
    assert.equal(new Set(maps.map(profile)).size, maps.length, `${biome} pair is not a copy`);
  }
});

test('every species, challenge, chest and ending flag is reachable in the whole adventure', () => {
  const found = new Set(raw.flatMap(m => m.zones.flatMap(z => z.pool.map(p => p.species ?? p))));
  for (const id of pack.species) assert.ok(found.has(id), `${id} has an encounter zone`);
  const {held} = reach(pack.maps[0]);
  for (const m of raw) for (const f of flagsOf(m)) assert.ok(held.has(f), `${f} is awarded on a reachable map`);
  assert.equal(raw.flatMap(m => m.landmarks).filter(l => l.kind === 'shrine').length, pack.milestones.length);
});

test('saves keep their place on every map and restore after a round trip', () => {
  for (const m of raw) {
    const save = newSave();
    save.mapId = m.id;
    save.region = content.regions.findIndex(r => r.biome === m.biome);
    save.badges = Array.from({length: save.region}, (_, i) => i);
    save.visited = Array.from({length: save.region + 1}, (_, i) => i);
    save.visitedMaps = raw.map(r => r.id);
    [save.x, save.y] = m.spawns.camp;
    const back = codec.normalize(JSON.parse(codec.serialize(save)), false);
    assert.equal(back.mapId, m.id);
    assert.deepEqual([back.x, back.y], m.spawns.camp);
    assert.ok(mapsById[m.id], `${m.id} compiles`);
  }
});

test('docs/MAP_INVENTORY.md lists every shipped map', () => {
  const doc = readFileSync(new URL('../docs/MAP_INVENTORY.md', import.meta.url), 'utf8');
  for (const m of raw) assert.ok(doc.includes('`' + m.id + '`'), `${m.id} is in the inventory`);
});
