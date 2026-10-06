import test from 'node:test';
import assert from 'node:assert/strict';
import {CAPS, REST_FLOOR, REWARDS, SHOP} from '../dist/src/data/economy.js';
import {buy, canBuy, claimChest, grant, restAtCamp} from '../dist/src/domain/economy.js';
import {createBattle, resolveCapture, resolveTurn, resolveWin, throwOrb, usePotion} from '../dist/src/domain/battle.js';
import {seededRng} from '../dist/src/domain/rng.js';
import {codec, maps, mapsById, newSave} from './helpers.mjs';

const chest = maps[0].objects.find(o => o.kind === 'chest');

test('a purchase is all or nothing', () => {
  const save = newSave();
  save.coins = 9;
  const before = JSON.stringify(save);
  assert.deepEqual(buy(save, 'potion').reason, 'coins');
  assert.equal(JSON.stringify(save), before);
  assert.equal(buy(save, 'nope').reason, 'unknown');
  save.coins = 10;
  assert.equal(buy(save, 'potion').ok, true);
  assert.deepEqual([save.coins, save.potions], [0, 4]);
  assert.equal(buy(save, 'potion').ok, false); // cannot buy twice with one payment
  assert.equal(save.potions, 4);
});

test('bag limits: nothing is lost on purchase, rewards stop at the cap', () => {
  const save = newSave();
  save.coins = 100;
  save.orbs = CAPS.orbs - 2;
  assert.equal(buy(save, 'orbs').reason, 'full');
  assert.equal(save.coins, 100); // the coins are kept
  assert.equal(
    canBuy(
      save,
      SHOP.find(o => o.id === 'orbs'),
    ),
    false,
  );
  assert.deepEqual(grant(save, {orbs: 10, coins: 5}), {coins: 5, potions: 0, orbs: 2});
  assert.equal(save.orbs, CAPS.orbs);
  assert.deepEqual(grant(save, {coins: -5, potions: NaN, orbs: 1.9}), {coins: 0, potions: 0, orbs: 0});
});

test('resting is free, heals, tops supplies up to the floor and never takes anything away', () => {
  const broke = newSave();
  Object.assign(broke, {orbs: 0, potions: 0, coins: 0});
  broke.team[0].hp = 1;
  restAtCamp(broke);
  assert.deepEqual([broke.orbs, broke.potions, broke.coins], [REST_FLOOR.orbs, REST_FLOOR.potions, 0]);
  assert.ok(broke.team[0].hp > 1);
  const rich = newSave();
  Object.assign(rich, {orbs: 40, potions: 9, coins: 500});
  restAtCamp(rich);
  assert.deepEqual([rich.orbs, rich.potions, rich.coins], [40, 9, 500]);
});

test('spending everything cannot make the adventure unwinnable: rest restores a way to capture and fight', () => {
  const save = newSave();
  Object.assign(save, {orbs: 0, potions: 0, coins: 0});
  const battle = createBattle(save, seededRng(1), {id: 3, level: 6});
  assert.equal(throwOrb(save, battle), false); // no orbs: cannot capture...
  assert.equal(usePotion(save), null); // ...or heal
  restAtCamp(save); // ...but the ranger is free
  assert.equal(throwOrb(save, battle), true);
  const packSave = newSave();
  packSave.inventory = {bag: {orb: packSave.orbs}};
  const packRules = {supplies: {orbs: 'orb'}};
  assert.equal(throwOrb(packSave, createBattle(packSave, seededRng(3), {id: 3, level: 6}), packRules), true);
  assert.deepEqual([packSave.orbs, packSave.inventory.bag.orb], [11, 11]);
  battle.hp = 1;
  assert.equal(resolveTurn(save, createBattle(save, seededRng(2), {id: 3, level: 6}), {kind: 'attack'}, seededRng(2)) !== null, true);
});

test('chests pay once', () => {
  const save = newSave();
  const first = claimChest(save, chest);
  assert.deepEqual(first, chest.reward);
  const after = JSON.stringify(save);
  assert.equal(claimChest(save, chest), null);
  assert.equal(JSON.stringify(save), after);
  const full = newSave();
  full.coins = CAPS.coins;
  assert.equal(claimChest(full, chest).coins, 0); // opened, not wasted twice: the chest counts as opened
  assert.equal(claimChest(full, chest), null);
});

test('battle payouts come from the reward table and persist once', () => {
  const [lo, hi] = REWARDS.wild.coins;
  const save = newSave();
  for (let i = 0; i < 40; i++) {
    const b = createBattle(save, seededRng(i), {id: 1, level: 6});
    b.hp = 0;
    const before = save.coins;
    const w = resolveWin(save, b, seededRng(i));
    assert.ok(w.reward >= lo && w.reward <= hi);
    assert.equal(save.coins - before, w.reward);
    assert.equal(w.xp, REWARDS.wild.xp);
  }
  const c = resolveCapture(save, createBattle(save, seededRng(1), {id: 4, level: 6}));
  assert.deepEqual([c.coins, c.xp], [REWARDS.capture.coins, REWARDS.capture.xp]);
});

test('rewards are tuned so coins are a luxury, not a requirement', () => {
  const [lo, hi] = REWARDS.wild.coins;
  const potion = SHOP.find(o => o.id === 'potion');
  const winsPerPotion = potion.price / ((lo + hi) / 2);
  assert.ok(winsPerPotion >= 0.5 && winsPerPotion <= 2, `a potion costs ${winsPerPotion.toFixed(1)} wild wins`); // affordable, not free
  assert.ok(REST_FLOOR.orbs >= 8, 'enough orbs for several attempts after a rest');
});

test('saved supplies are bounded', () => {
  const raw = JSON.parse(codec.serialize(newSave()));
  const save = codec.normalize({...raw, orbs: 1e9, potions: 500, coins: 1e12}, false);
  assert.deepEqual([save.orbs, save.potions, save.coins], [0, 198, CAPS.coins]);
  assert.ok(save.orbs + save.potions <= 198, 'pack supplies stay within the data-defined carry capacity');
});

test('side-map chests persist independently and cannot pay again after reload', () => {
  let save = newSave();
  for (const id of ['frostveil-pass', 'stone-basin', 'stilt-isles']) {
    const landmark = mapsById[id].objects.find(o => o.kind === 'chest');
    const before = save.coins;
    assert.ok(claimChest(save, landmark));
    assert.ok(save.coins > before);
    save = codec.normalize(JSON.parse(codec.serialize(save)), false);
    assert.equal(claimChest(save, landmark), null, `${id} does not pay twice`);
  }
  assert.equal(save.mapFlags.length, 3);
  assert.ok(claimChest(save, chest), 'side caches do not consume the meadow chest');
});
