import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWorld} from '../dist/src/domain/world.js';
import {analyzeMapDesign, renderMapSvg} from '../scripts/lib/map-design-report.mjs';

const rows = (...lines) => lines.map(line => line.split(''));
function worldFor(terrain, {solids = [], zones = [], quiet = []} = {}) {
  const size = {w: terrain[0].length, h: terrain.length};
  const kinds = {'.': 'void', g: 'ground', p: 'path', w: 'water', t: 'tallgrass'};
  return buildWorld({
    id: 'fixture',
    size,
    tiles: [],
    objects: solids,
    terrainAt(x, y) {
      return kinds[terrain[y]?.[x] ?? '.'];
    },
    zones,
    quiet,
    spawns: {camp: {x: 1, y: 2}},
  });
}

function fixture(terrain, extra = {}) {
  const world = worldFor(terrain, extra);
  return {world, raw: {id: 'fixture', name: 'Fixture', size: world.map.size, spawns: {camp: [1, 2]}, ...extra.raw}};
}

test('reports a required feature isolated behind blocked terrain', () => {
  const {world, raw} = fixture(rows('...........', '.gggwggggg.', '.gggwggggg.', '.gggwggggg.', '...........'), {
    raw: {landmarks: [{id: 'shrine', kind: 'shrine', at: [8, 2], sprite: 'shrine-crystal-stone'}]},
  });
  const report = analyzeMapDesign(world, raw);
  assert.ok(report.warnings.some(item => item.code === 'unreachable-feature' && item.target === 'landmark:shrine'));
  assert.ok(report.targets.some(item => item.target === 'landmark:shrine' && !item.reachable));
});

test('reports a route with no safe reciprocal return', () => {
  const {world, raw} = fixture(rows('...........', '.ggggggggg.', '.ggggggggg.', '.ggggggggg.', '...........'), {
    raw: {exits: [{id: 'one-way', at: [8, 2], label: 'Far shore', to: {map: 'other', spawn: 'landing'}}]},
  });
  const report = analyzeMapDesign(world, raw, new Map([['other', {id: 'other', exits: []}]]));
  assert.ok(report.warnings.some(item => item.code === 'no-safe-return' && item.target === 'exit:one-way'));
});

test('reports a trigger whose whole activation radius overlaps collision', () => {
  const {world, raw} = fixture(rows('...........', '.ggggggggg.', '.ggggggggg.', '.ggggggggg.', '...........'), {
    solids: [{x: 6, y: 2, solid: 1}],
    raw: {triggers: [{id: 'blocked-trigger', at: [6, 2], radius: 0.25, on: 'interact', do: [{type: 'toast', text: 'Hi'}]}]},
  });
  const report = analyzeMapDesign(world, raw);
  assert.ok(report.warnings.some(item => item.code === 'trigger-in-collision' && item.target === 'trigger:blocked-trigger'));
});

test('reports encounter zones hidden by first-match zone precedence', () => {
  const zones = [
    {id: 'front-zone', terrain: ['tallgrass'], pool: [], level: [1, 1]},
    {id: 'shadowed-zone', terrain: ['tallgrass'], pool: [], level: [1, 1]},
  ];
  const terrain = rows('...........', '.ggggggggg.', '.gtttttttg.', '.ggggggggg.', '...........');
  const {world, raw} = fixture(terrain, {zones, raw: {zones: zones.map(({id}) => ({id, terrain: ['t'], pool: ['fernling'], level: [1, 1]}))}});
  const report = analyzeMapDesign(world, raw);
  assert.ok(report.warnings.some(item => item.code === 'unavailable-encounter-zone' && item.target === 'zone:shadowed-zone'));
});

test('flags a long rewardless spur while identifying a secret spur as intentional', () => {
  const maze = rows(
    '...........',
    '.ggggggggg.',
    '.ggggggggg.',
    '.....g.....',
    '.....g.....',
    '.....g.....',
    '.....g.....',
    '.....g.....',
    '.....g.....',
    '...........',
  );
  const ordinary = fixture(maze);
  const ordinaryReport = analyzeMapDesign(ordinary.world, ordinary.raw);
  assert.ok(ordinaryReport.warnings.some(item => item.code === 'rewardless-branch'));

  const secret = fixture(maze, {raw: {landmarks: [{id: 'hidden-cache', kind: 'chest', at: [5, 8], sprite: 'chest-wooden', secret: true}]}});
  const secretReport = analyzeMapDesign(secret.world, secret.raw);
  assert.ok(secretReport.warnings.some(item => item.code === 'intentional-secret-dead-end'));
  assert.ok(!secretReport.warnings.some(item => item.code === 'rewardless-branch'));
});

test('valid loops retain an alternate route and do not create dead-end failures', () => {
  const {world, raw} = fixture(rows('...........', '.ggggggggg.', '.ggggggggg.', '.ggggggggg.', '.ggggggggg.', '...........'), {
    raw: {
      exits: [{id: 'loop-target', at: [8, 3], label: 'Return', to: {map: 'other', spawn: 'camp'}}],
      landmarks: [{id: 'cache', kind: 'chest', at: [5, 3], sprite: 'chest-wooden'}],
    },
  });
  const other = {id: 'other', exits: [{id: 'back', to: {map: 'fixture', spawn: 'camp'}}]};
  const report = analyzeMapDesign(world, raw, new Map([['other', other]]));
  assert.equal(report.exits[0].result, 'safe');
  assert.ok(report.targets.find(item => item.target === 'exit:loop-target').alternatePath);
  assert.ok(!report.warnings.some(item => ['rewardless-branch', 'no-safe-return'].includes(item.code)));
  const svg = renderMapSvg(report);
  assert.match(svg, /<svg/);
  assert.match(svg, /authored reward/);
  assert.equal(svg, renderMapSvg(analyzeMapDesign(world, raw, new Map([['other', other]]))), 'identical map data yields an identical image');
});
