import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAdventure} from '../dist/src/domain/adventure.js';
import {buildWorld, isWalkable, triggersAt, zoneAt} from '../dist/src/domain/world.js';
import {rollWild} from '../dist/src/domain/battle.js';
import {seededRng} from '../dist/src/domain/rng.js';
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
  assert.deepEqual(Object.keys(mapsById), ['meadow', 'amber-ridge', 'frostveil-grove', 'reedfen-wetlands', 'orchard-ruins']);
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
