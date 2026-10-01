// A bot plays the meadow with ordinary actions only (no forced HP, no mutated RNG): catch a friend, then beat the guardian.
// It documents what a straightforward player can do and fails if the first chapter becomes impossible.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattle, resolveTurn, rollWild} from '../dist/src/domain/battle.js';
import {seededRng} from '../dist/src/domain/rng.js';
import {companion, healTeam, level, maxHP} from '../dist/src/domain/rules.js';
import {maps, newSave} from './helpers.mjs';

const zone = maps[0].zones[0];
const guardian = maps[0].objects.find(o => o.kind === 'shrine').guardian;

function bestCompanion(save) {
  return save.caught.filter(i => companion(save, i).hp > 0).sort((a, b) => level(save, b) - level(save, a))[0];
}

/** Plays one encounter with a simple human-like policy; returns how it ended. */
function fight(save, battle, rng) {
  for (let turns = 0; turns < 60 && !battle.over; turns++) {
    const active = save.active;
    let action = {kind: 'element'};
    if (!battle.boss && battle.hp / battle.max <= 0.45 && save.orbs > 0) action = {kind: 'catch'};
    else if (companion(save).hp / maxHP(save, active) < 0.35 && save.potions > 0) action = {kind: 'potion'};
    const turn = resolveTurn(save, battle, action, rng);
    if (turn?.ended) return turn.ended;
  }
  return 'stalled';
}

function playMeadow(seed) {
  const save = newSave(),
    rng = seededRng(seed);
  let battles = 0,
    losses = 0;
  while (battles < 150) {
    healTeam(save); // resting at Ranger Iris is free
    save.orbs = Math.max(save.orbs, 12);
    save.active = bestCompanion(save);
    battles++;
    if (save.caught.length >= 2 && level(save, save.active) >= 7 && battles > 4) {
      const boss = createBattle(save, rng, {id: guardian.id, level: guardian.level, boss: true});
      if (fight(save, boss, rng) === 'win') return {battles, losses, caught: save.caught.length, level: level(save, save.active), won: true};
      losses++;
    } else {
      const spec = rollWild(save, rng, zone);
      if (fight(save, createBattle(save, rng, spec), rng) === 'loss') losses++;
    }
  }
  return {battles, losses, won: false};
}

test('the meadow guardian is beatable with normal actions from a fresh save', () => {
  const results = [1, 2, 3, 4, 5, 6, 7, 8].map(playMeadow);
  console.log('playthrough results (battles incl. guardian tries, losses):', results.map(r => `${r.battles}/${r.losses}${r.won ? '' : ' UNWON'}`).join('  '));
  for (const r of results) assert.ok(r.won, `seed did not clear the guardian: ${JSON.stringify(r)}`);
  assert.ok(results.every(r => r.caught >= 2));
});
