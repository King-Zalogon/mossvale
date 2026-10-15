import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAdventure} from '../dist/src/domain/adventure.js';
import {createBattle, resolveWin} from '../dist/src/domain/battle.js';
import {currentObjective, holds, pickLine, validateObjectives} from '../dist/src/domain/objectives.js';
import {seededRng} from '../dist/src/domain/rng.js';
import {renderObjectiveLines} from '../dist/src/ui/hud.js';
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
  assert.equal(now(save).id, 'reedfen-seal');
  save.badges.push(3);
  assert.equal(now(save).id, 'keeper');
  assert.deepEqual(
    now(save).lines.map(l => l[0]),
    [true, false],
  );
});

test('objective HUD renders pack-authored text as literal text nodes', () => {
  const container = {
    ownerDocument: {
      createElement: tagName => ({
        tagName,
        children: [],
        append(...children) {
          this.children.push(...children);
        },
      }),
      createTextNode: textContent => ({nodeType: 3, textContent}),
    },
    replaceChildren(...children) {
      this.children = children;
    },
  };
  const authoredText = '<img src=x onerror=alert(1)> Keep exploring';

  renderObjectiveLines(container, [
    [false, authoredText],
    [true, 'Found the trail'],
  ]);

  assert.equal(container.children.length, 2);
  assert.deepEqual(
    container.children.map(line => line.className),
    ['quest-line', 'quest-line'],
  );
  assert.equal(container.children[0].children[0].textContent, '○');
  assert.deepEqual(container.children[0].children[1], {nodeType: 3, textContent: authoredText});
  assert.equal(container.children[1].children[0].textContent, '✓');
  assert.deepEqual(container.children[1].children[1], {nodeType: 3, textContent: 'Found the trail'});
});

test('the pin points at the target map when you are elsewhere, and lines fill in counts', () => {
  const save = newSave();
  save.caught.push(1);
  assert.equal(now(save).pin, 'Follow the blue shrine marker north');
  save.badges.push(0);
  assert.match(now(save).pin, /eastern trail to Ridge/);
  save.region = 1;
  save.mapId = 'amber-ridge';
  assert.equal(now(save).pin, 'Follow the blue shrine marker north');
  save.badges = [0, 1, 2, 3];
  assert.equal(now(save).lines[1][1], `Befriend every species if you like (2 / ${objCtx.speciesCount})`);
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
  assert.match(pickLine(ranger.lines, save, objCtx), /orchard trail/);
  const frostRanger = maps[2].objects.find(o => o.kind === 'ranger');
  save.badges = [0, 1, 2];
  assert.match(pickLine(frostRanger.lines, save, objCtx), /Reedfen's last shrine/);
  save.badges.push(3);
  assert.match(pickLine(frostRanger.lines, save, objCtx), /All four seals shine again/);
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

test('companion conditions read the live save and validate against the pack species (#277)', () => {
  const save = newSave();
  const ids = objCtx.speciesIds;
  const [first, second] = [ids[save.active], ids.find(id => id !== ids[save.active])];
  assert.equal(holds({active: first}, save, objCtx), true);
  assert.equal(holds({active: second}, save, objCtx), false);
  assert.equal(holds({party: first}, save, objCtx), true);
  assert.equal(holds({party: second}, save, objCtx), false);
  // Changing the party changes the answer on the next read; nothing is cached in the data.
  const index = ids.indexOf(second);
  save.caught.push(index);
  save.party.push(index);
  assert.equal(holds({party: second}, save, objCtx), true);
  save.active = index;
  assert.equal(holds({active: second}, save, objCtx), true);
  assert.equal(holds({active: first}, save, objCtx), false);
  // Without the species list the condition is false rather than guessing.
  assert.equal(holds({active: second}, save, {speciesCount: ids.length, regions: []}), false);
  assert.equal(holds({active: 3}, save, objCtx), false);
  const lines = [{when: {active: second}, text: 'one'}, {text: 'two'}];
  assert.equal(pickLine(lines, save, objCtx), 'one');
  save.active = ids.indexOf(first);
  assert.equal(pickLine(lines, save, objCtx), 'two');
});

test('companion conditions with an unknown or malformed species fail validation', () => {
  const bad = edit(maps => {
    maps[0].landmarks.find(l => l.kind === 'ranger').lines = [
      {when: {active: 'no-such-friend'}, text: 'x'},
      {when: {party: 'Bad Id'}, text: 'y'},
    ];
  });
  has(bad, 'active names unknown species "no-such-friend"');
  has(bad, 'party must be a stable species id');
});
