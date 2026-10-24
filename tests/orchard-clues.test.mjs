import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSceneGraph, sceneConditionHolds, markSceneRun} from '../dist/src/domain/scenes.js';
import {pickLine} from '../dist/src/domain/objectives.js';
import {buildWorld, isWalkable, nearestInteractive, nearestWalkable, triggersAt} from '../dist/src/domain/world.js';
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

test('Mara’s opening clue trigger covers the same interaction area as Mara', () => {
  const mara = map.landmarks.find(landmark => landmark.id === 'orchard-ranger');
  const trigger = map.triggers.find(item => item.id === 'orchard-mara-brief');
  const event = trigger.events.find(item => item.id === 'mara-water-loss');
  const world = buildWorld(mapsById['orchard-ruins']);
  const save = newSave();
  save.badges.push(0); // Meadow's Verdant Seal

  assert.deepEqual(trigger.at, mara.at, 'interacting with Mara must reach the authored scene trigger');
  assert.equal(trigger.radius, 1.95, 'the scene trigger covers the normal landmark interaction radius');
  assert.equal(trigger.beforeLandmark, true, 'the clue opens before generic ranger dialogue');
  assert.equal(sceneConditionHolds(event, save, objCtx), true);
  const player = {x: mara.at[0], y: mara.at[1] + 1};
  assert.equal(isWalkable(world, player.x, player.y), true, 'the player can stand in the shared interaction area');
  assert.equal(nearestInteractive(world, player)?.ref, mara.id, 'Mara is the landmark the player is interacting with');
  assert.ok(triggersAt(world, player, 'interact').some(item => item.id === trigger.id));

  save.badges = [];
  assert.equal(sceneConditionHolds(event, save, objCtx), false, 'the request remains gated until Meadow’s seal');
});
test('the cider press makes the next destination clear and repeats its clue without rerunning the one-time event', () => {
  const press = map.landmarks.find(landmark => landmark.id === 'cider-press');
  const clue = events.find(event => event.id === 'press-repair-record');
  let save = newSave();

  assert.match(pickLine(press.lines, save, objCtx), /last pressing was a good year/);
  markSceneRun(save, map.id, 'mara-water-loss');
  assert.equal(sceneConditionHolds(clue, save, objCtx), true);
  const clueText = clue.actions.find(action => action.type === 'dialogue').text;
  assert.match(clueText, /low hollow among the roots, beside the channel/i);
  markSceneRun(save, map.id, clue.id);
  const reminder = pickLine(press.lines, save, objCtx);
  assert.match(reminder, /water fell first, then the fresh hoofprints/i);
  assert.match(reminder, /follow the damp marks northeast along the lower row/i);
  assert.match(reminder, /low hollow among the roots, beside the channel/i);

  const priorEventCount = save.events.length;
  assert.equal(clue.repeatable, false, 'reinspection keeps the authored event one-time');
  markSceneRun(save, map.id, clue.id);
  assert.equal(save.events.length, priorEventCount);
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

test('committed orchard outcomes drive distinct decoration and both NPC callbacks after backup import', async () => {
  const {holds} = await import('../dist/src/domain/objectives.js');
  const {exportBackup, parseBackup} = await import('../dist/src/services/backup.js');
  const mara = map.landmarks.find(item => item.id === 'orchard-ranger');
  const rowan = rawMaps()
    .find(item => item.id === 'amber-ridge')
    .landmarks.find(item => item.id === 'ranger');
  for (const event of ['outcome-water-first', 'orchard-family', 'outcome-family-first']) {
    const save = newSave();
    save.events = ['orchard-ruins/den-family-seen', `orchard-ruins/${event}`];
    save.coins = 27;
    const imported = parseBackup(exportBackup(codec, save, {short: 'test'}), codec);
    assert.equal(imported.ok, true);
    const restored = imported.save;
    const visible = map.props.filter(prop => holds(prop.when, restored, objCtx));
    const adult = visible.filter(prop => prop.sprite === 'creature-bramblebuck');
    assert.equal(adult.length, 1, 'exactly one adult staging appears, distinct from the player companion');
    assert.deepEqual(adult[0].at, event === 'outcome-water-first' ? [[46, 35]] : [[44.4, 32.9]]);
    assert.match(pickLine(mara.lines, restored, objCtx), event === 'outcome-water-first' ? /cleared the bypass first/ : /family to dry roots first/);
    assert.match(pickLine(rowan.lines, restored, objCtx), event === 'outcome-water-first' ? /lower row is flowing/ : /family made it to the dry hollow/);
    assert.equal(holds(map.hints.find(hint => hint.id === 'two-priorities').resolved, restored, objCtx), true);
    assert.equal(restored.coins, 27, 'deriving presentation and callbacks pays no additional reward');
  }
});

test('conditional decorative props reject malformed, unknown-event and collision-changing authoring', async () => {
  const {buildAdventure} = await import('../dist/src/domain/adventure.js');
  const {content} = await import('./helpers.mjs');
  for (const [changes, expected] of [
    [{when: {event: 'orchard-ruins/not-a-real-event'}}, /unknown evidence/],
    [{when: {typo: true}}, /unknown condition/],
    [{when: {event: 'orchard-ruins/outcome-water-first'}, solid: 1}, /conditional props must be decorative/],
  ]) {
    const raw = rawMaps();
    Object.assign(
      raw.find(item => item.id === map.id).props.find(prop => prop.sprite === 'wood-plank-stack'),
      changes,
    );
    assert.match(buildAdventure(raw, content).errors.join('\n'), expected);
  }
});
