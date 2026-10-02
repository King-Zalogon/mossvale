import test from 'node:test';
import assert from 'node:assert/strict';
import {KEYS} from '../dist/src/save.js';
import {
  BACKUP_KIND,
  exportBackup,
  exportFileName,
  importSave,
  MAX_BACKUP_BYTES,
  parseBackup,
  readCheckpoint,
  restoreCheckpoint,
} from '../dist/src/services/backup.js';
import {readArchive} from '../dist/src/services/profile.js';
import {codec, newSave} from './helpers.mjs';

const store = (init = {}) => {
  const m = new Map(Object.entries(init));
  return {m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v))};
};
const played = () => {
  const save = newSave();
  Object.assign(save, {coins: 40, wins: 3, badges: [0], met: true, playTime: 900, completed: false});
  save.caught.push(1);
  save.seen.push(1);
  save.party.push(1);
  save.team[1] = {xp: 45, hp: 40};
  return save;
};

test('export then parse round-trips a save exactly', () => {
  const save = played();
  const text = exportBackup(codec, save, {short: 'abcdef0'}, new Date('2026-10-02T10:00:00Z'));
  const data = JSON.parse(text);
  assert.deepEqual([data.kind, data.exportedAt, data.build], [BACKUP_KIND, '2026-10-02T10:00:00.000Z', 'abcdef0']);
  const back = parseBackup(text, codec);
  assert.equal(back.ok, true);
  assert.equal(codec.serialize(back.save), codec.serialize(save));
  assert.equal(exportFileName(new Date('2026-10-02T10:00:00Z')), 'mossvale-save-2026-10-02.json');
});

test('a bare save payload and a v2 payload are accepted too', () => {
  assert.equal(parseBackup(codec.serialize(played()), codec).ok, true);
  const v2 = JSON.stringify({version: 2, caught: [0, 1], team: {0: {xp: 0, hp: 40}, 1: {xp: 90, hp: 30}}, badges: [0], coins: 12});
  const r = parseBackup(v2, codec);
  assert.deepEqual([r.ok, r.save.caught, r.save.coins], [true, [0, 1], 12]);
});

test('invalid, huge, wrong or future files are refused with a plain reason and no side effects', () => {
  const bad = [
    ['not json {', /not valid JSON/],
    ['[]', /does not look like/],
    ['"hello"', /does not look like/],
    ['{}', /does not look like/],
    [JSON.stringify({kind: BACKUP_KIND, save: 'x'}), /does not look like/],
    [JSON.stringify({version: 99}), /newer version/],
    [JSON.stringify({kind: BACKUP_KIND, save: {version: 99}}), /newer version/],
    [JSON.stringify({version: 1}), /not supported/],
    ['x'.repeat(MAX_BACKUP_BYTES + 1), /too large/],
  ];
  for (const [text, reason] of bad) {
    const r = parseBackup(text, codec);
    assert.equal(r.ok, false, text.slice(0, 30));
    assert.match(r.reason, reason);
  }
  assert.equal(parseBackup(undefined, codec).ok, false);
});

test('hostile content is sanitized like any other save', () => {
  const raw = JSON.parse(codec.serialize(played()));
  const r = parseBackup(JSON.stringify({...raw, coins: 1e99, orbs: -5, party: ['dragon'], team: {fernling: 7}, battle: {id: 'x'}}), codec);
  assert.equal(r.ok, true);
  assert.deepEqual([r.save.coins, r.save.orbs, r.save.battle], [9999, 0, null]);
  assert.ok(r.save.party.includes(r.save.active));
});

test('importing archives the current adventure first, then replaces it and the checkpoint', () => {
  const current = played();
  const incoming = newSave();
  incoming.coins = 7;
  incoming.met = true;
  const s = store({[KEYS.v3]: codec.serialize(current)});
  assert.equal(importSave({storage: s, codec, save: current, incoming}).ok, true);
  assert.equal(codec.load(s).save.coins, 7);
  assert.equal(readArchive(s, codec).save.badges.length, 1); // nothing lost
  assert.equal(readCheckpoint(s, codec).coins, 7);
});

test('a failed import changes nothing', () => {
  const current = played();
  const raw = codec.serialize(current);
  const s = store({[KEYS.v3]: raw});
  s.setItem = () => {
    throw new Error('quota');
  };
  assert.equal(importSave({storage: s, codec, save: current, incoming: newSave()}).ok, false);
  assert.equal(s.m.get(KEYS.v3), raw);
});

test('the session checkpoint can be restored, and a missing or corrupt one cannot', () => {
  const earlier = played();
  const later = played();
  later.coins = 500;
  const s = store({[KEYS.v3]: codec.serialize(later), [KEYS.backup]: codec.serialize(earlier)});
  assert.equal(readCheckpoint(s, codec).coins, 40);
  assert.equal(restoreCheckpoint({storage: s, codec, save: later}).ok, true);
  assert.equal(codec.load(s).save.coins, 40);
  assert.equal(readArchive(s, codec).save.coins, 500); // the newer progress is kept as the backup
  assert.equal(restoreCheckpoint({storage: store(), codec, save: later}).ok, false);
  assert.equal(readCheckpoint(store({[KEYS.backup]: '{oops'}), codec), null);
});
