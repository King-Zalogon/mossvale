import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {assets} from '../dist/src/data/assets.js';
import {species as allSpecies} from '../dist/src/data/species.js';
import {buildAdventure} from '../dist/src/domain/adventure.js';
import {expandMapPrefabs} from '../dist/src/domain/prefabs.js';
import {markSceneRun, sceneHasRun} from '../dist/src/domain/scenes.js';

const species = [allSpecies[0]];
const prefab = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/prefabs/catalog.json', import.meta.url)), 'utf8'));
const map = (id = 'isle') => ({
  format: 1,
  id,
  name: 'Prefab test isle',
  size: {w: 14, h: 10},
  legend: {'.': 'void', g: 'ground', p: 'path', w: 'water', t: 'tallgrass'},
  terrain: Array.from({length: 10}, () => 'g'.repeat(14)),
  spawns: {camp: [1, 1]},
  landmarks: [],
  exits: [],
  props: [],
  zones: [{id: 'wilds', terrain: ['g'], pool: ['fernling'], level: [1, 1], rect: [0, 0, 13, 9]}],
  triggers: [],
});

const instance = (id, at, name) => ({id, prefab: 'camp', at, roles: {host: {name, tag: name.toUpperCase()}}});
const pack = (id, mapId, registries = 'registries.json') => ({
  format: 1,
  id,
  name: id,
  brief: 'A tiny prefab test adventure.',
  maps: [mapId],
  species: ['fernling'],
  milestones: [],
  registries,
  prefabs: prefab,
});

test('prefab expansion is deterministic, local-ID safe and does not share state between instances or packs', () => {
  const authored = map();
  authored.instances = [instance('north-camp', [3, 2], 'Keeper Mara'), instance('south-camp', [8, 2], 'Baker Wren')];
  const original = structuredClone(authored);
  const content = {assets, species, regions: [{id: 'isle', name: 'Test Isle'}], packId: 'hearth'};
  const first = buildAdventure([authored], content, undefined, undefined, pack('hearth', 'isle'));
  const secondMap = {...structuredClone(authored), id: 'lane'};

  assert.deepEqual(first.errors, []);
  secondMap.instances[0].roles.host.name = 'Shopkeeper Pim';
  // Build again with the second pack's independent role table; the same visual prefab remains in use.
  const bakery = buildAdventure(
    [secondMap],
    {...content, regions: [{id: 'lane', name: 'Bakery Lane'}], packId: 'bakery'},
    undefined,
    undefined,
    pack('bakery', 'lane'),
  );
  assert.deepEqual(bakery.errors, []);
  const {maps: flatMaps, errors} = expandMapPrefabs([authored], prefab);
  assert.deepEqual(errors, []);
  const flat = flatMaps[0];
  assert.deepEqual(expandMapPrefabs([authored], prefab).maps, flatMaps, 'expansion order and output are deterministic');
  assert.deepEqual(
    flat.landmarks.map(o => [o.id, o.name, o.sprite]),
    [
      ['north-camp-host', 'Keeper Mara', 'person-gardener'],
      ['south-camp-host', 'Baker Wren', 'person-gardener'],
    ],
  );
  assert.deepEqual(
    flat.props.map(o => [o.id, o.sprite]),
    [
      ['north-camp-oak', 'tree-oak'],
      ['south-camp-oak', 'tree-oak'],
    ],
  );
  assert.deepEqual(flat.spawns['north-camp-door'], [3, 4]);
  assert.deepEqual(flat.spawns['south-camp-door'], [8, 4]);
  assert.equal(flat.triggers[0].events[0].id, 'north-camp-noticed');
  assert.equal(flat.triggers[1].events[0].id, 'south-camp-noticed');
  assert.equal(flat.triggers[0].at[0], 3);
  assert.equal(flat.terrain[2][3], 'p');
  assert.equal(bakery.maps[0].objects.find(o => o.ref === 'north-camp-host').name, 'Shopkeeper Pim');
  assert.deepEqual(authored, original, 'source content is not destructively expanded');

  const save = {events: []};
  assert.equal(markSceneRun(save, 'isle', flat.triggers[0].events[0].id), true);
  assert.equal(sceneHasRun(save, 'isle', flat.triggers[0].events[0].id), true);
  assert.equal(sceneHasRun(save, 'isle', flat.triggers[1].events[0].id), false);
  assert.equal(sceneHasRun({events: []}, 'lane', bakery.maps[0].triggers[0].events[0].id), false);
});

test('allowed transforms are opt in and prefab solids cannot overlap', () => {
  const authored = map();
  authored.instances = [instance('west', [2, 2], 'West Host'), {...instance('east', [4, 2], 'East Host'), transform: 'flip-x'}];
  const out = expandMapPrefabs([authored], prefab);
  assert.ok(out.errors.some(error => error.includes('solid footprint overlaps prefab instance "west"')));
  assert.ok(out.maps[0].triggers[1].at[0] === 6, 'flip-x mirrors its local trigger point within the opted-in footprint');

  const notAllowed = structuredClone(authored);
  notAllowed.instances[1].transform = 'flip-y';
  assert.ok(expandMapPrefabs([notAllowed], prefab).errors.some(error => error.includes('is not allowed by prefab')));
});

test('prefab errors identify duplicate IDs, missing roles, bad slots and out-of-bounds footprints', () => {
  const authored = map();
  authored.instances = [instance('north-camp', [12, 8], 'Keeper')];
  delete authored.instances[0].roles.host;
  const out = expandMapPrefabs([authored], prefab);
  assert.ok(out.errors.some(error => error.includes('footprint must fit inside')));
  assert.ok(out.errors.some(error => error.includes('needs an override for this instance')));

  const duplicate = map();
  duplicate.instances = [instance('north-camp', [2, 2], 'Keeper'), instance('north-camp', [8, 2], 'Baker')];
  assert.ok(expandMapPrefabs([duplicate], prefab).errors.some(error => error.includes('duplicate instance id')));

  const collision = map();
  collision.landmarks.push({id: 'north-camp-host', kind: 'sign', sprite: 'signpost-wood', at: [1, 2], w: 37});
  collision.instances = [instance('north-camp', [8, 2], 'Keeper')];
  assert.ok(expandMapPrefabs([collision], prefab).errors.some(error => error.includes('duplicate namespaced entity id')));

  const duplicateLocal = structuredClone(prefab);
  duplicateLocal.camp.props.push({id: 'host', kind: 'scenery', sprite: 'tree-oak', at: [[2, 2]], w: 42});
  const localCollision = map();
  localCollision.instances = [instance('camp', [2, 2], 'Keeper')];
  assert.ok(expandMapPrefabs([localCollision], duplicateLocal).errors.some(error => error.includes('duplicate local entity id')));

  const roleContent = map();
  roleContent.instances = [{...instance('camp', [2, 2], 'Keeper'), roles: {host: {sprite: 'person-traveler'}}}];
  assert.ok(expandMapPrefabs([roleContent], prefab).errors.some(error => error.includes('cannot replace prefab geometry or visual identity')));
});

test('camp, cottage and ruin authoring prefabs cover distinct reusable scene shapes', () => {
  assert.deepEqual(Object.keys(prefab).sort(), ['camp', 'cottage-scene', 'small-ruin']);
  for (const [id, role] of [
    ['camp', {host: {name: 'Keeper'}}],
    ['cottage-scene', {building: {text: 'A home.'}}],
    ['small-ruin', {inscription: {text: 'A memory.'}}],
  ]) {
    const authored = map();
    authored.instances = [{id: 'fixture-' + id, prefab: id, at: [3, 2], roles: role}];
    const expanded = expandMapPrefabs([authored], prefab);
    assert.deepEqual(expanded.errors, [], `${id} expands`);
    assert.ok(
      expanded.maps[0].terrain.some(row => row.includes('p')),
      `${id} contributes its path tiles`,
    );
  }
});

test('expanded exits receive normal cross-map validation', () => {
  const authored = map();
  authored.instances = [{id: 'camp', prefab: 'camp', at: [3, 2], roles: {host: {name: 'Keeper'}}}];
  const withExit = structuredClone(prefab);
  withExit.camp.exits = [{id: 'trail', sprite: 'signpost-wood', at: [2, 0], w: 37, to: {map: 'missing-map', spawn: 'camp'}}];
  const result = buildAdventure([authored], {assets, species, regions: [{id: 'isle', name: 'Test Isle'}], packId: 'hearth'}, undefined, undefined, {
    ...pack('hearth', 'isle'),
    prefabs: withExit,
  });
  assert.ok(result.errors.some(error => error.includes('unknown map "missing-map"')));
});
