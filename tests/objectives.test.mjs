import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAdventure} from '../dist/src/domain/adventure.js';
import {createBattle, resolveWin} from '../dist/src/domain/battle.js';
import {currentObjective, holds, pickLine, validateObjectives} from '../dist/src/domain/objectives.js';
import {seededRng} from '../dist/src/domain/rng.js';
import {codec, content, maps, newSave, objCtx, objectives, rawMaps, rawObjectives} from './helpers.mjs';

const now = save => currentObjective(save, objectives, objCtx);
const edit = (fnMaps, fnObjectives) => {
  const m = rawMaps();
  const o = rawObjectives();
  fnMaps?.(m);
  fnObjectives?.(o);
  return buildAdventure(m, content, o).errors;
};
const has = (errors, text) =>
  assert.ok(
    errors.some(e => e.includes(text)),
    `expected "${text}" in:\n${errors.join('\n')}`,
  );

test('a simple objective chain is data and follows progress', () => {
  const save = newSave();
  assert.deepEqual([now(save).id, now(save).step], ['first-friend', '01']);
  assert.deepEqual(
    now(save).lines.map(l => l[0]),
    [false, false],
  );
  save.met = true;
  assert.deepEqual(
    now(save).lines.map(l => l[0]),
    [true, false],
  );
  save.caught.push(1);
  assert.equal(now(save).id, 'meadow-seal');
  save.badges.push(0);
  assert.equal(now(save).id, 'amber-seal');
  save.badges.push(1);
  assert.equal(now(save).id, 'frostveil-seal');
  save.badges.push(2);
  assert.equal(now(save).id, 'every-friend');
  save.caught = [0, 1, 2, 3, 4, 5, 6, 7];
  assert.equal(now(save).id, 'keeper');
  assert.deepEqual(
    now(save).lines.map(l => l[0]),
    [true, true],
  );
});

test('the pin points at the target map when you are elsewhere, and lines fill in counts', () => {
  const save = newSave();
  save.caught.push(1);
  assert.equal(now(save).pin, 'Follow the blue shrine marker north');
  save.badges.push(0);
  assert.match(now(save).pin, /eastern trail to Ridge/);
  save.region = 1;
  assert.equal(now(save).pin, 'Follow the blue shrine marker north');
  save.badges = [0, 1, 2];
  assert.equal(now(save).lines[1][1], 'Befriend every species (2 / 8)');
});

test('conditions: all, not, visited, seen, flags and unknown keys', () => {
  const save = newSave();
  assert.equal(holds({visited: 'meadow'}, save, objCtx), true);
  assert.equal(holds({visited: 'amber-ridge'}, save, objCtx), false);
  assert.equal(holds({not: {met: true}}, save, objCtx), true);
  assert.equal(holds({all: [{seen: 1}, {not: {flag: 'meadow.seal'}}]}, save, objCtx), true);
  assert.equal(holds({seen: 'all'}, save, objCtx), false);
  assert.equal(holds({sparkle: 1}, save, objCtx), false);
  assert.equal(holds(undefined, save, objCtx), true);
});

test('NPC and sign lines are picked by condition with a fallback', () => {
  const save = newSave();
  const ranger = maps[0].objects.find(o => o.kind === 'ranger');
  assert.match(pickLine(ranger.lines, save, objCtx), /shrines have been quiet/);
  save.caught.push(1);
  assert.match(pickLine(ranger.lines, save, objCtx), /blue crystal/);
  save.badges.push(0);
  assert.match(pickLine(ranger.lines, save, objCtx), /eastern trail/);
  assert.equal(pickLine([{when: {met: true}, text: 'x'}], save, objCtx), null);
  assert.equal(pickLine(undefined, save, objCtx), null);
  for (const map of maps) assert.ok(map.objects.find(o => o.kind === 'ranger').tag);
});

test('the seal reward comes from the shrine data and is paid once', () => {
  const save = newSave();
  save.caught.push(1);
  save.team[1] = {xp: 0, hp: 40};
  const shrine = maps[0].objects.find(o => o.kind === 'shrine');
  const win = () =>
    resolveWin(save, createBattle(save, seededRng(1), {...shrine.guardian, boss: true}), seededRng(1), {sealReward: {coins: 77, potions: 4, xp: 10}});
  const first = win();
  assert.deepEqual([first.newSeal, first.reward, first.potions, save.potions], [true, 77, 4, 7]);
  const second = win(); // beating the guardian again pays the small repeat reward, no new seal
  assert.deepEqual([second.newSeal, second.potions, save.badges.length], [false, 0, 1]);
  assert.equal(second.reward, 12);
});

test('the current goal is stored and the objective resumes from the save', () => {
  const save = newSave();
  save.caught.push(1);
  save.team[1] = {xp: 0, hp: 40};
  save.badges.push(0);
  save.goal = now(save).id;
  const back = codec.normalize(JSON.parse(codec.serialize(save)), false);
  assert.equal(back.goal, 'amber-seal');
  assert.equal(now(back).id, now(save).id);
  const raw = JSON.parse(codec.serialize(save));
  for (const goal of [7, 'Not An Id', 'x'.repeat(50), null]) assert.equal(codec.normalize({...raw, goal}, false).goal, '');
});

test('the shipped objectives validate and every flag they need can be earned', () => {
  assert.deepEqual(buildAdventure(rawMaps(), content, rawObjectives()).errors, []);
});

test('objective data errors are specific', () => {
  has(
    validateObjectives(
      {
        format: 1,
        objectives: [
          {id: 'a', step: '1', title: 't', copy: 'c', pin: 'p', done: {flag: 'meadow.treasure'}},
          {id: 'b', step: '2', title: 't', copy: 'c', pin: 'p'},
        ],
      },
      {mapIds: new Set(['meadow'])},
    ),
    'must be <map-id>.seal',
  );
  has(
    edit(null, o => (o.objectives[1].done = {sparkle: 1})),
    'unknown condition "sparkle"',
  );
  has(
    edit(null, o => (o.objectives[0].map = 'nowhere')),
    'unknown map "nowhere"',
  );
  has(
    edit(null, o => delete o.objectives[0].done),
    'only the last objective may be open-ended',
  );
  has(
    edit(null, o => (o.objectives[1].id = o.objectives[0].id)),
    'unique id',
  );
  has(
    edit(null, o => (o.objectives[0].done = {caught: -1})),
    'caught must be a count',
  );
  has(
    edit(null, o => (o.objectives[0].done = {a: 1, b: 2})),
    'exactly one key',
  );
});

test('softlocks in the unlock chain are rejected', () => {
  // An exit needing a seal that lives behind that very exit.
  has(
    edit(m => (m[0].exits[0].requires = 'amber-ridge.seal')),
    'map "amber-ridge" can never be reached',
  );
  // An objective that nothing can award.
  has(
    edit(m => m.forEach(map => map.landmarks.filter(l => l.kind === 'shrine').forEach(l => (l.flag = `${map.id}.chest`)))),
    'no reachable landmark awards',
  );
  // A map nobody links to.
  has(
    edit(m => (m[0].exits = [])),
    'can never be reached',
  );
});

test('map data problems for lines, rewards and tags are reported', () => {
  has(
    edit(m => delete m[0].landmarks.find(l => l.kind === 'shrine').reward),
    'shrines need { coins, potions, xp }',
  );
  has(
    edit(m => (m[0].landmarks.find(l => l.kind === 'ranger').lines = [{when: {flag: 'swamp.seal'}, text: 'x'}])),
    'when',
  );
  has(
    edit(m => (m[0].landmarks.find(l => l.kind === 'ranger').tag = 'WAY TOO LONG A LABEL')),
    'tag',
  );
});
