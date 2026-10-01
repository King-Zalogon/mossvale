import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattle, battleCheckpoint, resolveTurn} from '../dist/src/domain/battle.js';
import {transition} from '../dist/src/domain/phase.js';
import {seededRng} from '../dist/src/domain/rng.js';
import {maxHP} from '../dist/src/domain/rules.js';
import {createTimeline} from '../dist/src/services/timeline.js';
import {codec, newSave} from './helpers.mjs';

const wild = (save, id = 1, level = 6) => createBattle(save, seededRng(1), {id, level});

test('a turn resolves exactly once: orb, outcome and reward are applied atomically', () => {
  const save = newSave();
  const battle = wild(save);
  battle.hp = 1;
  const orbs = save.orbs;
  const turn = resolveTurn(save, battle, {kind: 'catch'}, () => 0); // rng 0 always captures
  assert.equal(turn.ended, 'caught');
  assert.equal(save.orbs, orbs - 1);
  assert.ok(save.caught.includes(1));
  const coins = save.coins,
    wins = save.wins,
    xp = save.team[0].xp;
  // A stale second tap on the same battle cannot repeat the rewards or spend another orb.
  assert.equal(
    resolveTurn(save, battle, {kind: 'catch'}, () => 0),
    null,
  );
  assert.equal(
    resolveTurn(save, battle, {kind: 'attack'}, () => 0),
    null,
  );
  assert.deepEqual([save.orbs, save.coins, save.wins, save.team[0].xp], [orbs - 1, coins, wins, xp]);
});

test('a won battle pays out once', () => {
  const save = newSave();
  const battle = wild(save);
  battle.hp = 1;
  const turn = resolveTurn(save, battle, {kind: 'attack'}, seededRng(3));
  assert.equal(turn.ended, 'win');
  const snapshot = JSON.stringify(save);
  assert.equal(resolveTurn(save, battle, {kind: 'attack'}, seededRng(3)), null);
  assert.equal(JSON.stringify(save), snapshot);
});

test('disallowed actions change nothing', () => {
  const save = newSave();
  const battle = wild(save);
  const before = JSON.stringify([save, battle]);
  save.orbs = 0;
  assert.equal(
    resolveTurn(save, battle, {kind: 'catch'}, () => 0),
    null,
  );
  assert.equal(
    resolveTurn(save, battle, {kind: 'potion'}, () => 0),
    null,
  ); // already at full health
  assert.equal(
    resolveTurn(save, battle, {kind: 'switch', id: 4}, () => 0),
    null,
  ); // not owned
  assert.equal(
    resolveTurn(save, battle, {kind: 'switch', id: save.active}, () => 0),
    null,
  ); // already active
  assert.equal(
    resolveTurn(save, battle, {kind: 'dance'}, () => 0),
    null,
  );
  assert.equal(JSON.stringify([save, battle]), before.replace('"orbs":12', '"orbs":0'));
});

test('guardians cannot be captured and the orb is not spent', () => {
  const save = newSave();
  const boss = createBattle(save, seededRng(1), {id: 7, level: 7, boss: true});
  assert.equal(
    resolveTurn(save, boss, {kind: 'catch'}, () => 0),
    null,
  );
  assert.equal(save.orbs, 12);
});

test('every event carries a display snapshot and the enemy replies in the same round', () => {
  const save = newSave();
  const battle = wild(save);
  const {events, ended} = resolveTurn(save, battle, {kind: 'guard'}, seededRng(2));
  assert.equal(ended, null);
  assert.deepEqual(
    events.map(e => e.type),
    ['guard', 'enemy'],
  );
  for (const e of events) assert.ok('active' in e.after && 'mine' in e.after && 'enemy' in e.after);
  assert.equal(events[1].after.mine, save.team[0].hp);
});

test('defeat heals the team and ends the battle once', () => {
  const save = newSave();
  save.team[0].hp = 1;
  const battle = wild(save, 7, 30); // far stronger enemy
  const turn = resolveTurn(save, battle, {kind: 'guard'}, () => 0.99);
  assert.equal(turn.ended, 'loss');
  assert.equal(save.team[0].hp, maxHP(save, 0));
  assert.equal(
    resolveTurn(save, battle, {kind: 'guard'}, () => 0.5),
    null,
  );
});

test('switching companions uses the turn and the enemy still replies', () => {
  const save = newSave();
  save.caught.push(1);
  save.party.push(1);
  save.team[1] = {xp: 0, hp: 40};
  const battle = wild(save);
  const turn = resolveTurn(save, battle, {kind: 'switch', id: 1}, seededRng(5));
  assert.equal(save.active, 1);
  assert.deepEqual(turn.events.map(e => e.type).slice(0, 2), ['switch', 'enemy']);
});

test('battle checkpoints survive save/load and invalid ones are dropped', () => {
  const save = newSave();
  const battle = wild(save, 2, 8);
  battle.hp -= 5;
  battle.guard = true;
  battle.turn = 3;
  save.battle = battleCheckpoint(battle);
  const back = codec.normalize(JSON.parse(codec.serialize(save)), false);
  assert.deepEqual(back.battle, save.battle);
  const raw = JSON.parse(codec.serialize(save));
  for (const bad of [
    {...raw.battle, hp: 0},
    {...raw.battle, id: 'dragon'},
    {...raw.battle, level: 0},
    {...raw.battle, hp: raw.battle.max + 1},
    'x',
    [],
    null,
  ]) {
    assert.equal(codec.normalize({...raw, battle: bad}, false).battle, null);
  }
  assert.equal(battleCheckpoint({...battle, over: true}), null);
  assert.equal(codec.normalize({...raw, recap: 'x'.repeat(500)}, false).recap.length, 200);
});

test('phase transitions refuse impossible jumps', () => {
  const game = {phase: 'explore'};
  assert.equal(transition(game, 'result'), true);
  assert.equal(transition(game, 'battle'), false); // cannot start a battle from a result screen
  assert.equal(game.phase, 'result');
  assert.equal(transition(game, 'explore'), true);
  assert.equal(transition(game, 'battle'), true);
  assert.equal(transition(game, 'battle'), true);
});

function fakeTimers() {
  const queue = [];
  return {
    setTimer: fn => queue.push(fn) - 1,
    clearTimer: id => (queue[id] = null),
    run: () => {
      const fns = queue.splice(0).filter(Boolean);
      fns.forEach(f => f());
      return fns.length;
    },
  };
}

test('timeline: frames play in order and complete once', () => {
  const t = fakeTimers(),
    log = [];
  const line = createTimeline(t);
  line.play([{m: 'a', wait: 5}, {m: 'b', wait: 5}, {m: 'c'}], {render: f => log.push(f.m), done: () => log.push('done')});
  assert.deepEqual(log, ['a']);
  t.run();
  t.run();
  assert.deepEqual(log, ['a', 'b', 'c', 'done']);
  assert.equal(line.active, false);
});

test('timeline: a stale callback never touches a newer playback', () => {
  const t = fakeTimers(),
    log = [];
  const line = createTimeline(t);
  line.play([{m: 'old1', wait: 5}, {m: 'old2'}], {render: f => log.push(f.m), done: () => log.push('old-done')});
  line.play([{m: 'new1', wait: 5}, {m: 'new2'}], {render: f => log.push(f.m), done: () => log.push('new-done')});
  t.run();
  assert.deepEqual(log, ['old1', 'new1', 'new2', 'new-done']);
});

test('timeline: cancel drops pending frames; flush shows only the last frame and completes once', () => {
  const t = fakeTimers(),
    log = [];
  const line = createTimeline(t);
  line.play([{m: 'a', wait: 5}, {m: 'b'}], {render: f => log.push(f.m), done: () => log.push('done')});
  line.cancel();
  t.run();
  assert.deepEqual(log, ['a']);
  line.play([{m: 'x', wait: 5}, {m: 'y', wait: 5}, {m: 'z'}], {render: f => log.push(f.m), done: () => log.push('done')});
  line.flush();
  line.flush();
  t.run();
  assert.deepEqual(log, ['a', 'x', 'z', 'done']);
});
