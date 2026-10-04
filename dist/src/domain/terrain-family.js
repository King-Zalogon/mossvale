/* Deterministic, authoring-time terrain resolution. Art is selected from authored source files; collision is data. */
const DIRS = [
  ['n', 0, -1, 1],
  ['e', 1, 0, 2],
  ['s', 0, 1, 4],
  ['w', -1, 0, 8],
];
const DIAGONALS = [
  ['ne', 1, -1, 1],
  ['se', 1, 1, 2],
  ['sw', -1, 1, 4],
  ['nw', -1, -1, 8],
];
const SAFE_TRANSFORMS = new Set(['rotate-90', 'rotate-180', 'rotate-270', 'mirror-x', 'mirror-y']);
const ART_SOURCE = /^\.\.\/assets\/terrain-family\/[a-z0-9-]+\.svg$/;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function terrainVariant(grid, x, y) {
  const terrain = grid?.[y]?.[x];
  if (typeof terrain !== 'string') return null;
  const edges = DIRS.filter(([, dx, dy]) => grid?.[y + dy]?.[x + dx] !== terrain).map(([name]) => name);
  const connections = DIRS.filter(([, dx, dy]) => grid?.[y + dy]?.[x + dx] === terrain).map(([name]) => name);
  const corners = DIAGONALS.filter(([, dx, dy]) => grid?.[y + dy]?.[x + dx] !== terrain).map(([name]) => name);
  const edgeMask = DIRS.filter(([, dx, dy]) => grid?.[y + dy]?.[x + dx] !== terrain).reduce((mask, dir) => mask | dir[3], 0);
  const connectionMask = DIRS.filter(([, dx, dy]) => grid?.[y + dy]?.[x + dx] === terrain).reduce((mask, dir) => mask | dir[3], 0);
  const cornerMask = DIAGONALS.filter(([, dx, dy]) => grid?.[y + dy]?.[x + dx] !== terrain).reduce((mask, dir) => mask | dir[3], 0);
  const key = edges.length ? `${terrain}-edge-${edges.join('')}` : `${terrain}-center`;
  const cornerKey = `${key}-corner-${corners.length ? corners.join('') : 'none'}`;
  const connectionSet = new Set(connections);
  const shape =
    connections.length === 0
      ? 'isolated'
      : connections.length === 1
        ? 'end'
        : connections.length === 2
          ? (connectionSet.has('n') && connectionSet.has('s')) || (connectionSet.has('e') && connectionSet.has('w'))
            ? 'straight'
            : 'corner'
          : connections.length === 3
            ? 'tee'
            : 'cross';
  // Artwork is never rotated or reflected implicitly. Authored art can list safe transforms,
  // but the current compiler only selects canonical source orientations.
  return {terrain, key, cornerKey, edges, connections, corners, edgeMask, connectionMask, cornerMask, shape, transform: 'none'};
}

/** Stable unsigned 32-bit hash for repeatable authoring-time decoration choices. */
export function terrainSeed(seed, x, y, salt = 0) {
  let value = (seed >>> 0) ^ Math.imul(x | 0, 0x9e3779b1) ^ Math.imul(y | 0, 0x85ebca77) ^ (salt >>> 0);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

/**
 * Chooses exact edge/corner art first, then an explicit universal tile family for the material.
 * The fallback must be authored: a missing exact recipe never silently becomes a center tile.
 */
export function chooseTerrainVariant(grid, x, y, variants, seed = 0, surfaceDefaults = {}) {
  const topology = terrainVariant(grid, x, y);
  if (!topology) return null;
  const exact = variants?.[topology.cornerKey] ?? variants?.[topology.key];
  const available = exact ?? surfaceDefaults?.[topology.terrain];
  if (!Array.isArray(available) || !available.length) return null;
  return {...topology, variant: available[terrainSeed(seed, x, y) % available.length], fallback: !exact};
}

function recipeFor(fixture, id) {
  const recipe = fixture.recipes?.[id];
  const source = recipe && fixture.artwork?.[recipe.source];
  return recipe && source ? {id, recipe, sourceId: recipe.source, source} : null;
}

function shorelineEdges(fixture, x, y, code) {
  const isWater = fixture.surfaces[code]?.kind === 'water';
  if (!fixture.grid?.[y]) return [];
  return DIRS.filter(([, dx, dy]) => {
    const otherCode = fixture.grid[y + dy]?.[x + dx];
    const other = fixture.surfaces[otherCode];
    return other && otherCode !== code && (isWater || other.kind === 'water');
  }).map(([name]) => name);
}

export function resolveTerrainFamilyCell(fixture, x, y, seed = fixture.seed ?? 0) {
  const code = fixture.grid?.[y]?.[x];
  if (!code || !fixture.surfaces?.[code] || !Array.isArray(fixture.grid)) return null;
  const topology = chooseTerrainVariant(fixture.grid, x, y, fixture.variants, seed, fixture.surfaceDefaults);
  if (!topology) return null;
  const bridge = (Array.isArray(fixture.bridges) ? fixture.bridges : []).find(item => item?.cells?.some(([cx, cy]) => cx === x && cy === y));
  const base = recipeFor(fixture, topology.variant);
  if (!base) return null;
  const bridgeVariant = bridge?.variants?.[terrainSeed(seed, x, y, 1) % bridge.variants.length];
  const overlay = bridgeVariant ? recipeFor(fixture, bridgeVariant) : null;
  if (bridge && !overlay) return null;
  const surface = fixture.surfaces[code];
  return {
    ...topology,
    cellTerrain: code,
    surface: bridge ? 'bridge' : code,
    walkable: bridge ? bridge.walkable : surface.walkable,
    bridgeId: bridge?.id ?? null,
    artVariant: overlay?.id ?? base.id,
    baseArtVariant: base.id,
    artwork: overlay?.sourceId ?? base.sourceId,
    baseArtwork: base.sourceId,
    shoreEdges: shorelineEdges(fixture, x, y, code),
  };
}

/** Compiles every fixture cell to stable source-art, topology, anchor and explicit collision data. */
export function bakeTerrainFamily(fixture, seed = fixture?.seed ?? 0) {
  const errors = validateTerrainFamilyFixture(fixture);
  if (errors.length) throw new TypeError('Cannot bake terrain family: ' + errors.join('; '));
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('seed must be an unsigned 32-bit integer');
  const cells = [];
  const counts = {cells: 0, walkable: 0, blocked: 0, bridges: 0, shoreTiles: 0};
  for (let y = 0; y < fixture.size.h; y++) {
    for (let x = 0; x < fixture.size.w; x++) {
      const resolved = resolveTerrainFamilyCell(fixture, x, y, seed);
      const source = fixture.artwork[resolved.artwork];
      const baseSource = fixture.artwork[resolved.baseArtwork];
      const cell = {
        x,
        y,
        terrain: resolved.cellTerrain,
        surface: resolved.surface,
        walkable: resolved.walkable,
        bridgeId: resolved.bridgeId,
        recipe: resolved.artVariant,
        baseRecipe: resolved.baseArtVariant,
        art: source.src,
        baseArt: baseSource.src,
        anchor: [...source.anchor],
        lighting: source.lighting,
        transform: 'none',
        edges: resolved.edges,
        connections: resolved.connections,
        corners: resolved.corners,
        edgeMask: resolved.edgeMask,
        connectionMask: resolved.connectionMask,
        cornerMask: resolved.cornerMask,
        shape: resolved.shape,
        shoreEdges: resolved.shoreEdges,
        decoration: terrainSeed(seed, x, y, 2) & 0xff,
      };
      cells.push(cell);
      counts.cells++;
      counts[cell.walkable ? 'walkable' : 'blocked']++;
      if (cell.bridgeId) counts.bridges++;
      if (cell.shoreEdges.length) counts.shoreTiles++;
    }
  }
  return {format: 1, fixture: fixture.id, size: {...fixture.size}, tile: structuredClone(fixture.tile), seed, counts, cells};
}

/** Serializes a bake as row-aligned layers, keeping shared art metadata out of each cell record. */
export function serializeTerrainFamilyBake(fixture, baked = bakeTerrainFamily(fixture)) {
  if (baked?.format !== 1 || baked.fixture !== fixture?.id || baked.cells?.length !== fixture?.size?.w * fixture?.size?.h) {
    throw new TypeError('baked terrain must match its source fixture and dimensions');
  }
  const layer = (project, separator = ',') =>
    Array.from({length: fixture.size.h}, (_, y) =>
      baked.cells
        .slice(y * fixture.size.w, (y + 1) * fixture.size.w)
        .map(project)
        .join(separator),
    );
  const maskOf = names => names.reduce((mask, name) => mask | (DIRS.find(([direction]) => direction === name)?.[3] ?? 0), 0);
  return {
    format: 1,
    fixture: fixture.id,
    seed: baked.seed,
    size: {...fixture.size},
    tile: structuredClone(fixture.tile),
    transformPolicy: 'canonical-only',
    counts: {...baked.counts},
    maskBits: {north: 1, east: 2, south: 4, west: 8},
    encoding: {
      coordinates: 'zero-based x/y are the column/row indices; every cell layer aligns with grid',
      recipe: 'comma-separated stable recipe IDs, one entry per cell',
      walkable: 'one character per cell: 1 is walkable, 0 is blocked',
      masks: 'one hexadecimal digit per cell using maskBits',
      decoration: 'comma-separated unsigned bytes, one entry per cell',
    },
    grid: [...fixture.grid],
    surfaces: structuredClone(fixture.surfaces),
    artwork: structuredClone(fixture.artwork),
    recipes: structuredClone(fixture.recipes),
    bridges: structuredClone(fixture.bridges ?? []),
    cells: {
      surface: layer(cell => cell.surface),
      recipe: layer(cell => cell.recipe),
      baseRecipe: layer(cell => cell.baseRecipe),
      walkable: layer(cell => (cell.walkable ? '1' : '0'), ''),
      edgeMask: layer(cell => cell.edgeMask.toString(16), ''),
      connectionMask: layer(cell => cell.connectionMask.toString(16), ''),
      cornerMask: layer(cell => cell.cornerMask.toString(16), ''),
      shoreMask: layer(cell => maskOf(cell.shoreEdges).toString(16), ''),
      decoration: layer(cell => String(cell.decoration)),
    },
  };
}

/** Validates the fixture and all topology/art/collision invariants before preview or export. */
export function validateTerrainFamilyFixture(fixture) {
  const errors = [];
  if (!fixture || fixture.format !== 1 || !ID.test(fixture.id ?? '')) return ['needs format 1 and a stable id'];
  const {grid, size, surfaces, variants, surfaceDefaults, recipes, artwork} = fixture;
  if (!size || !Number.isInteger(size.w) || !Number.isInteger(size.h) || !Array.isArray(grid) || grid.length !== size.h) {
    return ['grid dimensions must match size'];
  }
  if (
    !surfaces ||
    typeof surfaces !== 'object' ||
    !variants ||
    typeof variants !== 'object' ||
    !surfaceDefaults ||
    typeof surfaceDefaults !== 'object' ||
    !recipes ||
    typeof recipes !== 'object' ||
    !artwork ||
    typeof artwork !== 'object'
  ) {
    return ['surfaces, variants, surfaceDefaults, recipes and artwork are required'];
  }
  if (
    !fixture.tile ||
    !Number.isInteger(fixture.tile.w) ||
    !Number.isInteger(fixture.tile.h) ||
    !Array.isArray(fixture.tile.anchor) ||
    fixture.tile.anchor.length !== 2
  ) {
    errors.push('tile needs integer dimensions and a two-number anchor');
  } else if (fixture.tile.anchor.some((point, index) => !Number.isFinite(point) || point < 0 || point > (index === 0 ? fixture.tile.w : fixture.tile.h))) {
    errors.push('tile anchor must be inside its source image');
  }
  if (!Number.isInteger(fixture.seed) || fixture.seed < 0 || fixture.seed > 0xffffffff) errors.push('seed must be an unsigned 32-bit integer');
  if (
    Object.entries(surfaces).some(
      ([, surface]) =>
        !surface || typeof surface.walkable !== 'boolean' || !/^#[0-9a-f]{6}$/i.test(surface.fill ?? '') || !['land', 'water'].includes(surface.kind),
    )
  ) {
    errors.push('each terrain surface needs a fill color, land/water kind and explicit walkability');
  }
  for (const [id, source] of Object.entries(artwork)) {
    if (
      !ID.test(id) ||
      !source ||
      !ART_SOURCE.test(source.src ?? '') ||
      !Array.isArray(source.anchor) ||
      source.anchor.length !== 2 ||
      source.anchor.some((value, index) => !Number.isFinite(value) || value < 0 || value > (index === 0 ? fixture.tile?.w : fixture.tile?.h)) ||
      !['northwest', 'northeast', 'southwest', 'southeast'].includes(source.lighting) ||
      !Array.isArray(source.safeTransforms) ||
      source.safeTransforms.some(value => !SAFE_TRANSFORMS.has(value))
    ) {
      errors.push('artwork ' + id + ' needs a local SVG source, valid anchor, lighting direction and explicit safe transforms');
    }
  }
  for (const [id, recipe] of Object.entries(recipes)) {
    if (!ID.test(id) || !recipe || (!surfaces[recipe.surface] && recipe.surface !== 'bridge') || !artwork[recipe.source]) {
      errors.push('recipe ' + id + ' needs a known surface and artwork source');
    }
  }
  for (const [code, ids] of Object.entries(surfaceDefaults)) {
    if (!surfaces[code] || !Array.isArray(ids) || !ids.length || ids.some(id => recipes[id]?.surface !== code)) {
      errors.push('surface default ' + code + ' needs one or more recipes for that exact surface');
    }
  }
  for (const code of Object.keys(surfaces))
    if (!Array.isArray(surfaceDefaults[code]) || !surfaceDefaults[code].length) errors.push('missing explicit surface default for ' + code);
  for (const [key, ids] of Object.entries(variants)) {
    if (!Array.isArray(ids) || !ids.length || ids.some(id => !recipes[id])) errors.push('variant key ' + key + ' needs known source recipes');
  }

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
      const selected = chooseTerrainVariant(grid, x, y, variants, fixture.seed, surfaceDefaults);
      const recipe = selected && recipes[selected.variant];
      if (!selected || recipe?.surface !== code || !artwork[recipe?.source]) errors.push('missing source recipe for ' + selected?.key + ' at ' + x + ',' + y);
    }
  }

  const occupied = new Set();
  const bridges = Array.isArray(fixture.bridges) ? fixture.bridges : [];
  if (fixture.bridges !== undefined && !Array.isArray(fixture.bridges)) errors.push('bridges must be an array');
  for (const bridge of bridges) {
    if (!bridge || !ID.test(bridge.id ?? '') || !Array.isArray(bridge.cells) || !bridge.cells.length || bridge.walkable !== true) {
      errors.push('each bridge needs a stable id, cells and explicitly walkable deck cells');
      continue;
    }
    const bridgeSurface = surfaces[bridge.waterTerrain];
    const deckSurface = surfaces[bridge.deckTerrain];
    if (!bridgeSurface || bridgeSurface.kind !== 'water' || bridgeSurface.walkable || !deckSurface || deckSurface.kind !== 'land' || !deckSurface.walkable) {
      errors.push('bridge must span blocked water with an explicitly walkable land deck');
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
    for (const id of bridge.variants ?? []) {
      const source = artwork[recipes[id]?.source];
      const sourceOrientation = source?.orientation;
      if (sourceOrientation && sourceOrientation !== bridge.orientation)
        errors.push('bridge ' + bridge.id + ' needs authored ' + bridge.orientation + ' artwork; transforms are not inferred');
    }
  }
  return errors;
}
