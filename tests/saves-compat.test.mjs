// Frozen saves from earlier builds. A change that stops these loading (or changes what they mean) breaks players'
// progress after an update, so this test fails first. Add a new fixture whenever the save schema gains fields.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {KEYS} from '../dist/src/save.js';
import {level} from '../dist/src/domain/rules.js';
import {codec} from './helpers.mjs';

const fixture = name => readFileSync(new URL(`./fixtures/saves/${name}.json`, import.meta.url), 'utf8').trim();
const load = (key, raw) => {
  const m = new Map([[key, raw]]);
  return codec.load({getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v))});
};

test('v1 fixture: seen, caught, orbs, wins and XP survive', () => {
  const r = load(KEYS.v1, fixture('v1'));
  assert.equal(r.status, 'migrated');
  assert.deepEqual([r.save.seen, r.save.caught, r.save.orbs, r.save.wins, r.save.met], [[0, 1, 2], [0, 1], 5, 4, true]);
  assert.equal(r.save.team[0].xp, 56);
});

test('v2 fixture: progress, inventory, team records and region survive', () => {
  const r = load(KEYS.v2, fixture('v2'));
  assert.equal(r.status, 'migrated');
  const s = r.save;
  assert.deepEqual([s.region, s.active, s.orbs, s.potions, s.coins, s.badges, s.chests, s.caught, s.wins], [1, 1, 7, 2, 50, [0], [0], [0, 1, 4], 6]);
  assert.deepEqual([level(s, 0), level(s, 1), level(s, 4)], [7, 5, 5]);
  assert.deepEqual(s.party, [1, 0, 4]); // saves from before teams: companion first, then the first captures
});

test('v3 (October 2026) fixture loads unchanged and re-saves identically', () => {
  const raw = fixture('v3-2026-10');
  const r = load(KEYS.v3, raw);
  assert.equal(r.status, 'ok');
  assert.equal(codec.serialize(r.save), raw);
  assert.deepEqual([r.save.party, r.save.goal, r.save.badges, r.save.playTime], [[3, 0, 1], 'amber-seal', [0], 2400]);
});
