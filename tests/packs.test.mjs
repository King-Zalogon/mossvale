// Adventure packs (#50): the first adventure is data on shared systems; two tiny fixture scenes reuse the same art
// with different roles; broken references and mismatched pack/save ids are refused. Guide: docs/PACKS.md
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assets} from '../dist/src/data/assets.js';
import {species} from '../dist/src/data/species.js';
import {PACK_ID} from '../dist/src/data/pack.js';
import {buildAdventure} from '../dist/src/domain/adventure.js';
import {validatePack} from '../dist/src/domain/pack.js';
import {create, KEYS, packOf} from '../dist/src/save.js';
import {parseBackup} from '../dist/src/services/backup.js';
import {content, newSave, packContent, rawMaps, rawObjectives, rawPack, rawStory} from './helpers.mjs';

const has = (errors, text) =>
  assert.ok(
    errors.some(e => e.includes(text)),
    `expected "${text}" in:\n${errors.join('\n')}`,
  );
const fixture = name => {
  const dir = new URL(`./fixtures/packs/${name}/`, import.meta.url);
  const read = f => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
  const pack = read('index.json');
  return {pack, maps: pack.maps.map(id => read(id + '.json')), regions: pack.maps.map(id => ({id}))};
};
const buildFixture = (name, tweak) => {
  const f = fixture(name);
  tweak?.(f);
  return buildAdventure(f.maps, {assets, species, regions: f.regions, packId: f.pack.id}, undefined, undefined, f.pack);
};
const store = (init = {}) => {
  const m = new Map(Object.entries(init));
  return {m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v))};
};
const build = tweak => {
  const pack = rawPack();
  const maps = rawMaps();
  tweak?.({pack, maps});
  return buildAdventure(maps, packContent, rawObjectives(), rawStory(), pack).errors;
};

test('the first adventure is a pack: its id, creatures and milestones come from data', () => {
  const pack = rawPack();
  assert.equal(pack.id, PACK_ID);
  assert.deepEqual(build(), []);
  assert.deepEqual(pack.species.toSorted(), species.map(s => s.id).toSorted());
  assert.deepEqual(pack.milestones, ['meadow.seal', 'amber-ridge.seal', 'frostveil-grove.seal']);
});

test('two fixture scenes give the same art and mechanics different roles', () => {
  const a = buildFixture('hearth');
  const b = buildFixture('bakery');
  assert.deepEqual(a.errors, []);
  assert.deepEqual(b.errors, []);
  const objs = built => Object.fromEntries(built.maps[0].objects.filter(o => o.ref).map(o => [o.ref, o]));
  const [x, y] = [objs(a), objs(b)];
  // The same assets (indexes into the one shared manifest) and the same drawn size...
  for (const ref of ['building', 'villager', 'box']) {
    assert.equal(x[ref].id, y[ref].id, `${ref} uses the same artwork`);
    assert.equal(x[ref].w, y[ref].w);
  }
  assert.equal(assets[x.building.id].name, 'cottage-tiled');
  assert.equal(assets[x.villager.id].name, 'person-red-cap-south');
  // ...with different roles and text.
  assert.equal(x.building.kind, 'ranger');
  assert.equal(y.building.kind, 'sign');
  assert.equal(x.villager.kind, 'sign');
  assert.equal(y.villager.kind, 'ranger');
  assert.equal(x.building.name, 'Healer Wren');
  assert.equal(y.villager.name, 'Baker Pim');
  assert.notEqual(x.villager.text, y.building.text);
  // Neither fixture needed new artwork or a copy of the game systems: every sprite is already in the shared manifest.
  const names = new Set(assets.map(s => s.name));
  for (const f of [fixture('hearth'), fixture('bakery')]) for (const l of f.maps[0].landmarks) assert.ok(names.has(l.sprite));
});

test('a pack may use only the creatures it lists', () => {
  has(buildFixture('hearth', f => (f.pack.species = ['fernling']), true).errors, 'zone "patch" uses "emberkin", which the pack does not list');
  has(buildFixture('hearth', f => f.pack.species.push('pebblit')).errors, '"pebblit" has no encounter zone in any map');
  has(buildFixture('hearth', f => f.pack.species.push('nope')).errors, 'unknown species "nope"');
  has(
    build(({pack}) => (pack.species = pack.species.filter(id => id !== 'pebblit'))),
    'uses "pebblit", which the pack does not list',
  );
});

test('broken pack references fail validation', () => {
  has(buildFixture('hearth', f => (f.pack.maps = ['hearth-yard', 'ghost-town'])).errors, '"ghost-town" is listed but no such map was loaded');
  has(buildFixture('hearth', f => (f.pack.maps = ['x-yard'])).errors, 'map "hearth-yard" is loaded but not listed in the pack');
  has(buildFixture('hearth', f => (f.pack.milestones = ['hearth-yard.seal'])).errors, '"hearth-yard.seal" cannot be earned');
  has(buildFixture('hearth', f => (f.pack.milestones = ['Bad Flag'])).errors, 'milestones');
  has(buildFixture('hearth', f => delete f.pack.brief).errors, 'pack brief');
  has(buildFixture('hearth', f => (f.pack.id = 'Hearth Hamlet')).errors, 'pack id');
  has(buildFixture('hearth', f => (f.pack.ending = 'story')).errors, 'pack ending');
  has(validatePack(null, {speciesIds: new Set()}), 'index.json must be an object');
});

test('a pack made for another adventure is refused by this game', () => {
  const f = fixture('hearth');
  const errors = buildAdventure(f.maps, {...content, regions: f.regions, packId: PACK_ID}, undefined, undefined, f.pack).errors;
  has(errors, `is not the adventure this game's content and saves are built for ("${PACK_ID}")`);
});

test('milestones must be listed in an order that can be played', () => {
  has(
    build(({pack}) => (pack.milestones = ['amber-ridge.seal', 'meadow.seal', 'frostveil-grove.seal'])),
    '"amber-ridge.seal" cannot be earned yet when the milestones before it (none) are done',
  );
});

test('saves record the pack: the first adventure stays byte-identical, others carry their id', () => {
  const first = create({species, regions: content.regions, size: 64, pack: PACK_ID});
  const other = create({species, regions: content.regions, size: 64, pack: 'hearth-hamlet'});
  assert.equal(JSON.parse(first.serialize(first.fresh())).pack, undefined);
  assert.equal(JSON.parse(other.serialize(other.fresh())).pack, 'hearth-hamlet');
  assert.equal(packOf({version: 3}), PACK_ID, 'saves from before packs belong to the first adventure');
});

test('a save from another adventure is never loaded, overwritten or imported', () => {
  const first = create({species, regions: content.regions, size: 64, pack: PACK_ID});
  const other = create({species, regions: content.regions, size: 64, pack: 'hearth-hamlet'});
  const mineRaw = first.serialize(Object.assign(first.fresh(), {coins: 77}));
  const theirsRaw = other.serialize(Object.assign(other.fresh(), {coins: 12}));

  const s1 = store({[KEYS.v3]: theirsRaw});
  const r1 = first.load(s1);
  assert.equal(r1.status, 'foreign');
  assert.equal(r1.writable, false);
  assert.match(r1.message, /another adventure \("hearth-hamlet"\)/);
  assert.equal(s1.getItem(KEYS.v3), theirsRaw, 'left untouched');
  assert.equal(s1.m.has(KEYS.quarantine), false, 'and not treated as damage');

  const s2 = store({[KEYS.v3]: mineRaw});
  const r2 = other.load(s2);
  assert.equal(r2.status, 'foreign', 'a first-adventure save is foreign to another pack');
  assert.equal(s2.getItem(KEYS.v3), mineRaw);

  assert.equal(first.load(store({[KEYS.v3]: mineRaw})).status, 'ok');
  const imported = parseBackup(theirsRaw, first);
  assert.equal(imported.ok, false);
  assert.match(imported.reason, /another adventure/);
  assert.equal(parseBackup(mineRaw, first).ok, true);
  assert.ok(newSave());
});
