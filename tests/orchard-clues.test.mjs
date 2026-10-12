import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSceneGraph, sceneConditionHolds, markSceneRun} from '../dist/src/domain/scenes.js';
import {rawMaps, newSave, codec, objCtx} from './helpers.mjs';
const map = rawMaps().find(m => m.id === 'orchard-ruins');
const events = map.triggers.flatMap(t => t.events ?? []);
test('both orchard approaches independently reveal the family; reload preserves evidence and outcome guards', () => {
  for (const clue of ['sluice-old-mark', 'press-repair-record']) {
    let save = newSave();
    const den = events.find(e => e.id === 'den-family-seen');
    assert.equal(sceneConditionHolds(den, save, objCtx), false);
    markSceneRun(save, map.id, 'mara-water-loss');
    markSceneRun(save, map.id, clue);
    save = codec.normalize(JSON.parse(codec.serialize(save)));
    assert.ok(sceneConditionHolds(den, save, objCtx));
    markSceneRun(save, map.id, den.id);
    markSceneRun(save, map.id, 'outcome-water-first');
    assert.equal(
      sceneConditionHolds(
        events.find(e => e.id === 'outcome-family-first'),
        save,
        objCtx,
      ),
      false,
    );
    const n = save.events.length;
    markSceneRun(save, map.id, clue);
    assert.equal(save.events.length, n);
  }
});
test('unknown evidence and positive prerequisite cycles are rejected; viable alternatives break a cycle', () => {
  const make = when => ({
    id: 'test',
    triggers: [
      {
        events: [
          {id: 'a', when},
          {id: 'b', when: {event: 'test/a'}},
        ],
      },
    ],
  });
  assert.match(validateSceneGraph([make({event: 'test/missing'})]).join('\n'), /unknown evidence/);
  assert.match(validateSceneGraph([make({event: 'test/b'})]).join('\n'), /cycle/);
  assert.deepEqual(validateSceneGraph([make({any: [{event: 'test/b'}, {flag: 'test.seal'}]})]), []);
  assert.deepEqual(validateSceneGraph(rawMaps()), []);
});
