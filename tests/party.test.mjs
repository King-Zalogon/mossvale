import test from 'node:test';
import assert from 'node:assert/strict';
import {PARTY_SIZE} from '../dist/src/config.js';
import {createBattle, ensureHealthyCompanion, resolveCapture, resolveFaint, resolveTurn} from '../dist/src/domain/battle.js';
import {addToParty, healTeam, healthyParty, inParty, maxHP, removeFromParty, reserve, setActive} from '../dist/src/domain/rules.js';
import {seededRng} from '../dist/src/domain/rng.js';
import {codec, newSave} from './helpers.mjs';

/** A save that owns the given species and puts the first `team` of them on the team. */
function own(ids, team = ids.length) {
  const save = newSave();
  for (const id of ids) {
    if (!save.caught.includes(id)) save.caught.push(id);
    save.team[id] = {xp: 0, hp: 0};
    save.team[id].hp = maxHP(save, id);
  }
  save.party = ids.slice(0, team);
  return save;
}

test('a new game starts with a one-member team', () => {
  const save = newSave();
  assert.deepEqual([save.party, reserve(save)], [[0], []]);
});

test('captures join the team until it is full, then wait in the reserve', () => {
  const save = newSave();
  const joined = [];
  for (const id of [1, 2, 3, 4]) joined.push(resolveCapture(save, createBattle(save, seededRng(1), {id, level: 6})).joined);
  assert.deepEqual(joined, ['team', 'team', 'reserve', 'reserve']);
  assert.equal(save.party.length, PARTY_SIZE);
  assert.deepEqual(reserve(save), [3, 4]);
  assert.equal(save.caught.length, 5); // nothing is lost
  assert.equal(resolveCapture(save, createBattle(save, seededRng(1), {id: 4, level: 6})).joined, null); // duplicate species
});

test('choosing a reserve creature swaps it in for the current companion when the team is full', () => {
  const save = own([0, 1, 2, 3], 3);
  assert.equal(setActive(save, 3), true);
  assert.deepEqual([save.active, save.party.includes(3), save.party.includes(0), reserve(save)], [3, true, false, [0]]);
  assert.equal(setActive(save, 5), false); // not owned
  const roomy = own([0, 1, 2], 2);
  setActive(roomy, 2);
  assert.deepEqual(roomy.party, [0, 1, 2]);
});

test('team editing: add, remove, and the rules that keep a team usable', () => {
  const save = own([0, 1, 2, 3], 2);
  assert.equal(addToParty(save, 2), true);
  assert.equal(addToParty(save, 3), false); // full
  assert.equal(addToParty(save, 2), false); // already on the team
  assert.equal(removeFromParty(save, save.active), false); // the companion stays
  assert.equal(removeFromParty(save, 1), true);
  assert.equal(inParty(save, 1), false);
  const solo = own([0, 1], 1);
  assert.equal(removeFromParty(solo, 0), false); // never an empty team
});

test('battle switching and faint replacement only use the team', () => {
  const save = own([0, 1, 2], 2); // 2 is in the reserve
  const battle = createBattle(save, seededRng(1), {id: 5, level: 6});
  assert.equal(
    resolveTurn(save, battle, {kind: 'switch', id: 2}, () => 0.5),
    null,
  );
  assert.notEqual(
    resolveTurn(save, battle, {kind: 'switch', id: 1}, () => 0.5),
    null,
  );
  save.team[save.active].hp = 0;
  const faint = resolveFaint(save);
  assert.equal(faint.status, 'switched');
  assert.ok(save.party.includes(faint.replacement));
});

test('every team can recover: all fainted means a loss that heals, even with healthy reserve', () => {
  const save = own([0, 1, 2], 2);
  save.team[0].hp = 0;
  save.team[1].hp = 0;
  assert.equal(ensureHealthyCompanion(save), false);
  assert.deepEqual(healthyParty(save), []);
  const battle = createBattle(save, seededRng(1), {id: 5, level: 6});
  save.team[save.active].hp = 1;
  const turn = resolveTurn(save, battle, {kind: 'guard'}, () => 0.99);
  assert.equal(turn.ended, 'loss');
  assert.equal(save.team[0].hp, maxHP(save, 0));
  healTeam(save);
});

test('an active companion that fainted is replaced by a healthy teammate before a fight', () => {
  const save = own([0, 1, 2], 3);
  save.team[0].hp = 0;
  assert.equal(ensureHealthyCompanion(save), true);
  assert.equal(save.active, 1);
});

test('team round-trips through the save and old saves get a sensible default', () => {
  const save = own([0, 1, 2, 3], 3);
  save.active = 1;
  const back = codec.normalize(JSON.parse(codec.serialize(save)), false);
  assert.deepEqual([back.party, back.active], [[0, 1, 2], 1]);
  // A save from before teams existed: active + first captures, capped at the team size.
  const raw = JSON.parse(codec.serialize(save));
  delete raw.party;
  assert.deepEqual(codec.normalize(raw, false).party, [1, 0, 2]);
  const v2 = codec.normalize({version: 2, active: 3, caught: [0, 1, 2, 3, 4], team: {}}, true);
  assert.deepEqual(v2.party, [3, 0, 1]);
  assert.equal(v2.caught.length, 5);
});

test('invalid teams are repaired: unknown, duplicate, oversized, missing the companion', () => {
  const raw = JSON.parse(codec.serialize(own([0, 1, 2, 3], 3)));
  const fix = party => codec.normalize({...raw, active: 'pebblit', caught: [...raw.caught, 'pebblit'], party}, false);
  for (const party of [['dragon', 'dragon'], ['fernling', 'fernling', 'fernling'], ['fernling', 'emberkin', 'brooklet', 'duskwing'], 'nope', []]) {
    const save = fix(party);
    assert.ok(save.party.length >= 1 && save.party.length <= PARTY_SIZE, JSON.stringify(party));
    assert.ok(save.party.includes(save.active), JSON.stringify(party));
    assert.equal(new Set(save.party).size, save.party.length);
    assert.ok(save.party.every(i => save.caught.includes(i)));
  }
});
