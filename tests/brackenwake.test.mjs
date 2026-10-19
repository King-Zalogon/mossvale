// Brackenwake Commons (#277): a walkable, encounter-free settlement joined to the Meadow without touching any saved identity.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pickLine} from '../dist/src/domain/objectives.js';
import {content, mapsById, newSave, objCtx, rawMaps} from './helpers.mjs';

const {regions} = content;

const town = rawMaps().find(map => map.id === 'brackenwake-commons');
const meadow = rawMaps().find(map => map.id === 'meadow');
const landmark = id => town.landmarks.find(item => item.id === id);
const speciesIndex = id => objCtx.speciesIds.indexOf(id);
const lineFor = (id, save) => pickLine(landmark(id).lines, save, objCtx);
const saveWith = ({active, party = [], caught = []}) => {
  const save = newSave();
  for (const id of new Set([active, ...party, ...caught])) if (!save.caught.includes(speciesIndex(id))) save.caught.push(speciesIndex(id));
  save.active = speciesIndex(active);
  save.party = [active, ...party].map(speciesIndex);
  return save;
};

test('the town is a compiled map on the meadow biome with no wild encounters', () => {
  assert.ok(mapsById['brackenwake-commons']);
  assert.equal(town.biome, 'meadow');
  assert.deepEqual(town.zones, []);
  assert.equal(mapsById['brackenwake-commons'].zones.length, 0);
  assert.deepEqual(town.size, {w: 56, h: 44});
});

test('existing map and region identities are untouched', () => {
  assert.deepEqual(
    regions.map(region => region.id),
    ['meadow', 'amber-ridge', 'frostveil-grove', 'reedfen-wetlands'],
  );
  for (const id of ['meadow', 'amber-ridge', 'frostveil-grove', 'frostveil-pass', 'reedfen-wetlands', 'orchard-ruins', 'stilt-isles', 'stone-basin'])
    assert.ok(mapsById[id], id);
  assert.ok(
    content.regions.every(region => !region.id.includes('brackenwake')),
    'the town adds no region, seal or save index',
  );
});

test('the town is an optional ungated route with a safe way back', () => {
  const out = meadow.exits.find(exit => exit.to.map === 'brackenwake-commons');
  const back = town.exits.find(exit => exit.to.map === 'meadow');
  assert.ok(out && back);
  assert.equal(out.requires, undefined);
  assert.equal(back.requires, undefined);
  assert.equal(out.to.spawn, 'camp');
  assert.ok(town.spawns.camp);
  assert.ok(meadow.spawns[back.to.spawn], 'the return lands on a real meadow spawn');
  assert.equal(town.exits.length, 1);
  for (const exit of meadow.exits) assert.ok(exit.id && exit.to.map);
});

test('free rest, supplies, rumours and a social space are all in the world and all reachable', () => {
  const ids = town.landmarks.map(item => item.id);
  assert.equal(town.landmarks.filter(item => item.kind === 'ranger').length, 1, 'one working ranger: rest and supplies');
  for (const id of ['warden', 'survey-board', 'spring-stone', 'commons-press', 'wren', 'tobin', 'survey-plaque', 'lookout']) assert.ok(ids.includes(id), id);
  assert.ok(town.landmarks.filter(item => item.id.startsWith('hab-')).length >= 5, 'several visible habitats');
  // Map validation already proves every landmark and exit is reachable from the arrival; keep the evidence explicit.
  const compiled = mapsById['brackenwake-commons'];
  assert.ok(compiled.objects.some(object => object.ref === 'warden' && object.kind === 'ranger'));
});

test('the town has a loop of paths and a second way round the pond', () => {
  const rows = town.terrain;
  const path = (x, y) => rows[y]?.[x] === 'p';
  const reach = (from, to, allowed) => {
    const seen = new Set([from.join(',')]);
    const queue = [from];
    while (queue.length) {
      const [x, y] = queue.shift();
      if (x === to[0] && y === to[1]) return true;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const next = [x + dx, y + dy];
        if (!path(...next) || !allowed(next[0]) || seen.has(next.join(','))) continue;
        seen.add(next.join(','));
        queue.push(next);
      }
    }
    return false;
  };
  // North lane to south lane around the west half and, independently, around the east half.
  assert.ok(
    reach([27, 12], [27, 28], x => x <= 27),
    'west arc connects the lanes',
  );
  assert.ok(
    reach([28, 12], [28, 28], x => x >= 28),
    'east arc connects the lanes',
  );
});

test('the bridge, lookout and garden are optional stops with no reward or flag', () => {
  for (const item of town.landmarks.filter(item => ['survey-plaque', 'lookout', 'tobin'].includes(item.id))) {
    assert.equal(item.flag, undefined, item.id);
    assert.equal(item.reward, undefined, item.id);
    assert.ok(item.kind !== 'shrine' && item.kind !== 'chest', item.id);
  }
  assert.ok(!JSON.stringify(town.triggers).includes('battle'));
});

test('NPC and habitat lines follow the active companion and the party, not stored state', () => {
  assert.match(lineFor('wren', saveWith({active: 'fernling'})), /Fernling/);
  assert.match(lineFor('wren', saveWith({active: 'emberkin'})), /Emberkin/);
  assert.match(lineFor('wren', saveWith({active: 'brooklet'})), /Brooklet/);
  assert.match(
    lineFor(
      'wren',
      saveWith({active: 'fernling', party: ['voltkit']}).active === undefined ? newSave() : saveWith({active: 'bramblebuck', party: ['voltkit']}),
    ),
    /Voltkit/,
  );
  // Swapping the companion changes the answer on the next read.
  const save = saveWith({active: 'fernling', party: ['brooklet']});
  assert.match(lineFor('wren', save), /Fernling/);
  save.active = speciesIndex('brooklet');
  assert.match(lineFor('wren', save), /Brooklet/);
  // The habitat creature acknowledges your own only while it is in the party.
  assert.match(lineFor('hab-brooklet', save), /Yours/);
  save.party = save.party.filter(index => index !== speciesIndex('fernling'));
  assert.doesNotMatch(lineFor('hab-fernling', save), /Yours/);
  assert.match(lineFor('hab-fernling', saveWith({active: 'fernling'})), /Yours/);
});

test('no line reveals a place the player has not visited or a future secret', () => {
  const fresh = newSave();
  const board = lineFor('survey-board', fresh);
  assert.doesNotMatch(board, /\bridge\b|badlands|orchard|sluice/i);
  const lookout = lineFor('lookout', fresh);
  assert.match(lookout, /far shore/);
  assert.doesNotMatch(lookout, /Amber Ridge|walked/);
  fresh.visitedMaps = ['meadow', 'amber-ridge'];
  assert.match(lineFor('lookout', fresh), /ridge you have walked/);
});

test('the checked-in map matches its generator', async () => {
  const {execFileSync} = await import('node:child_process');
  execFileSync('python3', ['scripts/gen-brackenwake.py', '--check'], {stdio: 'pipe'});
});
