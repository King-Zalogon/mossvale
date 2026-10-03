/* Pure world queries over a compiled map (see mapdata.js). Maps are data; rules here never name a specific map. */
import {walkableAt, zoneMatches} from './mapdata.js';

export const INTERACTIVE_KINDS = ['ranger', 'shrine', 'chest', 'sign', 'gate'];

/** Deterministic per-tile noise in [0,1), used only for cosmetic variation. */
export function rnd(x, y, region) {
  const v = Math.sin(x * 127.1 + y * 311.7 + region * 59.7) * 43758.5453;
  return v - Math.floor(v);
}

export function buildWorld(map) {
  const tilesByCell = new Map(map.tiles.map(tile => [cellKey(tile.x, tile.y), tile]));
  const objectsByCell = new Map();
  let maxSolid = 0;
  for (const object of map.objects) {
    const key = cellKey(object.x, object.y);
    const cell = objectsByCell.get(key) ?? [];
    cell.push(object);
    objectsByCell.set(key, cell);
    maxSolid = Math.max(maxSolid, object.solid ?? 0);
  }
  return {map, tiles: map.tiles, objects: map.objects, tilesByCell, objectsByCell, maxSolid};
}

const cellKey = (x, y) => `${Math.floor(x)},${Math.floor(y)}`;

/** Tiles in a world-coordinate rectangle, fetched from cells instead of scanning the full map. */
export function tilesInBounds(world, bounds) {
  if (world.tiles.length <= 2048) return world.tiles;
  if (!(world.tilesByCell instanceof Map)) return world.tiles.filter(t => t.x >= bounds.minX && t.x <= bounds.maxX && t.y >= bounds.minY && t.y <= bounds.maxY);
  const tiles = [];
  for (let y = Math.max(0, Math.floor(bounds.minY)); y <= Math.min(world.map.size.h - 1, Math.ceil(bounds.maxY)); y++) {
    for (let x = Math.max(0, Math.floor(bounds.minX)); x <= Math.min(world.map.size.w - 1, Math.ceil(bounds.maxX)); x++) {
      const tile = world.tilesByCell.get(cellKey(x, y));
      if (tile) tiles.push(tile);
    }
  }
  return tiles;
}

/** Static map objects in a world-coordinate rectangle, excluding off-camera objects. */
export function objectsInBounds(world, bounds) {
  if (world.objects.length <= 512) return world.objects;
  if (world.objects !== world.map.objects || !(world.objectsByCell instanceof Map))
    return world.objects.filter(o => o.x >= bounds.minX && o.x <= bounds.maxX && o.y >= bounds.minY && o.y <= bounds.maxY);
  const objects = [];
  for (let y = Math.max(0, Math.floor(bounds.minY)); y <= Math.min(world.map.size.h - 1, Math.ceil(bounds.maxY)); y++) {
    for (let x = Math.max(0, Math.floor(bounds.minX)); x <= Math.min(world.map.size.w - 1, Math.ceil(bounds.maxX)); x++) {
      objects.push(...(world.objectsByCell.get(cellKey(x, y)) ?? []));
    }
  }
  return objects;
}

export const terrainAt = (world, x, y) => world.map.terrainAt(x, y);
export const isLand = (world, x, y) => terrainAt(world, x, y) !== 'void';

export const isWalkable = (world, x, y) => walkableAt(world.map, x, y, world.objects === world.map.objects ? world.objectsByCell : undefined, world.maxSolid);

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
  if (world.objects.length <= 512 || world.objects !== world.map.objects || !(world.objectsByCell instanceof Map)) {
    return (
      world.objects
        .filter(o => INTERACTIVE_KINDS.includes(o.kind))
        .map(o => ({...o, distance: Math.hypot(player.x - o.x, player.y - o.y)}))
        .filter(o => o.distance < radius)
        .sort((a, b) => a.distance - b.distance)[0] || null
    );
  }
  let closest = null;
  for (let y = Math.max(0, Math.floor(player.y - radius)); y <= Math.min(world.map.size.h - 1, Math.floor(player.y + radius)); y++) {
    for (let x = Math.max(0, Math.floor(player.x - radius)); x <= Math.min(world.map.size.w - 1, Math.floor(player.x + radius)); x++) {
      const cell = world.objectsByCell.get(cellKey(x, y)) ?? [];
      for (const object of cell) {
        if (!INTERACTIVE_KINDS.includes(object.kind)) continue;
        const distance = Math.hypot(player.x - object.x, player.y - object.y);
        if (distance < radius && (!closest || distance < closest.distance)) closest = {...object, distance};
      }
    }
  }
  return closest;
}

/** Triggers whose area the player is standing in. Caller decides which have already fired. */
export function triggersAt(world, player, on) {
  return world.map.triggers.filter(t => t.on === on && Math.hypot(player.x - t.x, player.y - t.y) <= t.radius);
}
