/* Pure world generation and collision for the current (procedural) maps. */
import {MAP_SIZE as N} from '../config.js';
import {regions} from '../data/regions.js';

export const land = (x, y) => x >= 0 && y >= 0 && x < N && y < N && (x - 12) ** 2 / 148 + (y - 12) ** 2 / 136 < 1.12;
export const water = (x, y, region) => (x - 6) ** 2 / 9 + (y - 15.5) ** 2 / 13 < 1 && region !== 1;
export const path = (x, y) => Math.abs(x - 12) < 1.35 || Math.abs(y - 12) < 1.25 || (x > 9 && x < 14 && y > 7 && y < 11);
export const grass = (x, y, region) =>
  land(x, y) && !water(x, y, region) && !path(x, y) && ((x > 14 && y > 7 && y < 19) || (x < 10 && y < 9) || (x > 8 && x < 18 && y > 16));

/** Deterministic per-tile noise in [0,1). */
export function rnd(x, y, region) {
  const v = Math.sin(x * 127.1 + y * 311.7 + region * 59.7) * 43758.5453;
  return v - Math.floor(v);
}

export const INTERACTIVE_KINDS = ['ranger', 'shrine', 'chest', 'sign', 'gate'];

export function buildWorld(region) {
  const world = {tiles: [], objects: []};
  const special = [
    {x: 13, y: 8.3, id: 2, w: 133, solid: 1.15, kind: 'cottage'},
    {x: 10.5, y: 11, id: 8, w: 37, kind: 'ranger', label: 'Talk to Ranger Iris'},
    {x: 12, y: 4.6, id: 20, w: 99, solid: 0.65, kind: 'shrine', label: 'Visit the shrine'},
    {x: 17.2, y: 16, id: 23, w: 44, kind: 'chest', label: 'Open the treasure chest'},
    {x: 11, y: 13.2, id: 14, w: 38, kind: 'sign', label: 'Read the trail sign'},
    {x: 22.4, y: 12, id: 14, w: 40, kind: 'gate', target: region < 2 ? region + 1 : 0, label: 'Take the eastern trail'},
  ];
  if (region > 0) special.push({x: 1.9, y: 12, id: 14, w: 40, kind: 'gate', target: region - 1, label: 'Take the western trail'});
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!land(x, y)) continue;
      const t = {x, y, water: water(x, y, region), path: path(x, y), grass: grass(x, y, region)};
      world.tiles.push(t);
      const r = rnd(x, y, region);
      const nearSpecial = special.some(o => Math.hypot(x - o.x, y - o.y) < 2.15);
      if (nearSpecial || t.water || t.path) continue;
      if (!t.grass && r > 0.65) {
        const id = region === 2 ? 21 : region === 1 ? (r > 0.9 ? 22 : 3) : r > 0.84 ? 1 : 0;
        world.objects.push({x: x + 0.1, y: y + 0.1, id, w: id === 22 ? 71 : id === 3 ? 49 : 79, solid: 0.52, kind: 'scenery'});
      } else if (t.grass && r > 0.41) world.objects.push({x, y, id: 12, w: 27, kind: 'grass'});
      else if (r < 0.075 && region === 0) world.objects.push({x, y, id: 13, w: 32, kind: 'flower'});
    }
  }
  world.objects.push(...special);
  world.objects.sort((a, b) => a.x + a.y - b.x - b.y);
  return world;
}

export function isWalkable(world, region, x, y) {
  return land(x, y) && !water(x, y, region) && !world.objects.some(o => o.solid && Math.hypot(x - o.x, y - o.y) < o.solid + 0.22);
}

export const spawnOf = region => regions[region].spawn;

export function nearestInteractive(world, player, radius = 1.95) {
  return (
    world.objects
      .filter(o => o.kind && INTERACTIVE_KINDS.includes(o.kind))
      .map(o => ({...o, distance: Math.hypot(player.x - o.x, player.y - o.y)}))
      .filter(o => o.distance < radius)
      .sort((a, b) => a.distance - b.distance)[0] || null
  );
}
