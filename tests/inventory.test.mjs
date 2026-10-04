// Optional item/loot/stash rules (#99): two packs with different tables share the same transactions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buyInventory,
  claimInventory,
  commitInventory,
  createInventory,
  deposit,
  gatherInventory,
  inventoryToSupplies,
  rollDrop,
  sellInventory,
  suppliesToInventory,
  useInventory,
  validateInventoryRules,
  withdraw,
} from '../dist/src/domain/inventory.js';
import {seededRng} from '../dist/src/domain/rng.js';
import {createPersistence} from '../dist/src/services/persistence.js';
import {codec, newSave, rawInventoryRules} from './helpers.mjs';

// A pack that keeps Mossvale's potion/orb supplies, small caps and a 40% potion.
const meadow = {
  carryCap: 12,
  storageCap: 6,
  supplies: {potions: 'potion', orbs: 'orb'},
  items: {
    potion: {name: 'Potion', kind: 'usable', price: 10, effect: {type: 'heal-percent', percent: 40}},
    orb: {name: 'Orb', kind: 'usable', price: 3},
    amulet: {name: 'Amulet', kind: 'key', price: 0},
  },
  drops: {
    'wild-win': [
      {item: 'orb', weight: 3, min: 1, max: 2},
      {item: 'potion', weight: 1, min: 1, max: 1},
    ],
  },
};
// A different pack: gathering, valuables, a stash and bigger caps, with no potions at all.
const lantern = {
  carryCap: 30,
  storageCap: 60,
  items: {
    herb: {name: 'Herb', kind: 'usable', price: 2, effect: {type: 'heal-percent', percent: 25}},
    shard: {name: 'Glass shard', kind: 'valuable', price: 0, sellPrice: 7},
  },
  drops: {thicket: [{item: 'herb', weight: 1, min: 2, max: 4}]},
};

test('two packs validate with different item tables, caps and optional features', () => {
  assert.deepEqual(validateInventoryRules(meadow), []);
  assert.deepEqual(validateInventoryRules(lantern), []);
  const bad = structuredClone(lantern);
  bad.items.herb.effect.percent = 0;
  bad.items.shard.sellPrice = -1;
  bad.drops.thicket[0].item = 'gold';
  bad.drops.empty = [];
  bad.supplies = {gems: 'herb'};
  const errors = validateInventoryRules(bad);
  for (const text of ['effect.percent', 'sellPrice', 'unknown item "gold"', 'drops.empty', 'supplies.gems'])
    assert.ok(
      errors.some(e => e.includes(text)),
      text,
    );
});

test('buying, using and healing are all-or-nothing', () => {
  const state = createInventory();
  state.coins = 25;
  assert.deepEqual(buyInventory(state, 'potion', 2, meadow), {ok: true, item: 'potion', quantity: 2, cost: 20});
  assert.deepEqual([state.coins, state.bag.potion], [5, 2]);
  const before = structuredClone(state);
  for (const [item, quantity, reason] of [
    ['potion', 1, 'coins'],
    ['amulet', 1, 'not-for-sale'],
    ['gold', 1, 'unknown'],
    ['orb', 0, 'quantity'],
  ])
    assert.equal(buyInventory(state, item, quantity, meadow).reason, reason);
  assert.deepEqual(state, before, 'refused purchases cost nothing');
  state.coins = 1000;
  assert.equal(buyInventory(state, 'orb', 11, meadow).reason, 'full', 'twelve is the carry cap');
  assert.equal(state.coins, 1000);
  // a potion heals 40% of max HP, is not spent at full health, and never overheals
  assert.deepEqual(useInventory(state, 'potion', {hp: 10, maxHp: 50}, meadow), {ok: true, item: 'potion', healed: 20, hp: 30});
  assert.equal(state.bag.potion, 1);
  assert.equal(useInventory(state, 'potion', {hp: 50, maxHp: 50}, meadow).reason, 'full-health');
  assert.equal(state.bag.potion, 1);
  assert.equal(useInventory(state, 'potion', {hp: 45, maxHp: 50}, meadow).healed, 5);
  assert.equal(useInventory(state, 'potion', {hp: 1, maxHp: 50}, meadow).reason, 'missing');
  assert.equal(useInventory(state, 'orb', {hp: 1, maxHp: 50}, meadow).reason, 'no-effect');
});

test('gathering and drop tables are deterministic and refuse overflow as a whole', () => {
  const state = createInventory();
  const a = rollDrop(lantern, 'thicket', seededRng(5));
  assert.deepEqual(a, rollDrop(lantern, 'thicket', seededRng(5)));
  assert.ok(a.item === 'herb' && a.quantity >= 2 && a.quantity <= 4);
  assert.equal(rollDrop(lantern, 'nowhere', seededRng(1)), null);
  assert.equal(gatherInventory(state, [a], lantern).ok, true);
  const before = structuredClone(state);
  assert.equal(
    gatherInventory(
      state,
      [
        {item: 'herb', quantity: 29},
        {item: 'shard', quantity: 1},
      ],
      lantern,
    ).reason,
    'full',
  );
  assert.equal(
    gatherInventory(
      state,
      [
        {item: 'herb', quantity: 1},
        {item: 'gold', quantity: 1},
      ],
      lantern,
    ).reason,
    'unknown',
  );
  assert.deepEqual(state, before);
  // both outcomes of a weighted table are reachable
  const seen = new Set();
  for (let seed = 1; seed < 60; seed++) seen.add(rollDrop(meadow, 'wild-win', seededRng(seed)).item);
  assert.deepEqual([...seen].sort(), ['orb', 'potion']);
});

test('selling pays coins for valuables only, and the stash obeys its own cap', () => {
  const state = createInventory();
  gatherInventory(
    state,
    [
      {item: 'shard', quantity: 3},
      {item: 'herb', quantity: 2},
    ],
    lantern,
  );
  assert.deepEqual(sellInventory(state, 'shard', 2, lantern), {ok: true, item: 'shard', quantity: 2, coins: 14});
  assert.equal(sellInventory(state, 'herb', 1, lantern).reason, 'not-for-sale');
  assert.equal(deposit(state, 'herb', 2, lantern).ok, true);
  assert.deepEqual([state.bag.herb, state.storage.herb], [undefined, 2]);
  assert.equal(withdraw(state, 'herb', 3, lantern).reason, 'missing');
  assert.equal(withdraw(state, 'herb', 2, lantern).ok, true);
  const small = {...meadow, storageCap: 1};
  const tiny = createInventory();
  tiny.bag = {orb: 2};
  assert.equal(deposit(tiny, 'orb', 2, small).reason, 'full');
  assert.deepEqual(tiny.bag, {orb: 2});
});

test('capture and defeat rewards are separate one-time claims; storage-full pays nothing', () => {
  const state = createInventory();
  const grants = [{item: 'orb', quantity: 2}];
  assert.equal(claimInventory(state, 'capture:fernling', grants, meadow, 10).ok, true);
  assert.equal(claimInventory(state, 'capture:fernling', grants, meadow, 10).reason, 'claimed');
  assert.equal(claimInventory(state, 'defeat:fernling', grants, meadow, 12).ok, true);
  assert.deepEqual([state.bag.orb, state.coins], [4, 22]);
  state.bag.orb = 12;
  const before = structuredClone(state);
  assert.equal(claimInventory(state, 'defeat:emberkin', grants, meadow, 12).reason, 'full');
  assert.deepEqual(state, before, 'a full bag neither pays nor marks the reward as claimed');
});

test('a failed write leaves the inventory untouched, and a good write commits', () => {
  const state = createInventory();
  state.coins = 40;
  const writes = [];
  const buy = draft => buyInventory(draft, 'potion', 2, meadow);
  assert.equal(commitInventory(state, buy, () => false).reason, 'persist');
  assert.equal(
    commitInventory(state, buy, () => {
      throw new Error('quota');
    }).reason,
    'persist',
  );
  assert.deepEqual([state.coins, state.bag], [40, {}]);
  assert.equal(commitInventory(state, buy, draft => writes.push(structuredClone(draft))).ok, true);
  assert.deepEqual([state.coins, state.bag.potion], [20, 2]);
  assert.deepEqual(writes[0].bag, {potion: 2}, 'the persisted copy is the committed one');
  assert.equal(
    commitInventory(
      state,
      d => buyInventory(d, 'potion', 99, meadow),
      () => assert.fail('no write for a refused action'),
    ).reason,
    'coins',
  );
});

test('existing saves keep their supplies when a pack adopts items', () => {
  const save = {version: 4, coins: 33, potions: 3, orbs: 12, region: 1};
  const state = suppliesToInventory(save, meadow);
  assert.deepEqual([state.coins, state.bag], [33, {potion: 3, orb: 12}]);
  assert.deepEqual(inventoryToSupplies(state, save, meadow), save, 'an unchanged inventory round-trips the save');
  useInventory(state, 'potion', {hp: 1, maxHp: 50}, meadow);
  const next = inventoryToSupplies(state, save, meadow);
  assert.deepEqual([next.potions, next.orbs, next.coins, next.region], [2, 12, 33, 1]);
  assert.deepEqual(suppliesToInventory({coins: 5}, lantern).bag, {}, 'a pack without supply mapping starts with an empty bag');
});

test('every persistence write syncs legacy battle supplies into the pack bag', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
  const game = {save: newSave(), player: {x: 4, y: 6}, battle: null};
  game.save.potions--;
  game.save.orbs--;
  game.save.coins = 25;
  const persist = createPersistence({storage, codec, game, writable: true, inventoryRules: rawInventoryRules(), onStatus() {}});
  assert.equal(persist(), true);
  const raw = JSON.parse(values.get(codec.keys.v3));
  assert.deepEqual([raw.potions, raw.orbs, raw.coins], [2, 11, 25]);
  assert.deepEqual(raw.inventory.bag, {potion: 2, orb: 11});
  assert.equal(raw.inventory.coins, 25);
});
