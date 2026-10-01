/* Pure world queries over a compiled map (see mapdata.js). Maps are data; rules here never name a specific map. */
import {walkableAt, zoneMatches} from './mapdata.js';

export const INTERACTIVE_KINDS = ['ranger', 'shrine', 'chest', 'sign', 'gate'];

/** Deterministic per-tile noise in [0,1), used only for cosmetic variation. */
export function rnd(x, y, region) {
  const v = Math.sin(x * 127.1 + y * 311.7 + region * 59.7) * 43758.5453;
  return v - Math.floor(v);
}

export function buildWorld(map) {
  return {map, tiles: map.tiles, objects: map.objects};
}

export const terrainAt = (world, x, y) => world.map.terrainAt(x, y);
export const isLand = (world, x, y) => terrainAt(world, x, y) !== 'void';

export const isWalkable = (world, x, y) => walkableAt(world.map, x, y);

/** The closest standing spot to (x, y), searching outward in rings; used to rescue a stuck or mis-placed player. */
export function nearestWalkable(world, x, y, maxRadius = 12) {
  if (isWalkable(world, x, y)) return {x, y};
  for (let ring = 1; ring <= maxRadius; ring += 0.5) {
    let best = null;
    for (let a = 0; a < 16; a++) {
      const px = x + Math.cos((a / 16) * Math.PI * 2) * ring;
      const py = y + Math.sin((a / 16) * Math.PI * 2) * ring;
      if (isWalkable(world, px, py)) best = best ?? {x: px, y: py};
    }
    if (best) return best;
  }
  return {...world.map.spawns.camp};
}

/** The encounter zone covering a tile, or null. First matching zone wins. */
export function zoneAt(world, x, y) {
  const t = terrainAt(world, x, y);
  return world.map.zones.find(z => zoneMatches(z, t, x, y)) || null;
}

export const spawnOf = (world, name = 'camp') => world.map.spawns[name] || world.map.spawns.camp;

export function nearestInteractive(world, player, radius = 1.95) {
  return (
    world.objects
      .filter(o => INTERACTIVE_KINDS.includes(o.kind))
      .map(o => ({...o, distance: Math.hypot(player.x - o.x, player.y - o.y)}))
      .filter(o => o.distance < radius)
      .sort((a, b) => a.distance - b.distance)[0] || null
  );
}

/** Triggers whose area the player is standing in. Caller decides which have already fired. */
export function triggersAt(world, player, on) {
  return world.map.triggers.filter(t => t.on === on && Math.hypot(player.x - t.x, player.y - t.y) <= t.radius);
}
