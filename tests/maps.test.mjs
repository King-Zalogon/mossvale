import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAdventure} from '../dist/src/domain/adventure.js';
import {compileMap, MAX_CELLS, validateMaps} from '../dist/src/domain/mapdata.js';
import {buildWorld, isWalkable, triggersAt, zoneAt} from '../dist/src/domain/world.js';
import {rollWild} from '../dist/src/domain/battle.js';
import {seededRng} from '../dist/src/domain/rng.js';
import {movePlayer} from '../dist/src/domain/exploration.js';
import {content, mapsById, newSave, rawMaps, rawObjectives} from './helpers.mjs';

const edit = fn => {
  const raw = rawMaps();
  fn(raw);
  return buildAdventure(raw, content).errors;
};
const meadow = raw => raw.find(m => m.id === 'meadow');
const orchard = raw => raw.find(m => m.id === 'orchard-ruins');
const has = (errors, text) =>
  assert.ok(
    errors.some(e => e.includes(text)),
    `expected an error containing "${text}", got:\n${errors.join('\n')}`,
  );

test('the shipped maps validate', () => {
  const {errors, maps} = buildAdventure(rawMaps(), content);
  assert.deepEqual(errors, []);
  assert.deepEqual(
    maps.map(m => m.id),
    content.regions.map(r => r.id),
  );
  assert.deepEqual(Object.keys(mapsById), [
    'meadow',
    'amber-ridge',
    'frostveil-grove',
    'frostveil-pass',
    'reedfen-wetlands',
    'orchard-ruins',
    'stilt-isles',
    'stone-basin',
  ]);
});

test('the meadow pair has a safe loop, a shortcut discovery and a gated onward trail', () => {
  const raw = rawMaps();
  const meadowMap = meadow(raw);
  const orchardMap = orchard(raw);
  const meadowOut = meadowMap.exits.find(e => e.to.map === 'orchard-ruins');
  const orchardBack = orchardMap.exits.find(e => e.to.map === 'meadow');
  const orchardOnward = orchardMap.exits.find(e => e.to.map === 'amber-ridge');

  assert.equal(meadowOut.to.spawn, 'camp');
  assert.equal(orchardBack.to.spawn, 'orchard-return');
  assert.equal(orchardOnward.requires, 'meadow.seal');
  assert.equal(orchardMap.landmarks.find(l => l.kind === 'ranger').name, 'Orchard Keeper Mara');
  assert.equal(meadowMap.landmarks.find(l => l.kind === 'chest').flag, 'meadow.chest');
  assert.equal(orchardMap.triggers[0].id, 'hidden-cut-through');
  assert.notDeepEqual(meadowMap.terrain, orchardMap.terrain);
  assert.equal(mapsById['orchard-ruins'].biome, 'meadow');
  assert.equal(mapsById['orchard-ruins'].objects.find(o => o.ref === 'east-to-ridge').targetRegion, 1);
});

test('snowy maps form a distinct, traversable pair with a safe return and optional cache', () => {
  const raw = rawMaps();
  const grove = raw.find(m => m.id === 'frostveil-grove');
  const pass = raw.find(m => m.id === 'frostveil-pass');
  const outward = grove.exits.find(e => e.to.map === pass.id);
  const back = pass.exits.find(e => e.to.map === grove.id);
  const compiled = mapsById[pass.id];
  const world = buildWorld(compiled);

  assert.deepEqual(grove.size, {w: 64, h: 48});
  assert.deepEqual(pass.size, {w: 64, h: 48});
  assert.notDeepEqual(grove.terrain, pass.terrain);
  assert.deepEqual(outward.to, {map: pass.id, spawn: 'camp'});
  assert.deepEqual(back.to, {map: grove.id, spawn: 'pass-return'});
  assert.equal(isWalkable(world, ...pass.spawns.camp), true);
  assert.equal(pass.landmarks.find(l => l.kind === 'cottage').label, 'Rest at the pine shelter');
  assert.equal(pass.landmarks.find(l => l.kind === 'chest').secret, true);
  assert.equal(pass.zones[0].pool.length, 3);
});

test('a bounded large rectangular map validates and compiles through its far coordinates', () => {
  const large = {
    format: 1,
    id: 'long-meadow',
    name: 'Long Meadow',
    size: {w: 120, h: 80},
    terrain: Array(80).fill('g'.repeat(120)),
    spawns: {camp: [1, 1]},
  };
  const errors = validateMaps([large], {spriteNames: new Set(), speciesIds: new Set()});
  assert.deepEqual(errors, []);
  const map = compileMap(large, {spriteIndex: () => -1, speciesIndex: () => -1, regionIndex: () => 0});
  assert.deepEqual(map.size, {w: 120, h: 80});
  assert.equal(map.terrainAt(119, 79), 'ground');
  assert.equal(map.terrainAt(120, 79), 'void');
  assert.equal(isWalkable(buildWorld(map), 119, 79), true);
  assert.equal(120 * 80 < MAX_CELLS, true);
  const world = buildWorld(map);
  const player = {x: 1, y: 1};
  const movement = {world, player, pacing: {steps: 0, encounterAt: 4, encounterCooldown: Infinity}, trail: []};
  for (let i = 0; i < 3000 && player.x < 118.5; i++) movePlayer(movement, 1, 1, false, 1 / 60);
  for (let i = 0; i < 3000 && player.y < 78.5; i++) movePlayer(movement, -1, 1, false, 1 / 60);
  assert.ok(player.x >= 118.5 && player.y >= 78.5, `walked to the far edge at (${player.x}, ${player.y})`);
  assert.equal(isWalkable(world, player.x, player.y), true);
});

test('map validation refuses dimensions and area beyond its work budget', () => {
  const large = {
    format: 1,
    id: 'too-large',
    name: 'Too Large',
    size: {w: 128, h: 128},
    terrain: Array(128).fill('g'.repeat(128)),
    spawns: {camp: [1, 1]},
  };
  assert.deepEqual(validateMaps([large], {spriteNames: new Set(), speciesIds: new Set()}), []);
  large.size = {w: 128, h: 129};
  has(validateMaps([large], {spriteNames: new Set(), speciesIds: new Set()}), 'no more than 16384 total tiles');
});

test('invalid exits, spawns, assets, species and flags are reported with map and field context', () => {
  has(
    edit(r => (meadow(r).exits[0].to.map = 'nowhere')),
    'map meadow: exits[0] (east).to.map: unknown map "nowhere"',
  );
  has(
    edit(r => (meadow(r).exits[0].to.spawn = 'cellar')),
    'has no spawn "cellar"',
  );
  has(
    edit(r => (meadow(r).landmarks[0].sprite = 'sprite999')),
    'unknown sprite "sprite999"',
  );
  has(
    edit(r => (meadow(r).zones[0].pool = ['dragon'])),
    'unknown species "dragon"',
  );
  has(
    edit(r => (meadow(r).landmarks.find(l => l.kind === 'chest').flag = 'meadow.treasure')),
    'must look like',
  );
  has(
    edit(r => (meadow(r).landmarks.find(l => l.kind === 'shrine').flag = 'swamp.seal')),
    'unknown map "swamp"',
  );
  has(
    edit(r => (meadow(r).terrain[3] = 'xx')),
    'terrain[3]',
  );
  has(
    edit(r => (meadow(r).terrain[3] = meadow(r).terrain[3].replace('t', '?'))),
    'unknown terrain character',
  );
  has(
    edit(r => (meadow(r).landmarks[1].id = meadow(r).landmarks[0].id)),
    'duplicate landmark/exit id',
  );
  has(
    edit(r => delete meadow(r).spawns),
    'spawns.camp',
  );
});

test('unsafe spawns and unreachable goals are caught', () => {
  has(
    edit(r => (meadow(r).spawns.camp = [5, 15])),
    'spawn (5, 15) is not walkable',
  ); // pond
  has(
    edit(r => (meadow(r).spawns.camp = [0, 0])),
    'spawn (0, 0) is not walkable',
  ); // off the island
  // Wall the shrine off with water.
  has(
    edit(r => (meadow(r).terrain = meadow(r).terrain.map((row, y) => (y >= 2 && y <= 8 ? row.replace(/[gpt]/g, 'w') : row)))),
    'cannot be reached from the camp spawn',
  );
  has(
    edit(r => (meadow(r).zones[0].rect = [0, 24, 1, 24])),
    'covers no tiles the player can reach',
  );
  has(
    edit(r => (meadow(r).landmarks[2].at = [0, 0])),
    'off the island',
  );
});

test('a missing region map or an orphan biome map is reported', () => {
  has(buildAdventure(rawMaps().slice(1), content).errors, 'region "meadow": no map file');
  has(
    edit(r => r.push({...structuredClone(meadow(r)), id: 'extra', biome: 'bog'})),
    'no region for biome "bog"',
  );
});

test('an author can change an encounter zone without touching code', () => {
  const raw = rawMaps();
  meadow(raw).zones[0].pool = ['pebblit', 'fernling', 'emberkin', 'bramblebuck', 'brooklet', 'duskwing'];
  meadow(raw).zones[0].level = [9, 9];
  const {maps, errors} = buildAdventure(raw, content, rawObjectives());
  assert.deepEqual(errors, []);
  const rng = seededRng(1);
  const wild = Array.from({length: 40}, () => rollWild(newSave(), rng, maps[0].zones[0]));
  assert.ok(wild.every(w => w.level === 9));
  assert.ok(
    wild.some(w => w.id === 7),
    'pebblit now lives in the meadow',
  );
});

test('zones can be limited to a rectangle', () => {
  const raw = rawMaps();
  meadow(raw).zones = [{id: 'north-only', terrain: ['t'], rect: [0, 0, 24, 7], pool: ['fernling', 'emberkin', 'bramblebuck'], level: [5, 5]}];
  const {maps, errors} = buildAdventure(raw, content);
  assert.deepEqual(errors, []);
  const world = buildWorld(maps[0]);
  assert.ok(zoneAt(world, 3, 5));
  assert.equal(zoneAt(world, 20, 10), null); // tall grass, but outside the rectangle
});

test('triggers fire inside their radius and are validated', () => {
  const raw = rawMaps();
  meadow(raw).triggers = [{id: 'hint', at: [12, 13], radius: 1, on: 'enter', do: [{type: 'toast', text: 'Hello'}]}];
  const {maps, errors} = buildAdventure(raw, content);
  assert.deepEqual(errors, []);
  const world = buildWorld(maps[0]);
  assert.equal(triggersAt(world, {x: 12.5, y: 13}, 'enter').length, 1);
  assert.equal(triggersAt(world, {x: 20, y: 13}, 'enter').length, 0);
  has(
    edit(r => (meadow(r).triggers = [{id: 'x', at: [1, 1], on: 'sometimes', do: []}])),
    'triggers[0] (x).on',
  );
});

test('compiled meadow geometry follows the terrain grid', () => {
  const raw = rawMaps().find(m => m.id === 'meadow');
  const world = buildWorld(buildAdventure(rawMaps(), content).maps[0]);
  assert.equal(world.tiles.length, raw.terrain.join('').replaceAll('.', '').length);
  assert.ok(isWalkable(world, 12, 13));
  assert.ok(!isWalkable(world, 5, 15)); // pond
});

test('each local ranger has a distinct name and NPC artwork', () => {
  const rangers = rawMaps().flatMap(m => m.landmarks.filter(l => l.kind === 'ranger'));
  assert.equal(new Set(rangers.map(r => r.name)).size, rangers.length);
  for (const ranger of rangers) {
    assert.ok(['person-gardener', 'person-traveler'].includes(ranger.sprite), ranger.name);
    assert.equal(ranger.label, `Talk to ${ranger.name}`);
  }
});

test('the wetland pair is two large connected maps with a safe loop of exits (#52)', () => {
  const raw = rawMaps();
  const reed = raw.find(m => m.id === 'reedfen-wetlands');
  const stilt = raw.find(m => m.id === 'stilt-isles');
  const walkable = m => m.terrain.join('').replace(/[.w]/g, '').length;
  assert.ok(walkable(reed) >= 4 * 445, 'Reedfen is several times its original 445 walkable tiles');
  assert.ok(walkable(stilt) >= 900);
  assert.equal(stilt.biome, 'wetland');
  assert.equal(mapsById['stilt-isles'].biome, 'wetland');
  // entry, return and onward exits all land on real spawns
  const to = (map, id) => map.exits.find(e => e.id === id).to;
  assert.deepEqual(to(reed, 'east-to-stilts'), {map: 'stilt-isles', spawn: 'camp'});
  assert.equal(to(stilt, 'back-to-reedfen').spawn, 'stilt-return');
  assert.equal(to(stilt, 'north-landing').spawn, 'shrine-landing');
  assert.ok(reed.spawns['stilt-return'] && reed.spawns['shrine-landing']);
  assert.equal(reed.exits.find(e => e.id === 'west').to.map, 'frostveil-grove');
  // three wetland creatures, one seal, a supply point on both maps, discoveries, quiet corridors
  const species = new Set(raw.flatMap(m => (m === reed || m === stilt ? m.zones : [])).flatMap(z => z.pool.map(p => p.species ?? p)));
  assert.deepEqual([...species].sort(), ['brooklet', 'mushmallow', 'siltkip']);
  assert.equal([reed, stilt].flatMap(m => m.landmarks).filter(l => l.kind === 'shrine').length, 1);
  for (const m of [reed, stilt]) {
    assert.ok(
      m.landmarks.some(l => l.kind === 'ranger'),
      `${m.id} has a supply/recovery point`,
    );
    assert.ok(
      m.landmarks.some(l => l.secret),
      `${m.id} has an optional discovery`,
    );
    assert.ok(m.quiet.length >= 3, `${m.id} has quiet corridors`);
    assert.ok(
      m.zones.every(z => z.distance),
      `${m.id} sets encounter pacing explicitly`,
    );
  }
});

test('the badlands pair is two large maps with a loop of safe exits and alternate routes (#53)', () => {
  const raw = rawMaps();
  const ridge = raw.find(m => m.id === 'amber-ridge');
  const basin = raw.find(m => m.id === 'stone-basin');
  const walkable = m => m.terrain.join('').replace(/[.w]/g, '').length;
  assert.ok(walkable(ridge) >= 4 * 440, 'Amber Ridge is several times its original ~440 walkable tiles');
  assert.ok(walkable(basin) >= 1500);
  assert.equal(mapsById['stone-basin'].biome, 'badlands');
  const to = (map, id) => map.exits.find(e => e.id === id).to;
  assert.deepEqual(to(ridge, 'down-to-basin'), {map: 'stone-basin', spawn: 'camp'});
  assert.equal(to(basin, 'back-to-ridge').spawn, 'basin-landing');
  assert.equal(to(basin, 'east-gate').spawn, 'basin-landing');
  assert.ok(ridge.spawns['basin-landing'] && ridge.spawns['east-return']);
  assert.equal(
    to(
      raw.find(m => m.id === 'frostveil-grove'),
      'west',
    ).spawn,
    'east-return',
  );
  assert.equal(ridge.exits.find(e => e.id === 'east').requires, 'amber-ridge.seal');
  const species = new Set([ridge, basin].flatMap(m => m.zones).flatMap(z => z.pool.map(p => p.species ?? p)));
  assert.deepEqual([...species].sort(), ['pebblit', 'sunskitter', 'voltkit']);
  assert.equal([ridge, basin].flatMap(m => m.landmarks).filter(l => l.kind === 'shrine').length, 1);
  for (const m of [ridge, basin]) {
    assert.ok(
      m.landmarks.some(l => l.kind === 'ranger'),
      `${m.id} has a supply/recovery point`,
    );
    assert.ok(
      m.landmarks.some(l => l.secret),
      `${m.id} has an optional discovery`,
    );
    assert.ok(m.quiet.length >= 4, `${m.id} has quiet corridors`);
    assert.ok(
      m.zones.every(z => z.distance),
      `${m.id} sets encounter pacing explicitly`,
    );
  }
});
