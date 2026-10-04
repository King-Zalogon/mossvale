/* Pure movement and encounter pacing. */
import {FOLLOW_GAP, MOVE_STEP} from '../config.js';
import {isWalkable, nearestWalkable, zoneAt} from './world.js';

export const WALK_SPEED = 2.8;
export const RUN_SPEED = 4.7;

/** Row indices in the red-cap animation atlas. */
export const DIRECTIONS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
export const FACING = Object.freeze(Object.fromEntries(DIRECTIONS.map((name, index) => [name, index])));
export const WALK_FRAME_DISTANCE = 0.42;

/** Sprite-sheet column for the current animation state; running advances faster through its greater travel. */
export function playerFrame(distance, moving, reducedMotion = false) {
  if (!moving || reducedMotion) return 0;
  return 1 + (Math.floor(Math.max(0, distance) / WALK_FRAME_DISTANCE) % 4);
}

/**
 * Atlas row and mirroring for the player sprite. The atlas's northwest row repeats the northeast pose (bill to the right),
 * so up-left walking draws the northeast row mirrored instead.
 */
export function playerSpritePose(dir) {
  const row = Number.isInteger(dir) ? dir : FACING.south;
  return row === FACING.northwest ? {row: FACING.northeast, flip: true} : {row, flip: false};
}

/**
 * Atlas row and mirroring for a direction of a multi-direction sheet. `frames.mirror` maps a direction whose own row repeats
 * another's pose to that other direction; it is drawn from the other row, flipped.
 */
export function directionPose(frames, dir) {
  const name = DIRECTIONS[dir] ?? 'south';
  const source = frames?.mirror?.[name];
  const order = frames?.rowOrder ?? DIRECTIONS;
  return source ? {row: order.indexOf(source), flip: true} : {row: order.indexOf(name), flip: false};
}

/** Sprite direction from the creature's own movement in world space (the inverse of movePlayer's screen mapping). */
export function movementFacing(dx, dy) {
  if (Math.hypot(dx, dy) < 1e-6) return null;
  const screenX = dx - dy;
  const screenY = dx + dy;
  // Trail samples are sub-unit; normalize before facing() applies its input dead zone.
  const length = Math.hypot(screenX, screenY);
  return facing(screenX / length, screenY / length);
}

/** Row in the animation atlas for screen-space input (-1..1 on each axis). */
export function facing(sx, sy) {
  const x = Math.abs(sx) > 0.3 ? Math.sign(sx) : 0;
  const y = Math.abs(sy) > 0.3 ? Math.sign(sy) : 0;
  if (x > 0) return y < 0 ? FACING.northeast : y > 0 ? FACING.southeast : FACING.east;
  if (x < 0) return y < 0 ? FACING.northwest : y > 0 ? FACING.southwest : FACING.west;
  return y < 0 ? FACING.north : FACING.south;
}

/**
 * Moves the player by screen-space input (sx, sy in -1..1) and updates step counting. Long frames are split into
 * MOVE_STEP slices, so the distance walked and the collision result do not depend on the frame rate.
 * `pacing` = {steps, encounterAt, encounterCooldown}. Returns the encounter zone when a wild encounter should start.
 */
export function movePlayer(state, sx, sy, run, dt) {
  if (!sx && !sy) {
    state.player.walkDistance = 0;
    return null;
  }
  const slices = Math.max(1, Math.ceil(dt / MOVE_STEP));
  for (let i = 0; i < slices; i++) {
    const zone = moveSlice(state, sx, sy, run, dt / slices);
    if (zone) return zone;
  }
  return null;
}

function moveSlice(state, sx, sy, run, dt) {
  const {world, player, pacing} = state;
  const magnitude = Math.hypot(sx, sy);
  const v = (run ? RUN_SPEED : WALK_SPEED) * dt;
  const before = {x: player.x, y: player.y};
  // Keep the conventional world-axis slide, but also try screen-axis decomposition. A screen diagonal can collapse
  // to one world axis after isometric conversion, so world-only resolution has no spare component beside a prop wall.
  const horizontal = [(sx / magnitude) * v, (-sx / magnitude) * v];
  const vertical = [(sy / magnitude) * v, (sy / magnitude) * v];
  const worldX = [horizontal[0] + vertical[0], 0];
  const worldY = [0, horizontal[1] + vertical[1]];
  const target = {x: player.x + horizontal[0] + vertical[0], y: player.y + horizontal[1] + vertical[1]};
  const resolve = components => {
    const candidate = {...before};
    for (const [dx, dy] of components) {
      const x = candidate.x + dx;
      const y = candidate.y + dy;
      if (isWalkable(world, x, y)) {
        candidate.x = x;
        candidate.y = y;
      }
    }
    return candidate;
  };
  const candidates = [resolve([worldX, worldY]), resolve([worldY, worldX]), resolve([horizontal, vertical]), resolve([vertical, horizontal])];
  const error = candidate => Math.hypot(target.x - candidate.x, target.y - candidate.y);
  const resolved = candidates.reduce((best, candidate) => (error(candidate) < error(best) - 1e-9 ? candidate : best));
  player.x = resolved.x;
  player.y = resolved.y;
  player.dir = facing(sx, sy);
  const distance = Math.hypot(player.x - before.x, player.y - before.y);
  if (distance > 0) {
    player.walkDistance = (player.walkDistance || 0) + distance;
    pushTrail(state.trail, player);
  }
  const zone = zoneAt(world, Math.round(player.x), Math.round(player.y));
  if (zone) {
    pacing.steps += distance;
    if (pacing.encounterCooldown <= 0 && pacing.steps >= pacing.encounterAt) {
      pacing.steps = 0;
      return zone;
    }
  } else pacing.steps = Math.max(0, pacing.steps - distance * 0.4);
  return null;
}

const TRAIL_SPACING = 0.1;
const TRAIL_LENGTH = 40;

/** Records the player's path (at TRAIL_SPACING intervals) so the companion can walk it. */
export function pushTrail(trail, player) {
  if (!trail) return;
  const last = trail[0];
  if (!last || Math.hypot(player.x - last.x, player.y - last.y) >= TRAIL_SPACING) {
    trail.unshift({x: player.x, y: player.y});
    if (trail.length > TRAIL_LENGTH) trail.length = TRAIL_LENGTH;
  }
}

/**
 * Where the companion stands: FOLLOW_GAP behind the player along the path the player actually walked, so it can
 * never be on water or inside a prop. With no history yet it takes the nearest free spot beside the player.
 */
export function followerPoint(world, player, trail) {
  let along = 0;
  let prev = {x: player.x, y: player.y};
  for (const p of trail || []) {
    along += Math.hypot(p.x - prev.x, p.y - prev.y);
    if (along >= FOLLOW_GAP) return p;
    prev = p;
  }
  if (trail?.length) return trail.at(-1);
  return nearestWalkable(world, player.x - 0.75, player.y + 0.8, 3);
}
