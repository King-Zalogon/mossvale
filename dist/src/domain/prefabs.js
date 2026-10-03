/* Deterministic, data-only expansion of reusable map content into the existing flat map format. */

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TRANSFORMS = new Set(['none', 'flip-x', 'flip-y', 'rotate-180']);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = value => structuredClone(value);

function transformPoint(point, width, height, transform) {
  let [x, y] = point;
  if (transform === 'flip-x' || transform === 'rotate-180') x = width - 1 - x;
  if (transform === 'flip-y' || transform === 'rotate-180') y = height - 1 - y;
  return [x, y];
}

function transformRect(rect, width, height, transform) {
  const [x0, y0, x1, y1] = rect;
  const points = [
    transformPoint([x0, y0], width, height, transform),
    transformPoint([x1, y0], width, height, transform),
    transformPoint([x0, y1], width, height, transform),
    transformPoint([x1, y1], width, height, transform),
  ];
  return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
}

function mergedRole(entity, roles, where, errors) {
  if (!entity.role) return clone(entity);
  if (!isObject(roles) || !isObject(roles[entity.role])) {
    errors.push(`${where}: role "${entity.role}" needs an override for this instance`);
    return clone(entity);
  }
  const {role, ...base} = entity;
  const override = roles[role];
  const forbidden = ['id', 'at', 'sprite', 'w', 'solid', 'kind'];
  for (const key of forbidden)
    if (Object.hasOwn(override, key)) errors.push(`${where}.roles.${role}.${key}: cannot replace prefab geometry or visual identity`);
  return {...base, ...Object.fromEntries(Object.entries(override).filter(([key]) => !forbidden.includes(key)))};
}

function namespaceEntity(entity, instanceId, localId) {
  const out = {...entity, id: `${instanceId}-${localId}`};
  delete out.role;
  if (Array.isArray(out.lines)) out.lines = clone(out.lines);
  if (Array.isArray(out.events)) out.events = out.events.map(event => ({...event, id: `${instanceId}-${event.id}`}));
  return out;
}

function listOrEmpty(value, where, errors) {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value;
  errors.push(`${where}: expected an array`);
  return [];
}

function inBounds(at, width, height) {
  return Array.isArray(at) && at.length === 2 && at.every(Number.isFinite) && at[0] >= 0 && at[1] >= 0 && at[0] < width && at[1] < height;
}

/**
 * Expand map `instances` using the pack's `prefabs` object. Prefabs have a rectangular `footprint`, optional
 * terrain tile placements, props, landmarks, exits, zones, triggers and interaction `slots`. Slots are landmarks
 * with a required role override on each instance. Returns copies and never mutates either input.
 *
 * @returns {{maps: object[], errors: string[]}}
 */
export function expandMapPrefabs(rawMaps, prefabs = {}) {
  const errors = [];
  if (!Array.isArray(rawMaps)) return {maps: [], errors: ['maps: expected an array']};
  if (!isObject(prefabs)) return {maps: rawMaps.map(clone), errors: ['prefabs: expected an object keyed by prefab id']};
  const catalog = new Map();
  for (const [key, prefab] of Object.entries(prefabs)) {
    if (!ID.test(key) || !isObject(prefab) || (prefab.id !== undefined && prefab.id !== key))
      errors.push(`prefabs.${key}: use a matching lowercase-kebab-case id and an object definition`);
    else if (catalog.has(key)) errors.push(`prefabs.${key}: duplicate id`);
    else catalog.set(key, prefab);
  }

  const maps = rawMaps.map(raw => {
    if (!isObject(raw)) return clone(raw);
    const map = clone(raw);
    const instances = map.instances ?? [];
    delete map.instances;
    if (!Array.isArray(instances)) {
      errors.push(`map ${raw.id}: instances must be an array`);
      return map;
    }
    if (!instances.length) return map;

    const width = map.size?.w,
      height = map.size?.h;
    if (!Number.isInteger(width) || !Number.isInteger(height) || !Array.isArray(map.terrain)) {
      errors.push(`map ${raw.id}: prefabs need a sized map with terrain rows`);
      return map;
    }
    const rows = map.terrain.map(row => (typeof row === 'string' ? [...row] : []));
    const occupied = [];
    const usedInstanceIds = new Set();
    const usedEntityIds = new Set();
    for (const field of ['props', 'landmarks', 'exits', 'zones', 'triggers'])
      if (Array.isArray(map[field])) for (const entity of map[field]) if (typeof entity?.id === 'string') usedEntityIds.add(entity.id);
    if (map.spawns === undefined) map.spawns = {};
    else if (!isObject(map.spawns)) {
      errors.push(`map ${raw.id}: spawns must be an object before prefab expansion`);
      map.spawns = {};
    }
    for (const [instanceIndex, instance] of instances.entries()) {
      const where = `map ${raw.id}: instances[${instanceIndex}]`;
      if (
        !isObject(instance) ||
        !ID.test(instance.id) ||
        !ID.test(instance.prefab) ||
        !Array.isArray(instance.at) ||
        instance.at.length !== 2 ||
        !instance.at.every(Number.isInteger)
      ) {
        errors.push(`${where}: needs lowercase-kebab-case id/prefab and integer at [x, y]`);
        continue;
      }
      if (usedInstanceIds.has(instance.id)) errors.push(`${where}: duplicate instance id "${instance.id}"`);
      usedInstanceIds.add(instance.id);
      const prefab = catalog.get(instance.prefab);
      if (!prefab) {
        errors.push(`${where}: unknown prefab "${instance.prefab}"`);
        continue;
      }
      const footprint = prefab.footprint;
      const fw = footprint?.w,
        fh = footprint?.h;
      if (!Number.isInteger(fw) || !Number.isInteger(fh) || fw < 1 || fh < 1 || fw > 128 || fh > 128) {
        errors.push(`prefabs.${instance.prefab}.footprint: w/h must be integers in 1..128`);
        continue;
      }
      const transform = instance.transform ?? 'none';
      const allowed = Array.isArray(prefab.transforms) ? prefab.transforms : ['none'];
      if (!TRANSFORMS.has(transform) || !allowed.includes(transform)) {
        errors.push(`${where}.transform: "${transform}" is not allowed by prefab "${instance.prefab}"`);
        continue;
      }
      const x = instance.at[0],
        y = instance.at[1];
      if (x < 0 || y < 0 || x + fw > width || y + fh > height)
        errors.push(`${where}.at: ${instance.prefab} footprint must fit inside the ${width}×${height} map`);
      if (footprint.solid !== false) {
        const rect = {x, y, w: fw, h: fh, id: instance.id};
        for (const other of occupied)
          if (rect.x < other.x + other.w && rect.x + rect.w > other.x && rect.y < other.y + other.h && rect.y + rect.h > other.y)
            errors.push(`${where}.at: solid footprint overlaps prefab instance "${other.id}"`);
        occupied.push(rect);
      }
      const point = local => {
        if (!inBounds(local, fw, fh)) return null;
        const [px, py] = transformPoint(local, fw, fh, transform);
        return [x + px, y + py];
      };
      for (const [tileIndex, tile] of listOrEmpty(prefab.terrain, `prefabs.${instance.prefab}.terrain`, errors).entries()) {
        const at = point(tile?.at);
        if (!at || at[0] < 0 || at[1] < 0 || at[0] >= width || at[1] >= height || typeof tile.tile !== 'string' || tile.tile.length !== 1) {
          errors.push(`prefabs.${instance.prefab}.terrain[${tileIndex}]: needs a one-character tile and a local point inside its footprint`);
          continue;
        }
        if (rows[at[1]]?.length === width) rows[at[1]][at[0]] = tile.tile;
        else errors.push(`${where}: terrain rows must be ${width} characters wide before prefab expansion`);
      }
      if (prefab.spawns !== undefined && !isObject(prefab.spawns)) errors.push(`prefabs.${instance.prefab}.spawns: expected an object`);
      for (const [spawnName, local] of Object.entries(isObject(prefab.spawns) ? prefab.spawns : {})) {
        const at = point(local);
        if (!ID.test(spawnName) || !at || at[0] < 0 || at[1] < 0 || at[0] >= width || at[1] >= height) {
          errors.push(`prefabs.${instance.prefab}.spawns.${spawnName}: local point must be inside its footprint`);
          continue;
        }
        const key = `${instance.id}-${spawnName}`;
        if (Object.hasOwn(map.spawns, key)) errors.push(`${where}: duplicate spawn "${key}"`);
        else map.spawns[key] = at;
      }
      const localIds = new Set();
      for (const field of ['props', 'landmarks', 'exits', 'zones', 'triggers']) {
        const entities =
          field === 'landmarks'
            ? [
                ...listOrEmpty(prefab.landmarks, `prefabs.${instance.prefab}.landmarks`, errors),
                ...listOrEmpty(prefab.slots, `prefabs.${instance.prefab}.slots`, errors),
              ]
            : listOrEmpty(prefab[field], `prefabs.${instance.prefab}.${field}`, errors);
        for (const [entityIndex, entity] of entities.entries()) {
          if (!isObject(entity)) {
            errors.push(`prefabs.${instance.prefab}.${field}[${entityIndex}]: expected an object`);
            continue;
          }
          const localId = entity?.id ?? `${field}-${entityIndex + 1}`;
          if (!ID.test(localId)) {
            errors.push(`prefabs.${instance.prefab}.${field}[${entityIndex}].id: lowercase-kebab-case id required`);
            continue;
          }
          if (localIds.has(localId)) errors.push(`${where}: duplicate local entity id "${localId}" in prefab "${instance.prefab}"`);
          localIds.add(localId);
          const target = mergedRole(entity, instance.roles, `${where}.${instance.id}-${localId}`, errors);
          if (field === 'props') {
            target.at = Array.isArray(entity.at) ? entity.at.map(point) : [];
          } else if (field === 'zones' && Array.isArray(entity.rect) && entity.rect.length === 4) {
            if (!entity.rect.every(Number.isFinite) || entity.rect[0] < 0 || entity.rect[1] < 0 || entity.rect[2] >= fw || entity.rect[3] >= fh)
              errors.push(`prefabs.${instance.prefab}.zones[${entityIndex}].rect: must fit inside the prefab footprint`);
            else target.rect = transformRect(entity.rect, fw, fh, transform).map((n, i) => n + (i % 2 === 0 ? x : y));
          } else {
            const at = point(entity.at);
            if (!at) errors.push(`prefabs.${instance.prefab}.${field}[${entityIndex}].at: local point required`);
            target.at = at;
          }
          const out = namespaceEntity(target, instance.id, localId);
          if (usedEntityIds.has(out.id)) errors.push(`${where}: duplicate namespaced entity id "${out.id}"`);
          usedEntityIds.add(out.id);
          if (field === 'triggers') {
            for (const event of out.events ?? []) {
              if (event.id.length > 64) errors.push(`${where}.${out.id}: namespaced event id is too long`);
            }
          }
          if (map[field] === undefined) map[field] = [];
          else if (!Array.isArray(map[field])) {
            errors.push(`map ${raw.id}: ${field} must be an array before prefab expansion`);
            map[field] = [];
          }
          map[field].push(out);
        }
      }
    }
    map.terrain = rows.map(row => row.join(''));
    return map;
  });
  return {maps, errors};
}
