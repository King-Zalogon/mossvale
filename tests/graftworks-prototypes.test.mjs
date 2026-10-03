import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseTerrainVariant, terrainVariant} from '../dist/src/domain/terrain-family.js';
import {createInventory, moveInventory, sellInventory, validateInventoryRules} from '../dist/src/domain/inventory.js';
import {applyObjectiveEvent, createObjectiveState, validateObjectiveEvents} from '../dist/src/domain/objective-events.js';
import {compileComposition} from '../dist/src/domain/composition.js';
import {companionCanUseRoute, validateCompanionRoutes} from '../dist/src/domain/companion-routes.js';

test('terrain family topology and decoration selection are deterministic and leave unsafe rotation disabled', () => {
  const grid = ['ggg', 'gpw', 'ggg'].map(row => [...row]);
  assert.deepEqual(terrainVariant(grid, 1, 1), {
    terrain: 'p',
    key: 'p-edge-nesw',
    edges: ['n', 'e', 's', 'w'],
    corners: ['ne', 'se', 'sw', 'nw'],
    transform: 'none',
  });
  const variants = {'p-edge-nesw': ['bridge-a', 'bridge-b']};
  assert.deepEqual(chooseTerrainVariant(grid, 1, 1, variants, 123), chooseTerrainVariant(grid, 1, 1, variants, 123));
  assert.equal(terrainVariant(grid, 1, 1, {safeTransforms: true}).transform, 'rotate-90-safe');
});

test('optional inventory transactions reject full storage without partial writes and sell only valuables', () => {
  const rules = {
    carryCap: 4,
    storageCap: 1,
    items: {herb: {name: 'Herb', kind: 'usable', price: 2}, shard: {name: 'Shard', kind: 'valuable', price: 0, sellPrice: 7}},
  };
  assert.deepEqual(validateInventoryRules(rules), []);
  const inventory = createInventory();
  inventory.bag = {herb: 2, shard: 1};
  const before = structuredClone(inventory);
  assert.equal(moveInventory(inventory, {item: 'herb', quantity: 2, rules}).reason, 'full');
  assert.deepEqual(inventory, before);
  assert.equal(sellInventory(inventory, 'herb', 1, rules).reason, 'not-for-sale');
  assert.deepEqual(sellInventory(inventory, 'shard', 1, rules), {ok: true, item: 'shard', quantity: 1, coins: 7});
  assert.equal(inventory.coins, 7);
});

test('event objectives progress one stage at a time and emit a reward once', () => {
  const definition = {
    format: 1,
    id: 'lost-parcel',
    stages: [
      {id: 'meet-carrier', on: {type: 'talk', speaker: 'carrier'}, next: 'find-parcel'},
      {id: 'find-parcel', on: {type: 'collect', item: 'parcel'}, reward: {coins: 12}},
    ],
  };
  assert.deepEqual(validateObjectiveEvents(definition), []);
  const state = createObjectiveState(definition);
  assert.equal(applyObjectiveEvent(state, definition, {type: 'talk', speaker: 'other'}).changed, false);
  assert.deepEqual(applyObjectiveEvent(state, definition, {type: 'talk', speaker: 'carrier'}), {changed: true, status: 'active', stage: 'find-parcel'});
  assert.deepEqual(applyObjectiveEvent(state, definition, {type: 'collect', item: 'parcel'}), {changed: true, status: 'rewarded', reward: {coins: 12}});
  assert.equal(applyObjectiveEvent(state, definition, {type: 'collect', item: 'parcel'}).changed, false);
});

test('body-plan compilation validates slots and de-duplicates derived abilities', () => {
  const plan = {
    id: 'small-flier',
    slots: [
      {id: 'core', required: true, accepts: ['core']},
      {id: 'wings', required: true, accepts: ['wing']},
      {id: 'feet', required: false, accepts: ['foot']},
    ],
  };
  const parts = {seed: {tags: ['core'], abilities: ['glide'], modifiers: {hp: 0.1}}, leafwing: {tags: ['wing'], abilities: ['glide', 'cross-shallow-water']}};
  assert.deepEqual(compileComposition(plan, parts, {core: 'seed', wings: 'leafwing'}), {
    errors: [],
    species: {parts: {core: 'seed', wings: 'leafwing'}, abilities: ['cross-shallow-water', 'glide'], modifiers: {hp: 0.1}},
  });
  assert.match(compileComposition(plan, parts, {core: 'leafwing', wings: 'leafwing'}).errors.join(' '), /not compatible/);
});

test('optional companion routes stay optional and every starter can reach recovery', () => {
  const waterway = {requires: {ability: 'cross-shallow-water', habitat: 'wetland'}};
  assert.equal(companionCanUseRoute(waterway, {abilities: ['cross-shallow-water'], habitats: ['wetland']}), true);
  assert.equal(companionCanUseRoute(waterway, {abilities: [], habitats: ['wetland']}), false);
  const starts = [
    {id: 'seedling', abilities: [], habitats: ['meadow']},
    {id: 'pebblit', abilities: [], habitats: ['ridge']},
  ];
  assert.deepEqual(
    validateCompanionRoutes(
      [
        {id: 'main-loop', recovery: true},
        {id: 'reed-cut', recovery: false, ...waterway},
      ],
      starts,
    ),
    [],
  );
  assert.match(validateCompanionRoutes([{id: 'only-way-home', recovery: true, ...waterway}], starts).join(' '), /recovery path is unavailable/);
});
