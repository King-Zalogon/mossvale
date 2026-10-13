import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSceneGraph, sceneConditionHolds, markSceneRun} from '../dist/src/domain/scenes.js';
import {pickLine} from '../dist/src/domain/objectives.js';
import {buildWorld, isWalkable, nearestWalkable} from '../dist/src/domain/world.js';
import {mapsById, rawMaps, newSave, codec, objCtx} from './helpers.mjs';
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

test('new water is visible physical evidence and old standing points recover through the canonical world query', () => {
  const world = buildWorld(mapsById['orchard-ruins']);
  for (const [x, y] of [
    [54, 25],
    [54, 26],
    [55, 26],
    [54, 27],
    [55, 27],
    [41, 36],
    [41, 37],
  ]) {
    assert.equal(world.map.terrainAt(x, y), 'water');
    const bank = nearestWalkable(world, x, y);
    assert.ok(isWalkable(world, bank.x, bank.y));
    assert.ok(Math.hypot(bank.x - x, bank.y - y) <= 2, 'arrival rescue remains local');
  }
  assert.ok(isWalkable(world, 56, 27));
  assert.ok(isWalkable(world, 42, 36));
});

test('choice labels disclose an action only after finding the family, then return to inspection', () => {
  const save = newSave();
  const labels = map.landmarks.find(l => l.id === 'upper-hollow').labels;
  assert.doesNotMatch(pickLine(labels, save, objCtx), /family/);
  markSceneRun(save, map.id, 'den-family-seen');
  assert.match(pickLine(labels, save, objCtx), /Guide the family/);
  markSceneRun(save, map.id, 'outcome-water-first');
  assert.doesNotMatch(pickLine(labels, save, objCtx), /family/);
});
