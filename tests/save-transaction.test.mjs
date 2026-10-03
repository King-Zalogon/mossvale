import test from 'node:test';
import assert from 'node:assert/strict';
import {KEYS} from '../dist/src/save.js';
import {importSave, readCheckpoint} from '../dist/src/services/backup.js';
import {readArchive, restoreArchive, startOver} from '../dist/src/services/profile.js';
import {exportBackup} from '../dist/src/services/backup.js';
import {codec, newSave} from './helpers.mjs';

const played = coins => {
  const save = newSave();
  Object.assign(save, {coins, wins: 2, met: true, playTime: 120, badges: [0]});
  save.caught.push(1);
  save.team[1] = {xp: 0, hp: 40};
  return save;
};

function store(init = {}, {failOnceOn = null, failAlwaysOn = null, failJournal = false, denyReads = false} = {}) {
  const m = new Map(Object.entries(init));
  let failed = false;
  const storage = {
    m,
    getItem(key) {
      if (denyReads) throw new Error('storage denied');
      return m.has(key) ? m.get(key) : null;
    },
    setItem(key, value) {
      if ((failJournal && key === KEYS.transaction) || key === failAlwaysOn || (!failed && key === failOnceOn)) {
        if (key === failOnceOn) failed = true;
        throw new DOMException('quota exceeded', 'QuotaExceededError');
      }
      m.set(key, String(value));
    },
    removeItem(key) {
      m.delete(key);
    },
  };
  return storage;
}

const makeInitial = () => {
  const current = played(40);
  const oldArchive = played(15);
  return {
    current,
    oldArchive,
    data: {
      [KEYS.v3]: codec.serialize(current),
      [KEYS.backup]: codec.serialize(current),
      [KEYS.archive]: JSON.stringify({at: 'before', raw: codec.serialize(oldArchive)}),
    },
  };
};

const cases = [
  {
    name: 'import',
    run: (s, current) => importSave({storage: s, codec, save: current, incoming: played(7)}),
    coins: 7,
    checkpoint: 7,
    archive: 40,
  },
  {
    name: 'new adventure',
    run: (s, current) => startOver({storage: s, codec, save: current}),
    coins: 0,
    checkpoint: 0,
    archive: 40,
  },
  {
    name: 'archive restore',
    run: (s, current) => restoreArchive({storage: s, codec, save: current}),
    coins: 15,
    checkpoint: 15,
    archive: 40,
  },
];

for (const operation of cases) {
  for (const failedKey of [KEYS.archive, KEYS.v3, KEYS.backup]) {
    test(`${operation.name} survives a one-time ${failedKey} write failure and reload`, () => {
      const {current, data} = makeInitial();
      const s = store(data, {failOnceOn: failedKey});

      const result = operation.run(s, current);
      assert.equal(result.ok, true);
      assert.equal(result.recoveryPending, true);
      assert.notEqual(s.getItem(KEYS.transaction), null);

      const loaded = codec.load(s);
      assert.equal(loaded.status, 'transaction-recovered');
      assert.equal(loaded.writable, true);
      assert.equal(loaded.save.coins, operation.coins);
      assert.equal(readCheckpoint(s, codec).coins, operation.checkpoint);
      assert.equal(readArchive(s, codec).save.coins, operation.archive);
      assert.equal(s.getItem(KEYS.transaction), null);
    });
  }
}

test('a persistent quota failure leaves the journal authoritative, read-only and exportable until reload recovery succeeds', () => {
  const {current, data} = makeInitial();
  const s = store(data, {failAlwaysOn: KEYS.backup});

  const result = importSave({storage: s, codec, save: current, incoming: played(7)});
  assert.equal(result.ok, true);
  assert.equal(result.recoveryPending, true);

  const loaded = codec.load(s);
  assert.equal(loaded.status, 'transaction-pending');
  assert.equal(loaded.writable, false);
  assert.equal(loaded.save.coins, 7);
  assert.equal(readCheckpoint(s, codec).coins, 7);
  assert.equal(readArchive(s, codec).save.coins, 40);
  assert.equal(JSON.parse(exportBackup(codec, loaded.save)).save.coins, 7);
  assert.notEqual(s.getItem(KEYS.transaction), null);

  s.setItem = (key, value) => s.m.set(key, String(value));
  const recovered = codec.load(s);
  assert.equal(recovered.status, 'transaction-recovered');
  assert.equal(recovered.writable, true);
  assert.equal(recovered.save.coins, 7);
  assert.equal(s.getItem(KEYS.transaction), null);
});

test('a quota failure before the journal commit leaves all existing saves unchanged', () => {
  const {current, data} = makeInitial();
  const s = store(data, {failJournal: true});
  const original = {...data};

  const result = importSave({storage: s, codec, save: current, incoming: played(7)});
  assert.equal(result.ok, false);
  for (const key of [KEYS.v3, KEYS.backup, KEYS.archive]) assert.equal(s.getItem(key), original[key]);
  assert.equal(s.getItem(KEYS.transaction), null);
});

test('denied storage reads report failure without mutating the current save', () => {
  const {current, data} = makeInitial();
  const backing = store(data);
  const denied = {
    getItem() {
      throw new Error('storage denied');
    },
    setItem: backing.setItem,
    removeItem: backing.removeItem,
  };

  const result = importSave({storage: denied, codec, save: current, incoming: played(7)});
  assert.equal(result.ok, false);
  assert.equal(backing.getItem(KEYS.v3), data[KEYS.v3]);
  assert.equal(codec.load(denied).status, 'unavailable');
});

test('archive restore keeps both adventures recoverable when the archive write remains over quota', () => {
  const {current, data} = makeInitial();
  const s = store(data, {failAlwaysOn: KEYS.archive});

  const result = restoreArchive({storage: s, codec, save: current});
  assert.equal(result.ok, true);
  assert.equal(result.recoveryPending, true);

  const loaded = codec.load(s);
  assert.equal(loaded.status, 'transaction-pending');
  assert.equal(loaded.save.coins, 15);
  assert.equal(readArchive(s, codec).save.coins, 40);
  assert.equal(JSON.parse(exportBackup(codec, loaded.save)).save.coins, 15);
});
