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

export function validateTerrainFamilyFixture(fixture) {
  const errors = [];
  if (!fixture || fixture.format !== 1 || !/^[a-z0-9-]+$/.test(fixture.id ?? '')) return ['needs format 1 and a stable id'];
  const {grid, size, surfaces, variants, recipes} = fixture;
  if (!size || !Number.isInteger(size.w) || !Number.isInteger(size.h) || !Array.isArray(grid) || grid.length !== size.h) {
    return ['grid dimensions must match size'];
  }
  if (!surfaces || typeof surfaces !== 'object' || !variants || typeof variants !== 'object' || !recipes || typeof recipes !== 'object') {
    return ['surfaces, variants and recipes are required'];
  }
  if (
    Object.keys(surfaces).some(code => !surfaces[code] || typeof surfaces[code].walkable !== 'boolean' || !/^#[0-9a-f]{6}$/i.test(surfaces[code].fill ?? ''))
  ) {
    errors.push('each terrain surface needs a fill color and explicit walkability');
  }
  const topologyGrid = grid.map(row => (typeof row === 'string' ? [...row] : []));
  for (let y = 0; y < grid.length; y++) {
    if (typeof grid[y] !== 'string' || grid[y].length !== size.w) {
      errors.push('row ' + y + ' must contain exactly ' + size.w + ' terrain cells');
      continue;
    }
    for (let x = 0; x < size.w; x++) {
      const code = grid[y][x];
      if (!surfaces[code]) {
        errors.push('unknown terrain code ' + code + ' at ' + x + ',' + y);
        continue;
      }
      const selected = chooseTerrainVariant(topologyGrid, x, y, variants, fixture.seed ?? 0);
      const recipe = selected && recipes[selected.variant];
      if (!selected || recipe?.surface !== code) errors.push('missing source recipe for ' + selected?.key + ' at ' + x + ',' + y);
    }
  }

  const occupied = new Set();
  const bridges = Array.isArray(fixture.bridges) ? fixture.bridges : [];
  if (fixture.bridges !== undefined && !Array.isArray(fixture.bridges)) errors.push('bridges must be an array');
  for (const bridge of bridges) {
    if (!bridge || !Array.isArray(bridge.cells) || !bridge.cells.length || bridge.walkable !== true) {
      errors.push('each bridge needs cells and explicitly walkable deck cells');
      continue;
    }
    const bridgeSurface = surfaces[bridge.waterTerrain];
    const deckSurface = surfaces[bridge.deckTerrain];
    if (!bridgeSurface || bridgeSurface.walkable || !deckSurface || !deckSurface.walkable) {
      errors.push('bridge must span blocked water with a walkable deck terrain');
    }
    if (!Array.isArray(bridge.variants) || !bridge.variants.length || bridge.variants.some(id => recipes[id]?.surface !== 'bridge')) {
      errors.push('bridge needs known source-art variants');
    }
    const cells = bridge.cells.filter(cell => Array.isArray(cell) && cell.length === 2 && cell.every(Number.isInteger));
    if (cells.length !== bridge.cells.length) {
      errors.push('bridge cells must be integer [x, y] coordinates');
      continue;
    }
    const [firstX, firstY] = cells[0];
    const horizontal = bridge.orientation === 'east-west';
    const vertical = bridge.orientation === 'north-south';
    if (!horizontal && !vertical) {
      errors.push('bridge orientation must be east-west or north-south');
      continue;
    }
    const fixed = horizontal ? firstY : firstX;
    const positions = cells.map(([x, y]) => (horizontal ? (y === fixed ? x : NaN) : x === fixed ? y : NaN)).sort((a, b) => a - b);
    if (positions.some((position, index) => !Number.isInteger(position) || (index > 0 && position !== positions[index - 1] + 1))) {
      errors.push('bridge cells must form one straight, contiguous span');
      continue;
    }
    for (const [x, y] of cells) {
      const key = x + ',' + y;
      if (x < 0 || y < 0 || x >= size.w || y >= size.h || grid[y]?.[x] !== bridge.waterTerrain) {
        errors.push('bridge cell ' + key + ' must be inside its declared blocked water');
      }
      if (occupied.has(key)) errors.push('bridge cell ' + key + ' is covered more than once');
      occupied.add(key);
    }
    const before = horizontal ? [positions[0] - 1, fixed] : [fixed, positions[0] - 1];
    const after = horizontal ? [positions.at(-1) + 1, fixed] : [fixed, positions.at(-1) + 1];
    if (grid[before[1]]?.[before[0]] !== bridge.deckTerrain || grid[after[1]]?.[after[0]] !== bridge.deckTerrain) {
      errors.push('bridge must connect walkable terrain on both banks');
    }
  }
  return errors;
}

export function resolveTerrainFamilyCell(fixture, x, y, seed = fixture.seed ?? 0) {
  const row = fixture.grid?.[y];
  const code = typeof row === 'string' ? row[x] : undefined;
  if (!code || !fixture.surfaces?.[code]) return null;
  if (!Array.isArray(fixture.grid)) return null;
  const topology = chooseTerrainVariant(
    fixture.grid.map(line => (typeof line === 'string' ? [...line] : [])),
    x,
    y,
    fixture.variants,
    seed,
  );
  if (!topology) return null;
  const bridge = (Array.isArray(fixture.bridges) ? fixture.bridges : []).find(item => item?.cells?.some(([cx, cy]) => cx === x && cy === y));
  const surface = fixture.surfaces[code];
  const bridgeVariant = bridge?.variants?.[terrainSeed(seed, x, y) % bridge.variants.length];
  return {
    ...topology,
    cellTerrain: code,
    surface: bridge ? 'bridge' : code,
    walkable: bridge ? bridge.walkable : surface.walkable,
    artVariant: bridgeVariant ?? topology.variant,
    bridgeId: bridge?.id ?? null,
  };
}
