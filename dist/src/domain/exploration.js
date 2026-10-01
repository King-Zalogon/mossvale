/* Pure movement and encounter pacing. */
import {isWalkable, zoneAt} from './world.js';

export const WALK_SPEED = 2.8;
export const RUN_SPEED = 4.7;

/** Direction index used to pick the player sprite: 8 down, 9 up, 10 left, 11 right. */
export function facing(sx, sy) {
  return Math.abs(sx) > 0.3 ? (sx < 0 ? 10 : 11) : sy < 0 ? 9 : 8;
}

/**
 * Moves the player by screen-space input (sx, sy in -1..1) and updates step counting.
 * `pacing` = {steps, encounterAt, encounterCooldown}. Returns the encounter zone when a wild encounter should start.
 */
export function movePlayer({world, player, pacing}, sx, sy, run, dt) {
  if (!sx && !sy) return null;
  const magnitude = Math.hypot(sx, sy);
  const v = (run ? RUN_SPEED : WALK_SPEED) * dt;
  const dx = (sx / magnitude + sy / magnitude) * v;
  const dy = (sy / magnitude - sx / magnitude) * v;
  const before = {x: player.x, y: player.y};
  if (isWalkable(world, player.x + dx, player.y)) player.x += dx;
  if (isWalkable(world, player.x, player.y + dy)) player.y += dy;
  player.dir = facing(sx, sy);
  const distance = Math.hypot(player.x - before.x, player.y - before.y);
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
