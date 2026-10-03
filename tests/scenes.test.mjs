import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMaps} from '../dist/src/domain/mapdata.js';
import {applySceneActions, markSceneRun, sceneConditionHolds, sceneHasRun, validateSceneEvent} from '../dist/src/domain/scenes.js';
import {setFlag} from '../dist/src/domain/rules.js';
import {assets} from '../dist/src/data/assets.js';
import {species} from '../dist/src/data/species.js';
import {codec, newSave, rawMaps} from './helpers.mjs';

const maps = rawMaps();
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
  const raw = structuredClone(maps);
  raw[0].triggers = [{id: 'scene', at: [12, 12], on: 'interact', events: [validEvent], do: [{type: 'toast', text: 'hello'}]}];
  assert.deepEqual(validateMaps(raw, {spriteNames: names, speciesIds}), []);
});

test('one-time scene effects and reward flags persist together; repeatable conditions remain reusable', () => {
  const save = newSave();
  const result = applySceneActions(save, validEvent, {setFlag: flag => setFlag(save, flag)});
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
