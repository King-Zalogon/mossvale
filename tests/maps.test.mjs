import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAdventure} from '../dist/src/domain/adventure.js';
import {compileMap, MAX_CELLS, validateMaps} from '../dist/src/domain/mapdata.js';
import {buildWorld, isWalkable, triggersAt, zoneAt} from '../dist/src/domain/world.js';
import {rollWild} from '../dist/src/domain/battle.js';
import {seededRng} from '../dist/src/domain/rng.js';
import {movePlayer} from '../dist/src/domain/exploration.js';
import {content, newSave, rawMaps, rawObjectives} from './helpers.mjs';

const edit = fn => {
  const raw = rawMaps();
  fn(raw);
  return buildAdventure(raw, content).errors;
};
const meadow = raw => raw.find(m => m.id === 'meadow');
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

test('a missing map file or an orphan map is reported', () => {
  has(buildAdventure(rawMaps().slice(1), content).errors, 'region "meadow": no map file');
  has(
    edit(r => r.push({...structuredClone(meadow(r)), id: 'extra'})),
    'no region with this id',
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
