import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assets} from '../dist/src/data/assets.js';
import {regions} from '../dist/src/data/regions.js';
import {buildAdventure} from '../dist/src/domain/adventure.js';
import {buildAtlas, exitDirection, routeBetween} from '../dist/src/domain/atlas.js';
import {resolveRegistries} from '../dist/src/domain/registries.js';
import {flagDone, unlocked} from '../dist/src/domain/rules.js';
import {newSave} from './helpers.mjs';

const read = name => JSON.parse(readFileSync(new URL(`../dist/maps/${name}`, import.meta.url), 'utf8'));
const index = read('index.json');
const built = buildAdventure(
  index.maps.map(id => read(`${id}.json`)),
  {assets, ...resolveRegistries(read(index.registries), assets), packId: index.id},
  read(index.objectives),
  read(index.story),
  index,
  index.inventory ? read(index.inventory) : undefined,
);
const maps = index.maps.map(id => built.mapsById[id]);
const regionOf = map => regions.findIndex(region => region.biome === map.biome);
const atlasOf = save => buildAtlas({maps, entryId: index.maps[0], save, regionOf, unlocked, flagDone});

/** A save standing on `at` that has walked `visited` and noticed the listed trail signs (`seen[mapId] = [gate refs]`). */
function saveWith({at = 'meadow', visited = [at], seen = {}, events = [], badges = []}) {
  const save = newSave();
  save.mapId = at;
  save.visitedMaps = visited;
  save.explored = Object.fromEntries(Object.entries(seen).map(([id, refs]) => [id, {cells: null, seen: refs, rev: 0}]));
  save.events = events;
  save.badges = badges;
  return save;
}
const ids = atlas => atlas.nodes.map(node => node.id).sort();
const node = (atlas, id) => atlas.nodes.find(item => item.id === id);

test('a fresh adventure shows only where you stand, and hides that anything else exists beyond a yes/no', () => {
  const atlas = atlasOf(saveWith({}));
  assert.deepEqual(ids(atlas), ['meadow']);
  assert.equal(node(atlas, 'meadow').state, 'current');
  assert.deepEqual(atlas.edges, []);
  assert.equal(atlas.hasUnmapped, true);
  assert.deepEqual(Object.keys(atlas).sort(), ['bounds', 'edges', 'hasUnmapped', 'nodes'], 'no counts or names of hidden places leave the domain');
});

test('a trail sign you have noticed reveals its destination as known, never as visited, and travel stays off', () => {
  const atlas = atlasOf(saveWith({seen: {meadow: ['east']}}));
  assert.deepEqual(ids(atlas), ['meadow', 'orchard-ruins']);
  const orchard = node(atlas, 'orchard-ruins');
  assert.equal(orchard.state, 'known');
  assert.equal(orchard.canTravel, false, 'knowing a place exists does not make it reachable from the atlas');
  assert.equal(atlas.edges.length, 1);
  assert.equal(atlas.edges[0].returns, false, 'only the outbound sign has been noticed');
});

test('a trail you have not noticed reveals nothing, even if it is a normal trail', () => {
  const atlas = atlasOf(saveWith({seen: {meadow: []}}));
  assert.deepEqual(ids(atlas), ['meadow']);
});

test('a place behind an unearned seal is known but locked and says which seal; earning it opens it', () => {
  const base = {at: 'orchard-ruins', visited: ['meadow', 'orchard-ruins'], seen: {meadow: ['east'], 'orchard-ruins': ['back-to-meadow', 'east-to-ridge']}};
  const closed = atlasOf(saveWith(base));
  const amber = node(closed, 'amber-ridge');
  assert.equal(amber.state, 'known');
  assert.equal(amber.locked, true);
  assert.equal(amber.lockedBy, 'meadow.seal');
  const trail = closed.edges.find(edge => edge.id === 'amber-ridge|orchard-ruins');
  assert.deepEqual(
    [trail.from, trail.to, trail.forward, trail.returns],
    ['orchard-ruins', 'amber-ridge', 'meadow.seal', false],
    'one-way sign: the orchard trail to the ridge needs the meadow seal',
  );
  assert.deepEqual(routeBetween(closed, 'orchard-ruins', 'amber-ridge'), [], 'a locked trail is not offered as a route');
  const opened = atlasOf(saveWith({...base, badges: [0]}));
  assert.equal(node(opened, 'amber-ridge').locked, false);
  assert.deepEqual(routeBetween(opened, 'orchard-ruins', 'amber-ridge'), ['orchard-ruins', 'amber-ridge']);
});

test('a concealed route and the place only it reaches stay out until the route is discovered', () => {
  const visited = ['meadow', 'orchard-ruins', 'amber-ridge', 'frostveil-grove', 'reedfen-wetlands'];
  const base = {at: 'reedfen-wetlands', visited, seen: {'reedfen-wetlands': ['shallow-water-cut']}, badges: [0, 1, 2]};
  const hidden = atlasOf(saveWith(base));
  assert.equal(
    hidden.edges.some(edge => edge.concealed),
    false,
  );
  assert.equal(node(hidden, 'stilt-isles'), undefined, 'the island is not on the atlas');
  const found = atlasOf(saveWith({...base, events: ['reedfen-wetlands/route-shallow-water-cut']}));
  assert.ok(found.edges.some(edge => edge.concealed));
  assert.equal(node(found, 'stilt-isles').state, 'known');
});

test('a completed adventure shows every place and every trail exactly as the exits define them', () => {
  const everything = saveWith({
    at: 'stone-basin',
    visited: index.maps,
    seen: Object.fromEntries(maps.map(map => [map.id, map.objects.filter(o => o.kind === 'gate').map(o => o.ref)])),
    badges: [0, 1, 2, 3],
    events: maps.flatMap(map => map.objects.filter(o => o.route).map(o => `${map.id}/route-${o.route.id}`)),
  });
  const atlas = atlasOf(everything);
  assert.deepEqual(ids(atlas), [...index.maps].sort());
  assert.equal(atlas.hasUnmapped, false);
  const pairs = new Map();
  for (const map of maps)
    for (const gate of map.objects.filter(o => o.kind === 'gate')) {
      const pair = [map.id, gate.target].sort().join('|');
      pairs.set(pair, [...(pairs.get(pair) ?? []), `${map.id}>${gate.target}`]);
    }
  assert.deepEqual(atlas.edges.map(edge => edge.id).sort(), [...pairs.keys()].sort(), 'one edge per connected pair');
  for (const edge of atlas.edges)
    assert.equal(edge.returns, new Set(pairs.get(edge.id).map(step => step.split('>')[0])).size === 2, `${edge.id} two-way only when both exits exist`);
  assert.ok(atlas.nodes.every(item => item.state === 'visited' || item.state === 'current'));
  assert.equal(node(atlas, 'stone-basin').state, 'current');
  assert.ok(
    atlas.nodes.every(item => item.canTravel),
    'every opened, visited place can be travelled to',
  );
  assert.deepEqual(routeBetween(atlas, 'stone-basin', 'meadow').at(0), 'stone-basin');
  assert.equal(routeBetween(atlas, 'stone-basin', 'meadow').at(-1), 'meadow');
});

test('layout follows the side each trail leaves from and never stacks two places', () => {
  const everything = saveWith({
    at: 'meadow',
    visited: index.maps,
    seen: Object.fromEntries(maps.map(map => [map.id, map.objects.filter(o => o.kind === 'gate').map(o => o.ref)])),
    badges: [0, 1, 2, 3],
  });
  const atlas = atlasOf(everything);
  const cells = atlas.nodes.map(item => item.at.join(','));
  assert.equal(new Set(cells).size, cells.length);
  const [mx, my] = node(atlas, 'meadow').at;
  assert.deepEqual(node(atlas, 'orchard-ruins').at, [mx + 1, my], 'the meadow trail leaves east, so the orchard lies east');
  assert.deepEqual(atlas, atlasOf(everything), 'the same save always gives the same picture');
  assert.equal(exitDirection({x: 2, y: 28}, {w: 64, h: 56}), 'west');
  assert.equal(exitDirection({x: 32, y: 53}, {w: 64, h: 56}), 'south');
});

test('every place on the atlas was disclosed by a visit or a noticed sign, whatever the save', () => {
  const gateRefs = Object.fromEntries(maps.map(map => [map.id, map.objects.filter(o => o.kind === 'gate').map(o => o.ref)]));
  const sets = [[], ['meadow'], ['meadow', 'orchard-ruins'], ['meadow', 'orchard-ruins', 'amber-ridge', 'stone-basin']];
  for (const visited of sets) {
    for (const noticed of [false, true]) {
      const save = saveWith({at: visited.at(-1) ?? 'meadow', visited: visited.length ? visited : ['meadow'], seen: noticed ? gateRefs : {}});
      const atlas = atlasOf(save);
      const allowed = new Set(save.visitedMaps);
      if (noticed)
        for (const id of save.visitedMaps) for (const gate of built.mapsById[id].objects.filter(o => o.kind === 'gate' && !o.route)) allowed.add(gate.target);
      for (const item of atlas.nodes) assert.ok(allowed.has(item.id), `${item.id} is not disclosed by ${visited} (noticed ${noticed})`);
    }
  }
});
