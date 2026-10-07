/* Bounded, deterministic eight-direction routing for authored scene moves. */
import {isWalkable} from './world.js';

const DIRECTIONS = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];
const key = (x, y) => `${x},${y}`;

/**
 * Find a shortest tile route without teleporting or using the world recovery helper.
 * Routes are capped at 128 steps and 4096 inspected cells so malformed content cannot stall play.
 */
export function findScenePath(world, from, to, {maxSteps = 128, maxVisited = 4096} = {}) {
  const start = [Math.round(from.x), Math.round(from.y)];
  if (!isWalkable(world, start[0], start[1])) return {status: 'blocked', path: []};
  if (!Number.isInteger(to?.[0]) || !Number.isInteger(to?.[1]) || !isWalkable(world, to[0], to[1])) return {status: 'blocked', path: []};
  if (start[0] === to[0] && start[1] === to[1]) return {status: 'arrived', path: []};

  const queue = [start];
  let cursor = 0;
  const previous = new Map([[key(...start), null]]);
  let found = false;
  while (cursor < queue.length && previous.size <= maxVisited) {
    const [x, y] = queue[cursor++];
    for (const [dx, dy] of DIRECTIONS) {
      if (previous.size >= maxVisited) break;
      const nx = x + dx;
      const ny = y + dy;
      const nextKey = key(nx, ny);
      if (previous.has(nextKey) || !isWalkable(world, nx, ny)) continue;
      if (dx && dy && (!isWalkable(world, x + dx, y) || !isWalkable(world, x, y + dy))) continue;
      previous.set(nextKey, key(x, y));
      if (nx === to[0] && ny === to[1]) {
        found = true;
        break;
      }
      queue.push([nx, ny]);
    }
    if (found) break;
    if (previous.size >= maxVisited) break;
  }
  if (!found) return {status: 'blocked', path: []};

  const path = [];
  let current = key(...to);
  while (current !== key(...start)) {
    const [x, y] = current.split(',').map(Number);
    path.push({x, y});
    current = previous.get(current);
  }
  path.reverse();
  if (path.length > maxSteps) return {status: 'blocked', path: []};
  return {status: 'arrived', path};
}
