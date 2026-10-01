import test from 'node:test';
import assert from 'node:assert/strict';
import {species} from '../dist/src/data/species.js';
import {seededRng} from '../dist/src/domain/rng.js';
import {level, maxHP, unlocked} from '../dist/src/domain/rules.js';
import {currentObjective} from '../dist/src/domain/objectives.js';
import {createBattle, rollWild, enemyAttack, playerStrike, resolveCapture, resolveFaint, resolveLoss, resolveWin} from '../dist/src/domain/battle.js';
import {buildWorld, isWalkable, nearestInteractive} from '../dist/src/domain/world.js';
import {codec, maps, objCtx, objectives} from './helpers.mjs';
import {movePlayer} from '../dist/src/domain/exploration.js';

const newSave = () => codec.fresh();

test('seeded rng is deterministic', () => {
  const a = seededRng(7),
    b = seededRng(7);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});

test('seeded wild battle: strike until defeated, then win rewards', () => {
  const save = newSave(),
    rng = seededRng(1);
  const battle = createBattle(save, rng, {id: 1, level: 6});
  assert.ok(save.seen.includes(1) && save.met);
  let turns = 0;
  while (battle.hp > 0 && turns++ < 50) playerStrike(save, battle, 'element', rng);
  assert.equal(battle.hp, 0);
  const coins = save.coins,
    xp = save.team[0].xp;
  const w = resolveWin(save, battle, rng);
  assert.equal(w.newSeal, false);
  assert.equal(save.coins, coins + w.reward);
  assert.equal(save.team[0].xp, xp + 24);
  assert.equal(save.wins, 1);
});

test('capture adds an individual creature with level-based XP', () => {
  const save = newSave(),
    rng = seededRng(2);
  const battle = createBattle(save, rng, {id: 3, level: 6});
  const c = resolveCapture(save, battle);
  assert.equal(c.isNew, true);
  assert.ok(save.caught.includes(3));
  assert.equal(save.team[3].hp, maxHP(save, 3));
  assert.equal(resolveCapture(save, battle).isNew, false);
});

test('guardian: naturally winnable path unlocks next region', () => {
  const save = newSave(),
    rng = seededRng(3);
  save.caught.push(1);
  save.party.push(1);
  save.team[1] = {xp: 0, hp: species[1].hp};
  const boss = createBattle(save, rng, {...maps[0].objects.find(o => o.kind === 'shrine').guardian, boss: true});
  assert.equal(boss.level, 7);
  boss.hp = 1;
  playerStrike(save, boss, 'attack', rng);
  const w = resolveWin(save, boss, rng);
  assert.equal(w.newSeal, true);
  assert.deepEqual(save.badges, [0]);
  assert.equal(unlocked(save, 1), true);
  assert.equal(unlocked(save, 2), false);
});

test('enemy attacks reduce HP, guard softens them, faint swaps then loses', () => {
  const save = newSave();
  save.caught.push(1);
  save.party.push(1);
  save.team[1] = {xp: 0, hp: species[1].hp};
  const battle = createBattle(save, seededRng(4), {id: 2, level: 6});
  battle.guard = true;
  const guarded = enemyAttack(save, battle, () => 0.5);
  battle.guard = false;
  const open = enemyAttack(save, battle, () => 0.5);
  assert.ok(guarded.damage < open.damage);
  save.team[0].hp = 0;
  assert.deepEqual([resolveFaint(save).status, save.active], ['switched', 1]);
  save.team[1].hp = 0;
  assert.equal(resolveFaint(save).status, 'lost');
  resolveLoss(save);
  assert.equal(save.team[0].hp, maxHP(save, 0));
});

test('objective advances with progress', () => {
  const save = newSave();
  assert.equal(currentObjective(save, objectives, objCtx).step, '01');
  save.caught.push(1);
  save.party.push(1);
  save.team[1] = {xp: 0, hp: 40};
  assert.equal(currentObjective(save, objectives, objCtx).step, '02');
  save.badges = [0, 1, 2];
  assert.equal(currentObjective(save, objectives, objCtx).step, '05');
  assert.equal(level(save, 0), 5);
});

test('world: spawn is walkable, landmarks exist, walking in the encounter zone triggers encounters', () => {
  for (const map of maps) {
    const world = buildWorld(map);
    assert.ok(isWalkable(world, map.spawns.camp.x, map.spawns.camp.y));
    assert.ok(world.objects.some(o => o.kind === 'shrine'));
  }
  const world = buildWorld(maps[0]),
    player = {x: 17, y: 12, dir: 8};
  assert.equal(nearestInteractive(world, {x: 17.2, y: 16})?.kind, 'chest');
  const pacing = {steps: 0, encounterAt: 1, encounterCooldown: 0};
  let zone = null;
  for (let i = 0; i < 200 && !zone; i++) zone = movePlayer({world, player, pacing}, 1, 0, true, 0.04);
  assert.ok(zone && zone.pool.length);
  const wild = rollWild(newSaveForZone(), seededRng(9), zone);
  assert.ok(zone.pool.includes(wild.id) && wild.level >= zone.level[0] && wild.level <= zone.level[1]);
});

function newSaveForZone() {
  return codec.fresh();
}
