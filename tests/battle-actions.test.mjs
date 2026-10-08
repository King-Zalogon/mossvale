import test from 'node:test';
import assert from 'node:assert/strict';
import {ELEMENT_COST, FOCUS_GAIN, FOCUS_MAX, FOCUS_START, GUARD_FACTOR, RELAY_FOCUS_COST} from '../dist/src/config.js';
import {battleCheckpoint, captureChance, createBattle, enemyAttack, playerStrike, resolveTurn} from '../dist/src/domain/battle.js';
import {seededRng} from '../dist/src/domain/rng.js';
import {codec, newSave, rawInventoryRules} from './helpers.mjs';

// Fernling (Leaf) vs a Pebblit-like neutral foe would be Stone; use Duskwing (Air) = neutral for Leaf.
const NEUTRAL = 3;
const fresh = () => {
  const save = newSave();
  save.team[0].hp = 1e6; // the player survives long enough to test sequences
  return {save, battle: createBattle(save, seededRng(1), {id: NEUTRAL, level: 40})}; // a tough foe so fights last
};
const rng = () => 0.5;

test('battles start with some Focus', () => assert.equal(fresh().battle.focus, FOCUS_START));

test('the elemental move spends Focus and is refused (without side effects) when there is none', () => {
  const {save, battle} = fresh();
  for (let i = 0; i < FOCUS_START; i++) assert.notEqual(resolveTurn(save, battle, {kind: 'element'}, rng), null);
  assert.equal(battle.focus, FOCUS_START - FOCUS_START * ELEMENT_COST);
  const before = JSON.stringify([save, battle]);
  assert.equal(resolveTurn(save, battle, {kind: 'element'}, rng), null);
  assert.equal(JSON.stringify([save, battle]), before);
});

test('Quick strike and Guard build Focus up to the cap', () => {
  const {save, battle} = fresh();
  battle.focus = 0;
  resolveTurn(save, battle, {kind: 'attack'}, rng);
  assert.equal(battle.focus, FOCUS_GAIN);
  resolveTurn(save, battle, {kind: 'guard'}, rng);
  assert.equal(battle.focus, 2 * FOCUS_GAIN);
  for (let i = 0; i < 10; i++) resolveTurn(save, battle, {kind: 'guard'}, rng);
  assert.equal(battle.focus, FOCUS_MAX);
});

test('every event snapshot reports the Focus after it, so the display matches the rules', () => {
  const {save, battle} = fresh();
  const {events} = resolveTurn(save, battle, {kind: 'element'}, rng);
  assert.equal(events[0].after.focus, FOCUS_START - ELEMENT_COST);
  assert.equal(events.at(-1).after.focus, battle.focus);
});

test('two offensive options both matter: the special move hits harder, the strike keeps you in the fight', () => {
  const save = newSave();
  const hit = (kind, focus) => playerStrike(save, {...createBattle(save, seededRng(1), {id: NEUTRAL, level: 40}), focus}, kind, () => 0.5).damage;
  assert.ok(hit('element', 3) > hit('attack', 3), 'special move outdamages the strike');
  // Over 12 turns, strike-only (never stuck) vs the best mix (spend whenever possible) vs spending-only (runs dry).
  const run = policy => {
    const {save: s, battle} = fresh();
    battle.hp = battle.max = 1e6;
    let dealt = 0;
    for (let t = 0; t < 12; t++) {
      const kind = policy(battle);
      const before = battle.hp;
      const turn = resolveTurn(s, battle, {kind}, rng);
      if (!turn) continue; // refused: the player would have to pick something else
      dealt += before - battle.hp;
      s.team[0].hp = 9999;
    }
    return dealt;
  };
  const strikeOnly = run(() => 'attack');
  const mix = run(b => (b.focus >= 1 ? 'element' : 'attack'));
  const elementOnly = run(() => 'element');
  assert.ok(mix > strikeOnly, 'using the special move well beats striking alone');
  assert.ok(strikeOnly > elementOnly, 'spamming the special move without Focus wastes turns');
});

test('guard cuts the next enemy hit by the displayed amount; guarding does nothing for later hits', () => {
  const {save, battle} = fresh();
  const open = enemyAttack(save, battle, rng).damage;
  battle.turn = 0; // same kind of enemy move for a fair comparison
  battle.guard = true;
  const guarded = enemyAttack(save, battle, rng).damage;
  battle.turn = 0;
  assert.ok(Math.abs(guarded / open - GUARD_FACTOR) < 0.08, `${guarded} / ${open}`);
  assert.equal(battle.guard, false);
  assert.equal(enemyAttack(save, battle, rng).damage, open);
});

test('capture chance shown to the player is the one used', () => {
  const {save, battle} = fresh();
  battle.hp = Math.floor(battle.max / 2);
  const chance = captureChance(save, battle);
  let caught = 0;
  const trials = 400;
  for (let i = 0; i < trials; i++) {
    const s = newSave(),
      b = createBattle(s, seededRng(i), {id: NEUTRAL, level: 40});
    b.hp = battle.hp;
    s.team[0].hp = 9999;
    if (resolveTurn(s, b, {kind: 'catch'}, seededRng(1000 + i)).ended === 'caught') caught++;
  }
  assert.ok(Math.abs(caught / trials - chance) < 0.08, `observed ${caught / trials}, shown ${chance}`);
});

test('Focus survives a saved encounter; bad values fall back', () => {
  const {save, battle} = fresh();
  battle.focus = 1;
  save.battle = battleCheckpoint(battle);
  const raw = JSON.parse(codec.serialize(save));
  assert.equal(codec.normalize(raw, false).battle.focus, 1);
  for (const focus of [-1, 9, 1.5, 'x', undefined]) assert.equal(codec.normalize({...raw, battle: {...raw.battle, focus}}, false).battle.focus, FOCUS_START);
});

test('a bounded relay condition makes switching into the prepared move a real option', () => {
  const {save, battle} = fresh();
  save.party.push(1);
  save.caught.push(1);
  save.team[1] = {xp: 0, hp: 9999};
  assert.equal(resolveTurn(save, battle, {kind: 'setup'}, rng)?.events[0].type, 'setup');
  assert.equal(battle.condition.id, 'relay');
  assert.equal(battle.condition.remaining, 1);
  const checkpoint = battleCheckpoint(battle);
  save.battle = checkpoint;
  const restored = codec.normalize(JSON.parse(codec.serialize(save)), false).battle;
  assert.deepEqual(restored.condition, battle.condition);
  assert.equal(resolveTurn(save, battle, {kind: 'switch', id: 1}, rng)?.events[0].type, 'switch');
  assert.equal(battle.relayReady, true);
  const prepared = resolveTurn(save, battle, {kind: 'element'}, rng);
  const preparedStrike = prepared.events.find(event => event.type === 'strike');
  assert.equal(preparedStrike.prepared, true);
  assert.equal(battle.relayReady, false);
  assert.equal(battle.focus, 0);
  assert.equal(RELAY_FOCUS_COST, 1);
});

test('relay expires after its bounded window and cannot be stacked', () => {
  const {save, battle} = fresh();
  save.party.push(1);
  save.caught.push(1);
  save.team[1] = {xp: 0, hp: 9999};
  assert.ok(resolveTurn(save, battle, {kind: 'setup'}, rng));
  assert.equal(resolveTurn(save, battle, {kind: 'setup'}, rng), null);
  assert.ok(resolveTurn(save, battle, {kind: 'guard'}, rng));
  assert.equal(battle.condition, null);
  assert.equal(resolveTurn(save, battle, {kind: 'switch', id: 1}, rng)?.events[0].type, 'switch');
  assert.equal(battle.relayReady, false);
});

test('live battle potion uses the pack percentage and keeps legacy supply counts in sync', () => {
  const save = newSave();
  save.team[0].hp = 10;
  const battle = createBattle(save, rng, {id: NEUTRAL, level: 1});
  battle.hp = battle.max = 9999;
  const before = save.inventory.bag.potion;
  const turn = resolveTurn(save, battle, {kind: 'potion'}, rng, {inventoryRules: rawInventoryRules()});
  const item = turn.events.find(event => event.type === 'item');
  assert.equal(item.healed, 15);
  assert.equal(save.inventory.bag.potion, before - 1);
  assert.equal(save.potions, before - 1);
  assert.ok(save.team[0].hp > 0 && save.team[0].hp < 25); // the enemy reply follows the same atomic round
});

test('wild wins grant a once-only configured item drop', () => {
  const save = newSave();
  save.team[0].hp = 1e6;
  const battle = createBattle(save, rng, {id: NEUTRAL, level: 1});
  battle.hp = 1;
  const turn = resolveTurn(save, battle, {kind: 'attack'}, rng, {inventoryRules: rawInventoryRules()});
  const reward = turn.events.find(event => event.type === 'win');
  assert.equal(turn.ended, 'win');
  assert.deepEqual(reward.itemRewards, [{item: 'moss-pearl', quantity: 1}]);
  assert.equal(save.inventory.bag['moss-pearl'], 1);
  assert.equal(save.inventory.claimed[`defeat-${NEUTRAL}-1`], true);
});

test('capture rewards also persist and preserve the coin grant', () => {
  const save = newSave();
  save.team[0].hp = 1e6;
  const beforeOrbs = save.orbs;
  const battle = createBattle(save, rng, {id: NEUTRAL, level: 1});
  battle.hp = 0;
  const turn = resolveTurn(save, battle, {kind: 'catch'}, () => 0, {inventoryRules: rawInventoryRules()});
  const reward = turn.events.find(event => event.type === 'caught');
  assert.equal(turn.ended, 'caught');
  assert.deepEqual(reward.itemRewards, [{item: 'moss-pearl', quantity: 1}]);
  assert.equal(save.inventory.bag['moss-pearl'], 1);
  assert.equal(save.orbs, beforeOrbs - 1);
  assert.equal(save.inventory.bag.orb, beforeOrbs - 1);
  assert.equal(save.coins, 10);
});
