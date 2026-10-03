import test from 'node:test';
import assert from 'node:assert/strict';
import {GRACE_AFTER_BATTLE, GRACE_ON_ARRIVAL} from '../dist/src/config.js';
import {buildAdventure} from '../dist/src/domain/adventure.js';
import {encounterDistance, rollWild} from '../dist/src/domain/battle.js';
import {movePlayer} from '../dist/src/domain/exploration.js';
import {seededRng} from '../dist/src/domain/rng.js';
import {buildWorld, triggersAt} from '../dist/src/domain/world.js';
import {species} from '../dist/src/data/species.js';
import {content, maps, newSave, rawMaps, rawObjectives} from './helpers.mjs';

const edit = fn => {
  const m = rawMaps();
  fn(m);
  return buildAdventure(m, content, rawObjectives());
};
const meadow = m => m.find(x => x.id === 'meadow');
const has = (errors, text) =>
  assert.ok(
    errors.some(e => e.includes(text)),
    `expected "${text}" in:\n${errors.join('\n')}`,
  );

test('every species can be found, and a species with no source is rejected', () => {
  const found = new Set(maps.flatMap(m => m.zones.flatMap(z => z.pool)));
  assert.equal(found.size, species.length);
  const {errors} = edit(m => {
    for (const map of m)
      for (const zone of map.zones) zone.pool = zone.pool.filter(entry => (typeof entry === 'string' ? entry : entry.species) !== 'fernling');
    m.find(x => x.id === 'reedfen-wetlands').zones[0].pool = ['brooklet', 'mushmallow', 'siltkip'];
  });
  has(errors, 'species: "fernling" has no encounter zone');
});

test('each region hub has different encounters', () => {
  const pools = maps.map(m =>
    m.zones
      .flatMap(z => z.pool)
      .sort()
      .join(),
  );
  assert.equal(new Set(pools).size, maps.length);
  const levels = maps.map(m => m.zones[0].level[0]);
  assert.deepEqual(
    levels,
    [...levels].sort((a, b) => a - b),
  ); // later regions are higher level
});

test('all twelve species have a readable hint and a reachable source in their home biome', () => {
  assert.equal(species.length, 12);
  for (const creature of species) {
    assert.ok(creature.encounterHint?.trim(), `${creature.id} needs a field hint`);
    const home = maps.find(map => map.biome === creature.biome);
    assert.ok(home, `${creature.id} has a home map for ${creature.biome}`);
    assert.ok(
      home.zones.some(zone => zone.pool.includes(species.indexOf(creature))),
      `${creature.id} has a source in ${home.name}`,
    );
  }
});

test('weights bias the pick, and unseen creatures are favoured', () => {
  const zone = {pool: [0, 1, 2], weights: [1, 1, 8], level: [5, 5], distance: [4, 7]};
  const save = newSave();
  save.seen = [0, 1, 2]; // nothing unseen: pure weights
  const rng = seededRng(5);
  const counts = [0, 0, 0];
  for (let i = 0; i < 2000; i++) counts[rollWild(save, rng, zone).id]++;
  assert.ok(counts[2] > counts[0] * 4 && counts[2] > counts[1] * 4, counts.join());
  const fresh = newSave(); // only species 0 seen: unseen preference makes 1 and 2 common
  const unseen = [0, 0, 0];
  const rng2 = seededRng(6);
  for (let i = 0; i < 2000; i++) unseen[rollWild(fresh, rng2, zone).id]++;
  assert.ok(unseen[0] < counts[0], `seen creature is rarer when new ones exist: ${unseen.join()}`);
});

test('zone data validation: weights and walking distance', () => {
  const m = rawMaps();
  meadow(m).zones[0].pool = [{species: 'fernling', weight: 0}, 'emberkin', 'brooklet', 'duskwing'];
  has(buildAdventure(m, content, rawObjectives()).errors, 'weight for "fernling"');
  const d = rawMaps();
  meadow(d).zones[0].distance = [9, 3];
  has(buildAdventure(d, content, rawObjectives()).errors, 'distance');
  const ok = rawMaps();
  meadow(ok).zones[0].pool = [{species: 'fernling', weight: 3}, 'emberkin', 'bramblebuck', 'brooklet', 'duskwing'];
  meadow(ok).zones[0].distance = [10, 12];
  const built = buildAdventure(ok, content, rawObjectives());
  assert.deepEqual(built.errors, []);
  assert.deepEqual(
    [built.maps[0].zones[0].weights, built.maps[0].zones[0].distance],
    [
      [3, 1, 1, 1, 1],
      [10, 12],
    ],
  );
});

test('encounters are spaced by the zone distance, with a grace period', () => {
  assert.ok(GRACE_AFTER_BATTLE >= 3 && GRACE_ON_ARRIVAL >= 2);
  const world = buildWorld(maps[0]);
  const rng = seededRng(3);
  const zone = world.map.zones[0];
  for (let i = 0; i < 200; i++) {
    const d = encounterDistance(zone, rng);
    assert.ok(d >= zone.distance[0] && d <= zone.distance[1]);
  }
  // Walking east through the tall grass: no encounter during the grace period, then roughly every 4-7 tiles.
  const st = {world, player: {x: 15, y: 9, dir: 8}, pacing: {steps: 0, encounterAt: 5, encounterCooldown: 2}, trail: []};
  let firstAt = null;
  let t = 0;
  for (let i = 0; i < 600 && firstAt === null; i++) {
    t += 1 / 60;
    st.pacing.encounterCooldown = Math.max(0, st.pacing.encounterCooldown - 1 / 60);
    if (movePlayer(st, 0, 1, false, 1 / 60)) firstAt = t;
  }
  assert.ok(firstAt === null || firstAt >= 2, `an encounter fired at ${firstAt}s, inside the grace period`);
});

test('a long walk through grass is not a stream of battles', () => {
  const world = buildWorld(maps[0]);
  const rng = seededRng(11);
  const st = {world, player: {x: 15, y: 9, dir: 8}, pacing: {steps: 0, encounterAt: 5, encounterCooldown: 0}, trail: []};
  let encounters = 0;
  let tiles = 0;
  for (let i = 0; i < 60 * 60; i++) {
    const before = {x: st.player.x, y: st.player.y};
    // Pace to the east edge and back along the grass.
    const dir = Math.floor(i / 300) % 2 === 0 ? [1, 1] : [-1, -1];
    st.pacing.encounterCooldown = Math.max(0, st.pacing.encounterCooldown - 1 / 60);
    if (movePlayer(st, dir[0], dir[1], false, 1 / 60)) {
      encounters++;
      st.pacing.encounterAt = encounterDistance(world.map.zones[0], rng);
      st.pacing.encounterCooldown = GRACE_AFTER_BATTLE;
    }
    tiles += Math.hypot(st.player.x - before.x, st.player.y - before.y);
  }
  const perHundred = (encounters / tiles) * 100;
  assert.ok(perHundred > 5 && perHundred < 30, `${encounters} encounters over ${tiles.toFixed(0)} tiles (${perHundred.toFixed(1)} per 100)`);
});

test('a scripted encounter is an optional trigger action, validated and compiled to a species index', () => {
  const ok = rawMaps();
  meadow(ok).triggers = [
    {
      id: 'sleeper',
      at: [20, 5],
      radius: 1,
      on: 'interact',
      do: [
        {type: 'toast', text: 'Something stirs.'},
        {type: 'battle', species: 'brooklet', level: 6},
      ],
    },
  ];
  const built = buildAdventure(ok, content, rawObjectives());
  assert.deepEqual(built.errors, []);
  const t = built.maps[0].triggers[0];
  assert.deepEqual(t.actions[1], {type: 'battle', id: 2, level: 6});
  assert.equal(triggersAt(buildWorld(built.maps[0]), {x: 20.4, y: 5}, 'interact').length, 1);
  const bad = rawMaps();
  meadow(bad).triggers = [{id: 'x', at: [20, 5], on: 'enter', do: [{type: 'battle', species: 'dragon', level: 0}, {type: 'dance'}]}];
  const errors = buildAdventure(bad, content, rawObjectives()).errors;
  has(errors, 'unknown species "dragon"');
  has(errors, 'level');
  has(errors, 'action type must be');
});
