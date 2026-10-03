// Independent adventure saves (#67): the catalog, per-adventure storage keys, relocation of saves a pack build left
// under the first adventure's keys (including interruptions), the chooser's progress peek, and routed backups.
import test from 'node:test';
import assert from 'node:assert/strict';
import {species} from '../dist/src/data/species.js';
import {regions} from '../dist/src/data/regions.js';
import {create, KEYS, keysFor} from '../dist/src/save.js';
import {
  chooseAdventure,
  DEFAULT_CATALOG,
  describeProgress,
  parseCatalog,
  peekProgress,
  readSelection,
  relocateLegacyPacks,
  writeSelection,
} from '../dist/src/services/adventures.js';
import {exportBackup, exportFileName, importSave, parseBackup} from '../dist/src/services/backup.js';
import {restoreCheckpoint} from '../dist/src/services/backup.js';
import {startOver} from '../dist/src/services/profile.js';

const store = (init = {}, hooks = {}) => {
  const m = new Map(Object.entries(init));
  return {
    m,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem(k, v) {
      hooks.beforeSet?.(k, v);
      m.set(k, String(v));
    },
    removeItem(k) {
      hooks.beforeRemove?.(k);
      m.delete(k);
    },
  };
};
const codecFor = pack => create({species, regions, size: 64, pack});
const mine = codecFor('mossvale');
const hearth = codecFor('hearth-hamlet');
const bakery = codecFor('bakery-row');
const withProgress = (codec, coins) => Object.assign(codec.fresh(), {coins, met: true, wins: 2});
const has = (errors, text) =>
  assert.ok(
    errors.some(e => e.includes(text)),
    `expected "${text}" in:\n${errors.join('\n')}`,
  );

test('the catalog validates ids, names and folders', () => {
  const ok = parseCatalog({
    format: 1,
    adventures: [
      {id: 'a-b', name: 'A', path: 'adventures/a-b/'},
      {id: 'c', name: 'C', brief: 'x', path: 'maps/'},
    ],
  });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.adventures.length, 2);
  assert.deepEqual(parseCatalog(DEFAULT_CATALOG).errors, []);
  has(parseCatalog(null).errors, 'must be an object');
  has(parseCatalog({format: 2, adventures: []}).errors, 'format');
  has(parseCatalog({format: 1, adventures: []}).errors, 'non-empty');
  has(parseCatalog({format: 1, adventures: [{id: 'Bad Id', name: 'x', path: 'maps/'}]}).errors, 'id');
  has(parseCatalog({format: 1, adventures: [{id: 'a', name: 'x', path: '../maps/'}]}).errors, 'path');
  has(parseCatalog({format: 1, adventures: [{id: 'a', name: 'x', path: 'https://x/'}]}).errors, 'path');
  has(
    parseCatalog({
      format: 1,
      adventures: [
        {id: 'a', name: 'x', path: 'a/'},
        {id: 'a', name: 'y', path: 'b/'},
      ],
    }).errors,
    'duplicate',
  );
  assert.deepEqual(parseCatalog({format: 1, adventures: [{id: 'a', name: '', path: 'a/'}]}).adventures, [], 'an invalid catalog offers nothing');
});

test('the chosen adventure is the requested one, then the remembered one, then the first; a missing one is explained', () => {
  const list = parseCatalog({
    format: 1,
    adventures: [
      {id: 'mossvale', name: 'Mossvale', path: 'maps/'},
      {id: 'hearth-hamlet', name: 'Hearth Hamlet', path: 'a/'},
    ],
  }).adventures;
  assert.equal(chooseAdventure(list, {}).entry.id, 'mossvale');
  assert.equal(chooseAdventure(list, {stored: 'hearth-hamlet'}).entry.id, 'hearth-hamlet');
  assert.equal(chooseAdventure(list, {requested: 'mossvale', stored: 'hearth-hamlet'}).entry.id, 'mossvale');
  const gone = chooseAdventure(list, {stored: 'removed-pack'});
  assert.equal(gone.entry.id, 'mossvale');
  assert.match(gone.note, /"removed-pack" is not available.*untouched/);
  assert.equal(
    chooseAdventure(list, {requested: 'nope', stored: 'hearth-hamlet'}).entry.id,
    'mossvale',
    'an explicit request beats memory, even when it fails',
  );
  const s = store();
  assert.equal(readSelection(s), null);
  assert.equal(writeSelection(s, 'hearth-hamlet'), true);
  assert.equal(readSelection(s), 'hearth-hamlet');
  s.m.set('mossvale-adventure', 'Not An Id');
  assert.equal(readSelection(s), null);
  const denied = {
    setItem() {
      throw new Error('denied');
    },
  };
  assert.equal(writeSelection(denied, 'a'), false);
});

test('every adventure has its own keys; the first keeps the original names', () => {
  assert.deepEqual(keysFor('mossvale'), KEYS);
  const a = keysFor('hearth-hamlet');
  const b = keysFor('bakery-row');
  const all = [...Object.values(KEYS), ...Object.values(a).filter(Boolean), ...Object.values(b).filter(Boolean)];
  assert.equal(new Set(all).size, all.length, 'no key is shared between adventures');
  for (const key of ['v3', 'backup', 'quarantine', 'archive', 'transaction']) assert.match(a[key], /^mossvale-pack-hearth-hamlet-/);
  assert.equal(a.v2, null, 'older save generations exist only for the first adventure');
  assert.equal(hearth.keys.v3, a.v3);
});

test('two adventures in one browser keep separate progress, checkpoints, archives and journals', () => {
  const s = store();
  const saved = (codec, coins) => s.setItem(codec.keys.v3, codec.serialize(withProgress(codec, coins)));
  saved(mine, 11);
  saved(hearth, 22);
  assert.equal(mine.load(s).save.coins, 11);
  assert.equal(hearth.load(s).save.coins, 22);
  // New game and import in one adventure never touch the other's keys.
  const before = Object.fromEntries([...s.m].filter(([k]) => !k.startsWith('mossvale-pack-hearth')));
  assert.equal(startOver({storage: s, codec: hearth, save: withProgress(hearth, 22)}).ok, true);
  const after = Object.fromEntries([...s.m].filter(([k]) => !k.startsWith('mossvale-pack-hearth')));
  assert.deepEqual(after, before, 'the first adventure was not touched');
  assert.equal(hearth.load(s).save.coins, 0);
  assert.ok(s.m.has(hearth.keys.archive), "the archive is the hearth adventure's own");
  assert.equal(s.m.has(KEYS.archive), false);
  assert.equal(importSave({storage: s, codec: mine, save: mine.load(s).save, incoming: withProgress(mine, 99)}).ok, true);
  assert.equal(hearth.load(s).save.coins, 0, 'importing into one adventure leaves the other alone');
  assert.equal(restoreCheckpoint({storage: s, codec: mine, save: mine.load(s).save}).ok, true);
  assert.equal(bakery.load(s).status, 'new', 'a third adventure starts fresh');
});

test('an interrupted journal belongs to its adventure and is finished by that adventure only', () => {
  const s = store();
  s.setItem(mine.keys.v3, mine.serialize(withProgress(mine, 5)));
  let failures = 0;
  const flaky = store(Object.fromEntries(s.m), {
    beforeSet: k => {
      if (k === hearth.keys.backup && failures++ === 0) throw new Error('quota');
    },
  });
  const result = startOver({storage: flaky, codec: hearth, save: withProgress(hearth, 3)});
  assert.equal(result.ok, true, 'the journal was written, so the operation is committed');
  assert.ok(flaky.m.has(hearth.keys.transaction), 'and left pending for a later load');
  assert.equal(flaky.m.has(KEYS.transaction), false, 'the first adventure has no journal');
  assert.equal(mine.load(flaky).status, 'ok', "the first adventure ignores the other adventure's journal");
  const recovered = hearth.load(flaky);
  assert.equal(recovered.status, 'transaction-recovered');
  assert.equal(flaky.m.has(hearth.keys.transaction), false);
  assert.equal(recovered.save.coins, 0);
});

test('saves a pack build left under the first adventure keys move to their own, safely and only once', () => {
  const legacy = Object.fromEntries([
    [KEYS.v3, hearth.serialize(withProgress(hearth, 40))],
    [KEYS.backup, hearth.serialize(withProgress(hearth, 30))],
    [KEYS.archive, JSON.stringify({at: '2026-10-01T00:00:00Z', raw: hearth.serialize(withProgress(hearth, 10))})],
  ]);
  const s = store(legacy);
  assert.deepEqual(relocateLegacyPacks(s), {moved: ['hearth-hamlet'], blocked: []});
  assert.equal(s.getItem(hearth.keys.backup), legacy[KEYS.backup], 'the checkpoint travels with it');
  assert.equal(s.getItem(hearth.keys.archive), legacy[KEYS.archive]);
  assert.equal(hearth.load(s).save.coins, 40);
  for (const key of [KEYS.v3, KEYS.backup, KEYS.archive]) assert.equal(s.m.has(key), false, `${key} no longer holds another adventure's data`);
  assert.equal(mine.load(s).status, 'new', 'the first adventure is not blocked by it');
  assert.deepEqual(relocateLegacyPacks(s), {moved: [], blocked: []}, 'a second run finds nothing to do');
  assert.equal(hearth.load(s).save.coins, 40);
});

test('relocation keeps the originals until the copy is complete, and resumes after an interruption', () => {
  const raw = hearth.serialize(withProgress(hearth, 40));
  // 1. The journal write itself fails: nothing moved, nothing lost.
  const denied = store(
    {[KEYS.v3]: raw},
    {
      beforeSet: k => {
        if (k === hearth.keys.transaction) throw new Error('quota');
      },
    },
  );
  assert.deepEqual(relocateLegacyPacks(denied), {moved: [], blocked: []});
  assert.equal(denied.getItem(KEYS.v3), raw, 'the original is untouched');
  // 2. A mirror write fails after the journal exists: the original stays, the journal is authoritative.
  let fail = true;
  const interrupted = store(
    {[KEYS.v3]: raw},
    {
      beforeSet: k => {
        if (fail && k === hearth.keys.v3) throw new Error('quota');
      },
    },
  );
  assert.deepEqual(relocateLegacyPacks(interrupted), {moved: [], blocked: []});
  assert.equal(interrupted.getItem(KEYS.v3), raw, 'the original survives the interruption');
  assert.ok(interrupted.m.has(hearth.keys.transaction));
  assert.equal(peekProgress(interrupted, 'hearth-hamlet').state, 'saved', 'the chooser already sees the journaled copy');
  // 3. Next start, storage works: the journal finishes and the move completes.
  fail = false;
  assert.deepEqual(relocateLegacyPacks(interrupted), {moved: ['hearth-hamlet'], blocked: []});
  assert.equal(interrupted.getItem(hearth.keys.v3), raw);
  assert.equal(interrupted.m.has(KEYS.v3), false);
  assert.equal(interrupted.m.has(hearth.keys.transaction), false);
});

test('relocation waits while a first-adventure journal is pending, so the load can finish and report it', () => {
  const raw = hearth.serialize(withProgress(hearth, 40));
  const s = store({[KEYS.v3]: raw, [KEYS.transaction]: JSON.stringify({version: 1, changes: {[KEYS.v3]: raw, [KEYS.backup]: raw}})});
  assert.deepEqual(relocateLegacyPacks(s), {moved: [], blocked: []});
  assert.equal(s.getItem(KEYS.v3), raw);
  assert.ok(s.m.has(KEYS.transaction));
});

test('relocation never overwrites progress that already exists for that adventure', () => {
  const s = store({[KEYS.v3]: hearth.serialize(withProgress(hearth, 40)), [hearth.keys.v3]: hearth.serialize(withProgress(hearth, 77))});
  assert.deepEqual(relocateLegacyPacks(s), {moved: [], blocked: ['hearth-hamlet']});
  assert.equal(hearth.load(s).save.coins, 77);
  assert.ok(s.m.has(KEYS.v3), 'the other copy is kept, not deleted');
});

test("the first adventure's own saves are never relocated", () => {
  const raw = mine.serialize(withProgress(mine, 8));
  const s = store({[KEYS.v3]: raw, [KEYS.backup]: raw});
  assert.deepEqual(relocateLegacyPacks(s), {moved: [], blocked: []});
  assert.equal(s.getItem(KEYS.v3), raw);
});

test('the chooser reads progress without loading the adventure', () => {
  const s = store({[hearth.keys.v3]: hearth.serialize(Object.assign(withProgress(hearth, 1), {playTime: 600, badges: [0]}))});
  const p = peekProgress(s, 'hearth-hamlet');
  assert.deepEqual(p, {state: 'saved', caught: 1, seals: 1, minutes: 10});
  assert.equal(describeProgress(p), '1 friend · 1 seal · 10 min played');
  assert.equal(peekProgress(s, 'bakery-row').state, 'none');
  assert.equal(describeProgress({state: 'none'}), 'Not started');
  s.m.set(hearth.keys.v3, '{broken');
  assert.equal(peekProgress(s, 'hearth-hamlet').state, 'unreadable');
  s.m.set(hearth.keys.v3, mine.serialize(mine.fresh()));
  assert.equal(peekProgress(s, 'hearth-hamlet').state, 'unreadable', "a payload for another adventure is not shown as this one's");
});

test('backups name their adventure and cannot be imported into another', () => {
  assert.match(exportFileName(new Date('2026-10-03T00:00:00Z'), 'hearth-hamlet'), /^mossvale-save-hearth-hamlet-2026-10-03\.json$/);
  assert.equal(exportFileName(new Date('2026-10-03T00:00:00Z')), 'mossvale-save-2026-10-03.json');
  const file = exportBackup(hearth, withProgress(hearth, 5));
  assert.equal(JSON.parse(file).save.pack, 'hearth-hamlet');
  const refused = parseBackup(file, mine, [{id: 'hearth-hamlet', name: 'Hearth Hamlet'}]);
  assert.equal(refused.ok, false);
  assert.equal(refused.pack, 'hearth-hamlet');
  assert.match(refused.reason, /"Hearth Hamlet"\. Switch to it/);
  assert.equal(parseBackup(file, hearth).ok, true);
  assert.equal(parseBackup(exportBackup(mine, withProgress(mine, 5)), hearth).ok, false);
});
