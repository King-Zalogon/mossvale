import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {validateSceneScript, validateSceneSequence} from '../scripts/scene-script.mjs';
import {validateSceneLink} from '../scripts/lib/scene-continuity.mjs';

const json = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url)));
const catalogue = json('content/catalogue/catalogue.json');
const scenes = () => ['one', 'two', 'three'].map(id => json(`content/scene-scripts/examples/continuity/bell-${id}.json`));
const strict = {requireContinuity: true};

test('three inspectable handoffs preserve first-scene promise, resolved question and choice into scene three', () => {
  const chain = scenes();
  assert.deepEqual(validateSceneSequence(chain, catalogue, strict).errors, []);
  const output = chain[2].continuityOut;
  assert.equal(output.obligations.find(o => o.id === 'report-bell').sourceSceneId, 'bell-one');
  assert.equal(output.obligations.find(o => o.id === 'report-bell').status, 'resolved');
  assert.equal(output.obligations.find(o => o.id === 'bell-source').status, 'resolved');
  assert.equal(output.decisionRecords[0].sourceSceneId, 'bell-one');
  assert.equal(output.decisionRecords[0].status, 'resolved');
  const reordered = structuredClone(chain[2]);
  reordered.continuityIn.actorRoles.reverse();
  assert.deepEqual(validateSceneLink(chain[1], reordered), [], 'record ordering is not history');
});

test('a recap or incomplete incoming snapshot cannot discard resolved history', () => {
  for (const field of ['obligations', 'decisionRecords', 'relationships', 'actorRoles']) {
    const chain = scenes();
    chain[2].continuityIn[field] = [];
    assert.ok(validateSceneSequence(chain, catalogue, strict).errors.some(error => error.includes('complete continuityOut')));
  }
  const chain = scenes();
  chain[2].previousScene.id = 'bell-one';
  assert.ok(validateSceneSequence(chain, catalogue, strict).errors.some(error => error.includes('previousScene')));
});

test('explicit contradictory obligations and immutable choices cannot be rewritten', () => {
  for (const mutate of [
    s => (s.continuityOut.obligations[1].status = 'active'),
    s => (s.continuityOut.decisionRecords[0].choice = 'Guess without inspecting'),
    s => (s.continuityOut.decisionRecords[0].sourceSceneId = 'bell-three'),
    s => (s.continuityOut.relationships[0].to = 'companion-active'),
  ]) {
    const scene = scenes()[2];
    mutate(scene);
    assert.ok(validateSceneScript(scene, catalogue, strict).errors.length);
  }
  const scene = scenes()[1];
  scene.continuityChanges[0].beatIds = ['invented'];
  assert.ok(validateSceneScript(scene, catalogue, strict).errors.some(error => error.includes('missing consequence beat')));
});

test('role substitution requires matching binding, actual dialogue beats and staging', () => {
  const path = 'docs/scene-script-proofs/186-the-fernling-at-dusk/corrected-handoff-v2.json';
  const corrected = json(path);
  assert.deepEqual(validateSceneScript(corrected, catalogue, strict).errors, []);
  for (const mutate of [
    s => delete s.continuityChanges[0].staging,
    s => (s.continuityChanges[0].dialogueBeatIds = ['invented']),
    s => (s.continuityOut.actorRoles[1].owner = 'npc'),
    s => (s.participants[1].binding.fallbackResourceId = 'visual:chest-wooden'),
    s => (s.participants[1].traits = []),
  ]) {
    const bad = structuredClone(corrected);
    mutate(bad);
    assert.ok(validateSceneScript(bad, catalogue, strict).errors.length);
  }
  for (const name of ['fernling', 'emberkin', 'brooklet']) {
    const selected = structuredClone(corrected);
    const id = `species:mossvale/${name}`;
    assert.ok(catalogue.entries.some(entry => entry.id === id));
    selected.participants[1].resourceId = id;
    selected.continuityOut.actorRoles[1].resourceId = id;
    assert.deepEqual(validateSceneScript(selected, catalogue, strict).errors, [], `${name} remains the player's selected companion`);
    assert.ok(selected.beats.every(beat => !beat.text?.includes('my familiar')));
  }
});

test('legacy format stays valid with a migration warning; CLI strict mode checks the previous handoff', () => {
  const legacy = json('content/scene-scripts/examples/home-rest-extension-request.json');
  assert.deepEqual(validateSceneScript(legacy, catalogue).errors, []);
  assert.ok(validateSceneScript(legacy, catalogue).warnings.some(warning => warning.includes('legacy handoff')));
  assert.ok(validateSceneScript(legacy, catalogue, strict).errors.length);
  const result = spawnSync(
    process.execPath,
    [
      'scripts/scene-script.mjs',
      'content/scene-scripts/examples/continuity/bell-three.json',
      '--require-continuity',
      '--previous',
      'content/scene-scripts/examples/continuity/bell-two.json',
    ],
    {encoding: 'utf8'},
  );
  assert.equal(result.status, 0, result.stderr);
});
