/* Deterministic topology labels for source-authored terrain families. No runtime sprite inference. */
const DIRS = [
  ['n', 0, -1],
  ['e', 1, 0],
  ['s', 0, 1],
  ['w', -1, 0],
];

export function terrainVariant(grid, x, y, {safeTransforms = false} = {}) {
  const terrain = grid?.[y]?.[x];
  if (typeof terrain !== 'string') return null;
  const edges = DIRS.filter(([, dx, dy]) => grid?.[y + dy]?.[x + dx] !== terrain).map(([name]) => name);
  const diagonals = [
    ['ne', 1, -1],
    ['se', 1, 1],
    ['sw', -1, 1],
    ['nw', -1, -1],
  ];
  const corners = diagonals.filter(([, dx, dy]) => grid?.[y + dy]?.[x + dx] !== terrain).map(([name]) => name);
  const key = edges.length ? `${terrain}-edge-${edges.join('')}` : `${terrain}-center`;
  return {terrain, key, edges, corners, transform: safeTransforms ? 'rotate-90-safe' : 'none'};
}

/** Stable unsigned 32-bit hash for repeatable authoring-time decoration choices. */
export function terrainSeed(seed, x, y, salt = 0) {
  let value = (seed >>> 0) ^ Math.imul(x | 0, 0x9e3779b1) ^ Math.imul(y | 0, 0x85ebca77) ^ (salt >>> 0);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

export function chooseTerrainVariant(grid, x, y, variants, seed = 0) {
  const topology = terrainVariant(grid, x, y);
  const available = variants?.[topology?.key] ?? variants?.[`${topology?.terrain}-center`];
  if (!topology || !Array.isArray(available) || !available.length) return null;
  return {...topology, variant: available[terrainSeed(seed, x, y) % available.length]};
}
