import test from 'node:test';
import assert from 'node:assert/strict';
import {PLAYER_RADIUS} from '../dist/src/config.js';
import {assets, spriteId} from '../dist/src/data/assets.js';
import {
  DIRECTIONS,
  FACING,
  FOLLOWER_FRAME_DISTANCE,
  WALK_FRAME_DISTANCE,
  directionPose,
  facing,
  followerFrame,
  playerSpritePose,
  followerPoint,
  movementFacing,
  movePlayer,
  playerFrame,
  pushTrail,
} from '../dist/src/domain/exploration.js';
import {seededRng} from '../dist/src/domain/rng.js';
import {buildWorld, isWalkable, nearestWalkable} from '../dist/src/domain/world.js';
import {maps} from './helpers.mjs';

const meadow = buildWorld(maps[0]);
const open = {...meadow, map: {...meadow.map, objects: []}, objects: []}; // terrain only, no props
const state = (world, x, y) => ({world, player: {x, y, dir: FACING.south}, pacing: {steps: 0, encounterAt: 1e9, encounterCooldown: 99}, trail: []});
const walk = (st, sx, sy, seconds, fps, run = false) => {
  for (let i = 0; i < seconds * fps; i++) movePlayer(st, sx, sy, run, 1 / fps);
};

test('screen-space input selects each of the eight sprite rows', () => {
  const inputs = [
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
  ];
  assert.deepEqual(
    DIRECTIONS.map((name, i) => [name, i]),
    Object.entries(FACING),
  );
  assert.deepEqual(
    inputs.map(([x, y]) => facing(x, y)),
    [0, 1, 2, 3, 4, 5, 6, 7],
  );
});

test('follower facing is derived from its own world-space path, including diagonals and stationary idle', () => {
  const worldDirections = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
  ];
  const expected = [FACING.north, FACING.northeast, FACING.east, FACING.southeast, FACING.south, FACING.southwest, FACING.west, FACING.northwest, FACING.north];
  assert.deepEqual(
    worldDirections.map(([x, y]) => movementFacing(x, y)),
    expected,
  );
  // Trail samples are only 0.1 world units apart. Small real follower steps must not fall under facing's input dead zone.
  assert.deepEqual(
    worldDirections.map(([x, y]) => movementFacing(x * 0.1, y * 0.1)),
    expected,
  );
  assert.equal(movementFacing(0, 0), null);
});

test('idle and reduced motion hold the idle cell; walking advances by distance and wraps', () => {
  assert.equal(playerFrame(0.4, false), 0);
  assert.equal(playerFrame(0, true), 1);
  assert.equal(playerFrame(WALK_FRAME_DISTANCE, true), 2);
  assert.equal(playerFrame(WALK_FRAME_DISTANCE * 4, true), 1);
  assert.equal(playerFrame(3, true, true), 0);
  assert.equal(followerFrame(WALK_FRAME_DISTANCE - 0.01, true), 1);
  assert.equal(followerFrame(FOLLOWER_FRAME_DISTANCE, true), 2);
  assert.equal(followerFrame(FOLLOWER_FRAME_DISTANCE * 4, true), 1);
  assert.equal(followerFrame(3, true, true), 0);
});

test('changing facing restarts the walk cycle at a readable first step', () => {
  const st = state(open, 19, 15);
  walk(st, 0, 1, 0.2, 60);
  assert.ok(st.player.walkDistance >= WALK_FRAME_DISTANCE);
  assert.equal(playerFrame(st.player.walkDistance, true), 2);
  movePlayer(st, 1, -1, false, 1 / 60);
  assert.equal(st.player.dir, FACING.northeast);
  assert.equal(playerFrame(st.player.walkDistance, true), 1);
});

test('the companion is interpolated at its exact trail gap instead of snapping between trail samples', () => {
  const trail = [
    {x: 9.4, y: 10},
    {x: 9, y: 10},
    {x: 8.6, y: 10},
  ];
  const first = followerPoint(open, {x: 10, y: 10}, trail);
  assert.ok(Math.abs(Math.hypot(10 - first.x, 10 - first.y) - 1) < 1e-9);
  const second = followerPoint(open, {x: 10.05, y: 10}, trail);
  assert.ok(Math.abs(Math.hypot(10.05 - second.x, 10 - second.y) - 1) < 1e-9);
  assert.ok(Math.abs(second.x - first.x - 0.05) < 1e-9, 'a newly interpolated point moves smoothly with the player');
});

test('run reuses the walk loop at a faster travel cadence and stopping resets its phase', () => {
  const walked = state(open, 19, 15);
  const ran = state(open, 19, 15);
  walk(walked, 1, 0, 0.5, 60, false);
  walk(ran, 1, 0, 0.5, 60, true);
  assert.ok(ran.player.walkDistance > walked.player.walkDistance);
  assert.notEqual(playerFrame(ran.player.walkDistance, true), playerFrame(walked.player.walkDistance, true));
  movePlayer(ran, 0, 0, false, 1 / 60);
  assert.equal(ran.player.walkDistance, 0);
});

test('distance walked does not depend on the frame rate', () => {
  const ends = [20, 30, 60, 144].map(fps => {
    const st = state(open, 4, 11);
    walk(st, 1, 1, 1, fps);
    return st.player.x;
  });
  for (const x of ends) assert.ok(Math.abs(x - ends[0]) < 0.06, ends.join(', '));
  assert.ok(ends[0] > 7.5 && ends[0] < 8.5);
});

test('a very long frame cannot tunnel through water', () => {
  const st = state(open, 6, 11.1);
  movePlayer(st, -1, 1, true, 1.0); // a one-second hitch heading straight south into the pond
  assert.ok(st.player.y <= 11.25 + 1e-9, `y=${st.player.y}`);
  assert.equal(isWalkable(open, st.player.x, st.player.y), true);
});

test('all eight directions move at the same speed', () => {
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
  ];
  const speeds = dirs.map(([sx, sy]) => {
    const st = state(open, 19, 15);
    walk(st, sx, sy, 0.5, 60);
    return Math.hypot(st.player.x - 19, st.player.y - 15) / 0.5;
  });
  for (const v of speeds) assert.ok(Math.abs(v - speeds[0]) < 0.05, speeds.join(', '));
});

test('feet stay out of water by the footprint, and walking diagonally into a shore slides along it', () => {
  assert.equal(isWalkable(open, 6, 11.2), true);
  assert.equal(isWalkable(open, 6, 11 + 0.5 - PLAYER_RADIUS + 0.06), false); // corner would touch the pond
  const st = state(open, 2, 14);
  walk(st, 0, 1, 1, 60); // heads south-east: the pond blocks x, the shore lets y keep going
  assert.ok(st.player.x <= 3.25 + 1e-9, `x=${st.player.x}`);
  assert.ok(st.player.y > 15, `slid to y=${st.player.y}`);
});

test('props block with the same footprint', () => {
  const cottage = meadow.objects.find(o => o.kind === 'cottage');
  assert.equal(isWalkable(meadow, cottage.x, cottage.y), false);
  assert.equal(isWalkable(meadow, cottage.x + cottage.solid + PLAYER_RADIUS + 0.01, cottage.y), true);
});

test('a blocked direction projects onto the tangent of a nearby cottage instead of stopping', () => {
  const cottage = meadow.objects.find(o => o.kind === 'cottage');
  const st = state(meadow, 14.3977, 8.4223); // just outside the cottage's east edge
  assert.equal(isWalkable(meadow, st.player.x, st.player.y), true);
  const before = {...st.player};
  movePlayer(st, 0, -1, false, 1 / 60); // screen-up points diagonally into the cottage in world space
  const dx = st.player.x - before.x;
  const dy = st.player.y - before.y;
  assert.ok(Math.hypot(dx, dy) > 0.02, 'keeps moving along the unblocked side of the wall');
  assert.ok(dx > 0 && dy < 0, `follows the cottage tangent (${dx}, ${dy})`);
  assert.ok(isWalkable(meadow, st.player.x, st.player.y), 'the slide keeps the player footprint clear');
  assert.ok(Math.hypot(st.player.x - cottage.x, st.player.y - cottage.y) >= cottage.solid + PLAYER_RADIUS - 1e-6);
});

test('screen diagonals slide around real cottage and tree collisions, and reverse input escapes cleanly', () => {
  const cottage = meadow.objects.find(o => o.kind === 'cottage');
  const tree = meadow.objects.find(o => o.kind === 'scenery' && Math.abs(o.x - 28.3) < 1e-6 && Math.abs(o.y - 30.4) < 1e-6);
  assert.ok(cottage && tree, 'the reproduction points refer to real Meadow props');

  const ends = [20, 30, 60, 144].map(fps => {
    const st = state(meadow, 11.8, 9.1); // south of the cottage, where screen-up-right meets its collision ring
    assert.equal(isWalkable(meadow, st.player.x, st.player.y), true);
    walk(st, 1, -1, 1, fps);
    assert.equal(isWalkable(meadow, st.player.x, st.player.y), true);
    assert.ok(Math.hypot(st.player.x - 11.8, st.player.y - 9.1) > 2, `slides around the cottage at ${fps} fps`);
    assert.ok(Math.hypot(st.player.x - cottage.x, st.player.y - cottage.y) >= cottage.solid + PLAYER_RADIUS - 1e-6);
    return st.player;
  });
  for (const end of ends.slice(1)) assert.ok(Math.hypot(end.x - ends[0].x, end.y - ends[0].y) < 0.12, 'collision travel remains stable across frame rates');

  const reversed = state(meadow, ends[2].x, ends[2].y);
  walk(reversed, -1, 0, 0.25, 60); // screen-left releases the old stuck position without penetrating the cottage
  assert.ok(Math.hypot(reversed.player.x - ends[2].x, reversed.player.y - ends[2].y) > 0.5);
  assert.ok(isWalkable(meadow, reversed.player.x, reversed.player.y));

  const aroundTree = state(meadow, 28.3, 29.3); // screen-up-right approaches an actual oak at [28.3, 30.4]
  walk(aroundTree, 1, -1, 1, 60);
  assert.ok(Math.hypot(aroundTree.player.x - 28.3, aroundTree.player.y - 29.3) > 0.5, 'continues along the tree edge');
  assert.ok(Math.hypot(aroundTree.player.x - tree.x, aroundTree.player.y - tree.y) >= tree.solid + PLAYER_RADIUS - 1e-6);
  assert.ok(isWalkable(meadow, aroundTree.player.x, aroundTree.player.y));
});

test('screen-space sliding preserves a passable narrow gap and does not squeeze through an undersized one', () => {
  const obstacleWorld = objects =>
    buildWorld({
      size: {w: 20, h: 20},
      tiles: [],
      objects,
      zones: [],
      quiet: [],
      spawns: {camp: {x: 5, y: 5}},
      terrainAt: (x, y) => (x < 0 || y < 0 || x >= 20 || y >= 20 ? 'void' : 'ground'),
    });
  const narrow = obstacleWorld([
    {x: 9, y: 10, solid: 0.35, kind: 'scenery'},
    {x: 11, y: 10, solid: 0.35, kind: 'scenery'},
  ]);
  const throughGap = state(narrow, 10, 12);
  walk(throughGap, 1, -1, 1, 60);
  assert.ok(throughGap.player.y < 10, 'the 0.8-tile opening remains traversable with the player footprint');
  assert.ok(isWalkable(narrow, throughGap.player.x, throughGap.player.y));

  const tooNarrow = obstacleWorld([
    {x: 9.6, y: 10, solid: 0.35, kind: 'scenery'},
    {x: 10.4, y: 10, solid: 0.35, kind: 'scenery'},
  ]);
  assert.equal(isWalkable(tooNarrow, 10, 10), false);
  const stopped = state(tooNarrow, 10, 12);
  for (let i = 0; i < 24; i++) {
    movePlayer(stopped, 1, -1, false, 1 / 60);
    assert.ok(isWalkable(tooNarrow, stopped.player.x, stopped.player.y), 'every collision step stays outside solid props');
  }
  assert.ok(stopped.player.y > 10, 'the player cannot pass through the undersized opening');
});

test('the companion walks the path the player walked, so it is never on water or inside a prop', () => {
  for (const map of maps) {
    const world = buildWorld(map);
    const rng = seededRng(7);
    const st = state(world, map.spawns.camp.x, map.spawns.camp.y);
    let dir = [1, 0];
    for (let i = 0; i < 1500; i++) {
      if (i % 40 === 0) dir = [Math.round(rng() * 2 - 1), Math.round(rng() * 2 - 1)];
      movePlayer(st, dir[0], dir[1], rng() > 0.5, 1 / 60);
      pushTrail(st.trail, st.player);
      const f = followerPoint(world, st.player, st.trail);
      assert.equal(isWalkable(world, f.x, f.y), true, `${map.id} step ${i}: follower at ${f.x.toFixed(2)},${f.y.toFixed(2)}`);
    }
  }
});

test('with no history the companion stands on the nearest free ground beside the player', () => {
  const f = followerPoint(meadow, {x: 12, y: 13}, []);
  assert.equal(isWalkable(meadow, f.x, f.y), true);
  assert.ok(Math.hypot(f.x - 12, f.y - 13) < 3.5);
});

test('stuck recovery finds the nearest standing spot', () => {
  const inPond = nearestWalkable(open, 6, 15);
  assert.equal(isWalkable(open, inPond.x, inPond.y), true);
  assert.ok(Math.hypot(inPond.x - 6, inPond.y - 15) < 4);
  assert.deepEqual(nearestWalkable(open, 12, 13), {x: 12, y: 13});
  assert.deepEqual(nearestWalkable(open, -50, -50), meadow.map.spawns.camp); // nowhere nearby: back to camp
});

test('every required route is traversable at footprint size (validation uses the same rule)', () => {
  for (const map of maps) {
    const world = buildWorld(map);
    assert.equal(isWalkable(world, map.spawns.camp.x, map.spawns.camp.y), true);
    for (const o of world.objects.filter(o => ['ranger', 'shrine', 'chest', 'sign', 'gate'].includes(o.kind))) {
      const near = nearestWalkable(world, o.x, o.y, 2);
      assert.ok(Math.hypot(near.x - o.x, near.y - o.y) < 1.95, `${map.id}/${o.ref} has no standing spot in reach`);
    }
  }
});

test('walking up-left draws the up-right pose mirrored; every other direction uses its own row', () => {
  assert.deepEqual(playerSpritePose(FACING.northwest), {row: FACING.northeast, flip: true});
  assert.deepEqual(playerSpritePose(FACING.northeast), {row: FACING.northeast, flip: false});
  for (const name of ['north', 'east', 'southeast', 'south', 'southwest', 'west'])
    assert.deepEqual(playerSpritePose(FACING[name]), {row: FACING[name], flip: false});
  assert.deepEqual(playerSpritePose(undefined), {row: FACING.south, flip: false});
});

test('directionPose reads the sheet row order and draws mirrored directions from their source row (#36/#90)', () => {
  const ember = assets[spriteId('creature-emberkin-follower')].frames;
  assert.deepEqual(directionPose(ember, FACING.south), {row: 0, flip: false});
  assert.deepEqual(directionPose(ember, FACING.southwest), {row: 1, flip: false});
  // Emberkin's own southeast row repeats the southwest pose, so southeast draws the southwest row flipped
  assert.deepEqual(directionPose(ember, FACING.southeast), {row: 1, flip: true});
  assert.deepEqual(directionPose(ember, FACING.west), {row: 6, flip: false});
  assert.deepEqual(directionPose(ember, FACING.northwest), {row: 5, flip: false});
  // sheets without a mirror map or a custom row order fall back to the canonical order
  assert.deepEqual(directionPose(undefined, FACING.west), {row: FACING.west, flip: false});
  assert.deepEqual(directionPose({rowOrder: ['east', 'west']}, FACING.west), {row: 1, flip: false});
});
