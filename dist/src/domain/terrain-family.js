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
  const cornerKey = `${key}-corner-${corners.length ? corners.join('') : 'none'}`;
  const edgeSet = new Set(edges);
  const shape =
    edges.length === 0
      ? 'isolated'
      : edges.length === 1
        ? 'end'
        : edges.length === 2
          ? (edgeSet.has('n') && edgeSet.has('s')) || (edgeSet.has('e') && edgeSet.has('w'))
            ? 'straight'
            : 'corner'
          : edges.length === 3
            ? 'tee'
            : 'cross';
  return {terrain, key, cornerKey, edges, corners, shape, transform: safeTransforms ? 'rotate-90-safe' : 'none'};
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
  if (!topology) return null;
  // Exact corner variants may override a complete edge mask. Never substitute a
  // center tile for an edge: missing art should be visible in the preview.
  const available = variants?.[topology.cornerKey] ?? variants?.[topology.key];
  if (!topology || !Array.isArray(available) || !available.length) return null;
  return {...topology, variant: available[terrainSeed(seed, x, y) % available.length]};
}
