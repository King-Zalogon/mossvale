import test from 'node:test';
import assert from 'node:assert/strict';
import {BENCH_SHARE, MAX_LEVEL, MAX_XP, MOVE_UPGRADE_LEVEL, XP_PER_LEVEL} from '../dist/src/config.js';
import {createBattle, playerStrike, resolveCapture, resolveWin} from '../dist/src/domain/battle.js';
import {addXP, awardXP, elementPower, level, maxHP, moveName, xpProgress} from '../dist/src/domain/rules.js';
import {seededRng} from '../dist/src/domain/rng.js';
import {codec, newSave} from './helpers.mjs';

const withTeam = (...xps) => {
  const save = newSave();
  xps.forEach((xp, i) => {
    if (i) save.caught.push(i);
    save.team[i] = {xp, hp: 0};
    save.team[i].hp = maxHP(save, i);
  });
  return save;
};

test('levels are bounded and XP cannot overflow', () => {
  const save = withTeam(0);
  addXP(save, 0, 1e12);
  assert.equal(save.team[0].xp, MAX_XP);
  assert.equal(level(save, 0), MAX_LEVEL);
  assert.deepEqual(xpProgress(save, 0).maxed, true);
  addXP(save, 0, 50);
  assert.equal(save.team[0].xp, MAX_XP);
  assert.ok(Number.isFinite(maxHP(save, 0)));
});

test('old saves with unbounded XP migrate to the cap without losing their level up to it', () => {
  const raw = {version: 2, caught: [0, 1], team: {0: {xp: 4000, hp: 999}, 1: {xp: 90, hp: 10}}};
  const save = codec.normalize(raw, true);
  assert.equal(save.team[0].xp, MAX_XP);
  assert.equal(level(save, 0), MAX_LEVEL);
  assert.equal(save.team[0].hp, maxHP(save, 0));
  assert.equal(level(save, 1), 7); // 90 XP is unchanged: 5 + 2
});

test('the active fighter earns full XP; every other companion earns a share', () => {
  const save = withTeam(0, 0, 0);
  awardXP(save, 24);
  assert.deepEqual([save.team[0].xp, save.team[1].xp, save.team[2].xp], [24, 24 * BENCH_SHARE, 24 * BENCH_SHARE]);
  const tiny = withTeam(0, 0);
  awardXP(tiny, 1);
  assert.equal(tiny.team[1].xp, 1); // never less than 1
});

test('a trailing fighter catches up faster, so switching to a new catch is not a grind', () => {
  const veteran = XP_PER_LEVEL * 6; // level 11
  const save = withTeam(veteran, 0);
  save.active = 1; // level 5, six levels behind
  awardXP(save, 24);
  assert.equal(save.team[1].xp, 36); // 24 * 1.5
  const level2 = withTeam(XP_PER_LEVEL, 0); // only one level behind: no bonus
  level2.active = 1;
  awardXP(level2, 24);
  assert.equal(level2.team[1].xp, 24);
});

test('a freshly caught creature starts at the wild level and can fight right away', () => {
  const save = newSave();
  const battle = createBattle(save, seededRng(1), {id: 3, level: 9});
  resolveCapture(save, battle);
  assert.ok(level(save, 3) >= 9); // captured at the wild level (the shared award may lift it)
  assert.equal(save.team[3].hp, maxHP(save, 3));
});

test('the elemental move upgrades once at the configured level and says so', () => {
  const save = withTeam(XP_PER_LEVEL * (MOVE_UPGRADE_LEVEL - 5) - 10);
  assert.equal(moveName(save, 0), 'Leaf burst');
  const weak = elementPower(save, 0);
  const award = awardXP(save, 24);
  assert.equal(moveName(save, 0), 'Leaf burst+');
  assert.ok(elementPower(save, 0) > weak);
  assert.match(award.text, /Leaf burst\+ grew stronger!/);
  assert.equal(awardXP(save, 24).text.includes('grew stronger'), false); // only once
  const battle = createBattle(save, seededRng(2), {id: 1, level: 6});
  assert.equal(playerStrike(save, battle, 'element', seededRng(3)).move, 'Leaf burst+');
  assert.equal(playerStrike(save, battle, 'attack', seededRng(3)).move, 'Quick strike');
});

test('a win reports the active fighter and level-ups of the bench', () => {
  const save = withTeam(0, XP_PER_LEVEL - 5);
  const battle = createBattle(save, seededRng(1), {id: 1, level: 6});
  battle.hp = 0;
  const win = resolveWin(save, battle, seededRng(1));
  assert.match(win.xpText, /Emberkin reached level 6!/);
});
