import test from 'node:test';
import assert from 'node:assert/strict';
import {captureChance, createBattle, resolveTurn} from '../dist/src/domain/battle.js';
import {companion, maxHP} from '../dist/src/domain/rules.js';
import {seededRng} from '../dist/src/domain/rng.js';
import {newSave, rawInventoryRules} from './helpers.mjs';

// The percentage on the Capture button must be what a throw actually achieves.
for (const [name, ctx] of [
  ['legacy supplies', {}],
  ['pack inventory rules', {inventoryRules: rawInventoryRules()}],
]) {
  for (const fraction of [1, 0.5, 0.15]) {
    test(`shown capture chance matches the observed rate at ${Math.round(fraction * 100)}% foe HP (${name})`, () => {
      const trials = 1500;
      let shown = 0;
      let caught = 0;
      for (let i = 0; i < trials; i++) {
        const save = newSave();
        save.orbs = 5;
        const rng = seededRng(i * 7 + 3);
        const battle = createBattle(save, rng, {id: 1, level: 3});
        battle.hp = Math.max(1, Math.round(battle.max * fraction));
        shown += captureChance(save, battle);
        if (resolveTurn(save, battle, {kind: 'catch'}, rng, ctx)?.ended === 'caught') caught++;
      }
      assert.ok(Math.abs(shown / trials - caught / trials) < 0.05, `shown ${(shown / trials).toFixed(3)} vs observed ${(caught / trials).toFixed(3)}`);
      assert.ok(caught > 0, 'a throw can succeed');
    });
  }
}

test('a potion heals the active companion, with and without pack inventory rules', () => {
  for (const ctx of [{}, {inventoryRules: rawInventoryRules()}]) {
    const save = newSave();
    save.team[save.active].hp = 5;
    const before = companion(save).hp;
    const battle = createBattle(save, seededRng(1), {id: 1, level: 1});
    battle.hp = battle.max = 1e6; // the foe's reply cannot hide the heal
    const turn = resolveTurn(save, battle, {kind: 'potion'}, () => 0.5, ctx);
    const heal = turn.events.find(e => e.type === 'potion' || e.type === 'item');
    assert.ok(heal.healed > 0, 'the potion event reports a heal');
    const reply = turn.events.find(e => e.type === 'enemy');
    assert.equal(companion(save).hp, Math.min(maxHP(save, save.active), before + heal.healed) - (reply?.damage ?? 0));
  }
});
