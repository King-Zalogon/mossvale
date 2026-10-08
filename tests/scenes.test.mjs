import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMaps} from '../dist/src/domain/mapdata.js';
import {applySceneActions, markSceneRun, sceneConditionHolds, sceneHasRun, validateSceneEvent} from '../dist/src/domain/scenes.js';
import {holds, validateObjectives} from '../dist/src/domain/objectives.js';
import {isWalkable, buildWorld} from '../dist/src/domain/world.js';
import {findScenePath} from '../dist/src/domain/scene-path.js';
import {setFlag} from '../dist/src/domain/rules.js';
import {grant as grantReward} from '../dist/src/domain/economy.js';
import {assets} from '../dist/src/data/assets.js';
import {species} from '../dist/src/data/species.js';
import {codec, maps as compiledMaps, newSave, rawMaps} from './helpers.mjs';

const rawMapList = rawMaps();
const names = new Set(assets.map(asset => asset.name));
const speciesIds = new Set(species.map(entry => entry.id));
const validEvent = {
  id: 'welcome-to-camp',
  repeatable: false,
  when: {met: false},
  actions: [
    {type: 'dialogue', text: 'The trail is quiet today.'},
    {type: 'reward', coins: 3, orbs: 1},
    {type: 'flag', flag: 'meadow.chest'},
  ],
};

test('map scene actions validate references and reject unsafe challenge semantics', () => {
  assert.deepEqual(validateSceneEvent(validEvent, {speciesIds, mapId: 'meadow', mapIds: new Set(['meadow']), where: 'event'}), []);
  assert.match(
    validateSceneEvent({...validEvent, actions: [{type: 'reward', gems: 1}]}, {speciesIds, mapId: 'meadow', mapIds: new Set(['meadow']), where: 'event'}).join(
      '\n',
    ),
    /reward accepts/,
  );
  assert.match(
    validateSceneEvent(
      {...validEvent, actions: [{type: 'challenge', species: 'ghost', level: 2}]},
      {speciesIds, mapId: 'meadow', mapIds: new Set(['meadow']), where: 'event'},
    ).join('\n'),
    /unknown species/,
  );
  const raw = structuredClone(rawMapList);
  raw[0].triggers = [{id: 'scene', at: [12, 12], on: 'interact', events: [validEvent], do: [{type: 'toast', text: 'hello'}]}];
  assert.deepEqual(validateMaps(raw, {spriteNames: names, speciesIds}), []);
});

test('one-time scene effects and reward flags persist together; repeatable conditions remain reusable', () => {
  const save = newSave();
  const result = applySceneActions(save, validEvent, {setFlag: flag => setFlag(save, flag)});
  if (result.reward) grantReward(save, result.reward);
  assert.deepEqual(result.dialogue, [{text: 'The trail is quiet today.', speaker: 'narrator'}]);
  assert.equal(save.coins, 3);
  assert.equal(save.orbs, 13);
  assert.equal(save.chests.includes(0), true);
  markSceneRun(save, 'meadow', validEvent.id);
  const restored = codec.normalize(JSON.parse(codec.serialize(save)), false);
  assert.equal(sceneHasRun(restored, 'meadow', validEvent.id), true);
  assert.equal(sceneConditionHolds({when: {met: false}}, restored, {speciesCount: 2, regions: [{id: 'meadow'}]}), true);
  markSceneRun(restored, 'meadow', validEvent.id);
  assert.equal(restored.events.length, 1);
});

test('story conditions can branch on saved scene events without adding save fields', () => {
  const save = {events: ['orchard-ruins/sluice-old-mark']};
  const ctx = {speciesCount: 3, regions: [{id: 'meadow'}]};
  assert.equal(holds({event: 'orchard-ruins/sluice-old-mark'}, save, ctx), true);
  assert.equal(holds({any: [{event: 'orchard-ruins/press-repair-record'}, {event: 'orchard-ruins/sluice-old-mark'}]}, save, ctx), true);
  assert.equal(holds({all: [{event: 'orchard-ruins/sluice-old-mark'}, {not: {event: 'orchard-ruins/outcome-family-first'}}]}, save, ctx), true);
  assert.deepEqual(
    validateObjectives(
      {format: 1, objectives: [{id: 'x', step: 'x', title: 'x', copy: 'x', pin: 'x', done: {any: [{event: 'orchard-ruins/sluice-old-mark'}]}}]},
      {mapIds: new Set(['orchard-ruins'])},
    ),
    [],
  );
});

test('dialogue resolves stable reusable speaker ids and rejects unknown ones', () => {
  const withSpeaker = {id: 'welcome', repeatable: false, actions: [{type: 'dialogue', speaker: 'ranger', text: 'The trail is quiet today.'}]};
  assert.deepEqual(
    validateSceneEvent(withSpeaker, {speciesIds: new Set(), speakerIds: new Set(['ranger']), mapId: 'meadow', mapIds: new Set(['meadow']), where: 'test'}),
    [],
  );
  assert.ok(
    validateSceneEvent(
      {...withSpeaker, actions: [{...withSpeaker.actions[0], speaker: 'not-here'}]},
      {speciesIds: new Set(), speakerIds: new Set(['ranger']), mapId: 'meadow', mapIds: new Set(['meadow']), where: 'test'},
    ).some(error => error.includes('unknown speaker')),
  );
  const save = {coins: 0, potions: 0, orbs: 0};
  assert.deepEqual(applySceneActions(save, withSpeaker, {setFlag() {}}).dialogue, [{text: 'The trail is quiet today.', speaker: 'ranger'}]);
});

test('scene choreography validates movable actors and walkable map destinations', () => {
  const raw = rawMapList[0];
  const world = buildWorld(compiledMaps[0]);
  const ranger = raw.landmarks.find(item => item.kind === 'ranger');
  const destination = compiledMaps[0].tiles.find(tile => isWalkable(world, tile.x, tile.y));
  assert.ok(ranger && destination);
  const event = {
    id: 'approach-ranger',
    repeatable: false,
    actions: [
      {type: 'move', actor: 'player', to: [destination.x, destination.y]},
      {type: 'move', actor: ranger.id, to: [destination.x, destination.y]},
      {type: 'face', actor: 'player', target: ranger.id},
      {type: 'react', actor: ranger.id, pose: 'notice'},
      {type: 'wait', ms: 250},
      {type: 'dialogue', speaker: ranger.id, text: 'Welcome.'},
    ],
  };
  const context = {
    speciesIds,
    speakerIds: new Set([ranger.id]),
    actorIds: new Set([ranger.id]),
    mapSize: raw.size,
    walkable: (x, y) => isWalkable(world, x, y),
    mapId: raw.id,
    mapIds: new Set(rawMapList.map(item => item.id)),
    where: 'scene',
  };
  assert.deepEqual(validateSceneEvent(event, context), []);
  assert.ok(
    validateSceneEvent({...event, actions: [{type: 'move', actor: 'chest', to: [destination.x, destination.y]}]}, context).some(error =>
      error.includes('movable actor'),
    ),
  );
  assert.ok(validateSceneEvent({...event, actions: [{type: 'move', actor: 'player', to: [-1, -1]}]}, context).some(error => error.includes('inside the map')));
  assert.ok(
    validateSceneEvent({...event, actions: [{type: 'react', actor: 'player', pose: 'dance'}]}, context).some(error =>
      error.includes('notice, surprise, or happy'),
    ),
  );
  assert.ok(validateSceneEvent({...event, actions: Array(25).fill({type: 'wait', ms: 0})}, context).some(error => error.includes('limited to 24')));
});

test('scene pathfinding returns explicit arrival and blocked results without teleporting', () => {
  const world = buildWorld(compiledMaps[0]);
  const start = compiledMaps[0].tiles.find(tile => isWalkable(world, tile.x, tile.y));
  const invalid = compiledMaps[0].size;
  assert.deepEqual(findScenePath(world, start, [start.x, start.y]), {status: 'arrived', path: []});
  const routed = findScenePath(world, start, [Math.min(world.map.size.w - 1, start.x + 3), start.y]);
  if (routed.status === 'arrived') {
    assert.ok(routed.path.length <= 128);
    assert.deepEqual(routed.path.at(-1), {x: Math.min(world.map.size.w - 1, start.x + 3), y: start.y});
  } else assert.deepEqual(routed.path, []);
  assert.deepEqual(findScenePath(world, start, [invalid.w + 1, invalid.h + 1]), {status: 'blocked', path: []});
  assert.equal(start.x, Math.round(start.x));
});
