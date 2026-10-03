import test from 'node:test';
import assert from 'node:assert/strict';
import {PLAYER_RADIUS} from '../dist/src/config.js';
import {assets, spriteId} from '../dist/src/data/assets.js';
import {
  DIRECTIONS,
  FACING,
  WALK_FRAME_DISTANCE,
  directionPose,
  facing,
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
  assert.deepEqual(
    [
      movementFacing(-1, -1),
      movementFacing(0, -1),
      movementFacing(1, -1),
      movementFacing(1, 0),
      movementFacing(1, 1),
      movementFacing(0, 1),
      movementFacing(-1, 1),
      movementFacing(-1, 0),
      movementFacing(-1, -1),
    ],
    [FACING.north, FACING.northeast, FACING.east, FACING.southeast, FACING.south, FACING.southwest, FACING.west, FACING.northwest, FACING.north],
  );
  assert.equal(movementFacing(0, 0), null);
});

test('idle and reduced motion hold the idle cell; walking advances by distance and wraps', () => {
  assert.equal(playerFrame(0.4, false), 0);
  assert.equal(playerFrame(0, true), 1);
  assert.equal(playerFrame(WALK_FRAME_DISTANCE, true), 2);
  assert.equal(playerFrame(WALK_FRAME_DISTANCE * 4, true), 1);
  assert.equal(playerFrame(3, true, true), 0);
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
  // sheets without a mirror map or a custom row order fall back to the canonical order
  assert.deepEqual(directionPose(undefined, FACING.west), {row: FACING.west, flip: false});
  assert.deepEqual(directionPose({rowOrder: ['east', 'west']}, FACING.west), {row: 1, flip: false});
});
