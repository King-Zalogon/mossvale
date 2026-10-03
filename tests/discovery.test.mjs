// Exploration and navigation (#73): explored cells, discovered landmarks, the compact saved form, and quiet corridors.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  CELL,
  compass,
  decodeEntry,
  discover,
  encodeEntry,
  entryFor,
  exploredShare,
  isKnown,
  isRevealed,
  landmarkLabel,
  MAX_SEEN,
  reveal,
  SECRET_RANGE,
  VISION,
} from '../dist/src/domain/discovery.js';
import {buildWorld, zoneAt} from '../dist/src/domain/world.js';
import {validateMaps} from '../dist/src/domain/mapdata.js';
import {buildAdventure} from '../dist/src/domain/adventure.js';
import {assets} from '../dist/src/data/assets.js';
import {species} from '../dist/src/data/species.js';
import {regions} from '../dist/src/data/regions.js';
import {create} from '../dist/src/save.js';
import {exportBackup, parseBackup} from '../dist/src/services/backup.js';
import {startOver} from '../dist/src/services/profile.js';
import {adventure, codec, maps, newSave, rawMaps} from './helpers.mjs';

const fresh = (w = 25, h = 25) => entryFor({}, 'm', w, h);

test('walking reveals the cells within sight and nothing more', () => {
  const entry = fresh();
  assert.equal(exploredShare(entry, 25, 25), 0);
  const added = reveal(entry, 25, 25, 12, 12);
  assert.ok(added > 0);
  assert.equal(isRevealed(entry, 25, 25, 12, 12), true);
  assert.equal(isRevealed(entry, 25, 25, 12 + VISION - 1, 12), true, 'within sight');
  assert.equal(isRevealed(entry, 25, 25, 0, 0), false, 'far corner stays dark');
  assert.equal(reveal(entry, 25, 25, 12, 12), 0, 'revealing again changes nothing');
  assert.ok(exploredShare(entry, 25, 25) > 0 && exploredShare(entry, 25, 25) < 1);
  assert.equal(isRevealed(entry, 25, 25, -3, 4), false);
  assert.equal(isRevealed(entry, 25, 25, 99, 4), false);
});

test('the corners and edges of any size of map work, including sizes that are not a multiple of the cell', () => {
  for (const [w, h] of [
    [4, 4],
    [7, 13],
    [25, 25],
    [128, 128],
  ]) {
    const entry = fresh(w, h);
    reveal(entry, w, h, w - 0.5, h - 0.5);
    reveal(entry, w, h, 0, 0);
    assert.equal(isRevealed(entry, w, h, w - 1, h - 1), true);
    assert.equal(isRevealed(entry, w, h, 0, 0), true);
  }
});

test('landmarks are found when close; secrets only when very close; found ones stay found', () => {
  const entry = fresh();
  const objects = [
    {ref: 'shrine', x: 14, y: 12},
    {ref: 'nest', x: 20, y: 12, secret: true},
    {x: 12, y: 12}, // a prop: no ref, never a landmark
  ];
  assert.deepEqual(
    discover(entry, objects, 12, 12).map(o => o.ref),
    ['shrine'],
  );
  assert.equal(isKnown(entry, objects[1]), false, 'a secret is hidden from the maps');
  assert.deepEqual(discover(entry, objects, 12 + 5, 12), [], 'five tiles is too far for a secret');
  assert.deepEqual(
    discover(entry, objects, 20 - SECRET_RANGE + 0.1, 12).map(o => o.ref),
    ['nest'],
  );
  assert.equal(isKnown(entry, objects[1]), true);
  assert.deepEqual(discover(entry, objects, 14, 12), [], 'nothing is found twice');
  const many = fresh();
  discover(
    many,
    Array.from({length: MAX_SEEN + 20}, (_, i) => ({ref: `p-${i}`, x: 1, y: 1})),
    1,
    1,
  );
  assert.equal(many.seen.length, MAX_SEEN, 'the record is bounded');
});

test('the saved form is compact, round-trips, and shrugs off damage', () => {
  const entry = fresh(128, 128);
  assert.equal(encodeEntry(entry), null, 'nothing explored: nothing saved');
  reveal(entry, 128, 128, 64, 64, 40);
  discover(entry, [{ref: 'a', x: 64, y: 64}], 64, 64);
  const saved = encodeEntry(entry);
  assert.ok(saved.c.length <= 256, `a 128x128 map needs at most 256 hex characters (${saved.c.length})`);
  const back = entryFor({m: decodeEntry(saved, {w: 128, h: 128})}, 'm', 128, 128);
  assert.deepEqual([...back.cells], [...entry.cells]);
  assert.deepEqual(back.seen, ['a']);
  assert.equal(decodeEntry(null, null), null);
  assert.equal(decodeEntry([], null), null);
  const damaged = decodeEntry({c: 'zz', d: ['ok-id', 'Bad Id', 7]}, {w: 25, h: 25});
  assert.equal(exploredShare(damaged, 25, 25), 0, 'a damaged mask is ignored');
  assert.deepEqual(damaged.seen, ['ok-id']);
  const wrongSize = decodeEntry({c: saved.c, d: []}, {w: 25, h: 25});
  assert.equal(exploredShare(wrongSize, 25, 25), 0, 'a mask for a different map size is dropped');
  // dimensions unknown at load time: kept as is, decoded once the map is known
  const pending = decodeEntry(saved, null);
  assert.equal(encodeEntry(pending).c, saved.c);
  const explored = {m: pending};
  assert.equal(isRevealed(entryFor(explored, 'm', 128, 128), 128, 128, 64, 64), true);
});

test('exploration lives in the save, stays out of it when empty, and is validated against each map', () => {
  const bounds = Object.fromEntries(maps.map(m => [m.id, {w: m.size.w, h: m.size.h}]));
  const c = create({species, regions, size: 128, bounds});
  const save = c.fresh();
  assert.equal('explored' in JSON.parse(c.serialize(save)), false, 'an unexplored save is byte-identical to before');
  const entry = entryFor(save.explored, 'meadow', 25, 25);
  reveal(entry, 25, 25, 12, 12);
  discover(entry, [{ref: 'shrine', x: 12, y: 5}], 12, 8);
  const raw = JSON.parse(c.serialize(save));
  assert.deepEqual(Object.keys(raw.explored), ['meadow']);
  const loaded = c.normalize(raw, false);
  assert.deepEqual(encodeEntry(loaded.explored.meadow), encodeEntry(entry));
  // wrong mask size for the map, unknown map, bad id, and a flood of maps
  raw.explored.meadow.c = raw.explored.meadow.c.slice(2);
  assert.equal(exploredShare(c.normalize(raw, false).explored.meadow, 25, 25), 0);
  raw.explored = {'not a map': {c: '', d: []}, ghost: {c: '00', d: ['x']}};
  assert.deepEqual(c.normalize(raw, false).explored, {}, 'unknown maps and bad ids are dropped');
  raw.explored = Object.fromEntries(Array.from({length: 100}, (_, i) => [`map-${i}`, {c: '', d: ['a']}]));
  assert.ok(Object.keys(c.normalize(raw, false).explored).length <= 32);
  assert.deepEqual(codec.normalize({...raw, explored: 'junk'}, false).explored, {});
});

test('exploration travels with backups and is cleared by a new game, never stored with the settings', () => {
  const bounds = Object.fromEntries(maps.map(m => [m.id, {w: m.size.w, h: m.size.h}]));
  const c = create({species, regions, size: 128, bounds});
  const save = c.fresh();
  Object.assign(save, {met: true, wins: 1, coins: 5});
  reveal(entryFor(save.explored, 'meadow', 25, 25), 25, 25, 12, 12);
  const file = exportBackup(c, save);
  assert.ok(JSON.parse(file).save.explored.meadow, 'the export carries it');
  const parsed = parseBackup(file, c);
  assert.equal(parsed.ok, true);
  assert.ok(parsed.save.explored.meadow.cells.some(b => b !== 0));
  const store = new Map();
  const storage = {getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k)};
  storage.setItem(c.keys.v3, c.serialize(save));
  assert.equal(startOver({storage, codec: c, save}).ok, true);
  assert.deepEqual(c.load(storage).save.explored, {}, 'a new game starts unexplored');
  assert.ok(JSON.parse(JSON.parse(storage.getItem(c.keys.archive)).raw).explored, 'and the archive keeps the old exploration');
  assert.equal(
    [...store.keys()].some(k => k.includes('settings')),
    false,
    'nothing about the world goes into preferences',
  );
});

test('maps name their places and point the way', () => {
  assert.equal(landmarkLabel({kind: 'ranger', name: 'Ranger Iris'}), 'Ranger Iris');
  assert.equal(landmarkLabel({kind: 'sign', mapLabel: 'Old stone', name: 'x'}), 'Old stone');
  assert.equal(landmarkLabel({kind: 'gate'}, 'Ridge'), 'Trail to Ridge');
  assert.equal(landmarkLabel({kind: 'shrine'}), 'Shrine');
  assert.equal(compass(0.5, 0.5), 'here');
  // in the isometric view, +x runs down-right and +y down-left
  assert.equal(compass(5, 5), 'south');
  assert.equal(compass(-5, -5), 'north');
  assert.equal(compass(5, -5), 'east');
  assert.equal(compass(-5, 5), 'west');
  assert.equal(compass(6, 0), 'south-east');
  assert.equal(compass(0, -6), 'north-east');
  assert.equal(CELL, 4);
});

test('quiet corridors suppress wild encounters; secrets and quiet areas are validated', () => {
  const read = name => JSON.parse(readFileSync(new URL(`./fixtures/packs/hearth/${name}`, import.meta.url), 'utf8'));
  const hearth = read('hearth-yard.json');
  const names = new Set(assets.map(a => a.name));
  const speciesIds = new Set(species.map(s => s.id));
  assert.deepEqual(validateMaps([hearth], {spriteNames: names, speciesIds}), []);
  const build = tweak => {
    const copy = structuredClone(hearth);
    tweak(copy);
    return validateMaps([copy], {spriteNames: names, speciesIds}).join('\n');
  };
  assert.match(
    build(m => (m.quiet[0].rect = [3, 3, 2, 2])),
    /quiet\[0\] \(tea-path\)\.rect/,
  );
  assert.match(
    build(m => (m.quiet[0].rect = [0, 0, 99, 99])),
    /quiet\[0\] \(tea-path\)\.rect/,
  );
  assert.match(
    build(m => m.quiet.push({...m.quiet[0]})),
    /duplicate quiet area id/,
  );
  assert.match(
    build(m => (m.quiet[0].label = 'x'.repeat(40))),
    /quiet\[0\].*label/,
  );
  assert.match(
    build(m => (m.landmarks.at(-1).secret = 'yes')),
    /secret/,
  );
  assert.match(
    build(m => (m.landmarks.at(-1).mapLabel = '')),
    /mapLabel/,
  );
  const compile = quiet => {
    const copy = structuredClone(hearth);
    copy.quiet = quiet;
    const regionsFor = [{id: copy.id}];
    const own = species.filter(entry => ['fernling', 'emberkin'].includes(entry.id)); // the fixture's creatures
    const built = buildAdventure([copy], {assets, species: own, regions: regionsFor, packId: 'hearth-hamlet'}, undefined, undefined, undefined);
    assert.deepEqual(built.errors, []);
    return buildWorld(built.maps[0]);
  };
  const quiet = compile([{id: 'tea-path', rect: [3.5, 1.5, 5.5, 2.5]}]);
  const open = compile([]);
  assert.ok(zoneAt(open, 4, 2), 'the tall grass has encounters');
  assert.equal(zoneAt(quiet, 4, 2), null, 'inside the quiet corridor it does not');
  assert.ok(quiet.map.quiet.length === 1 && open.map.quiet.length === 0);
  assert.ok(adventure.maps.every(m => Array.isArray(m.quiet)));
  assert.ok(newSave().explored && rawMaps().length);
});
