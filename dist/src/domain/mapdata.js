/* Map data format (version 1): validation and compilation. Pure functions only.
   Authoring guide: docs/MAP_FORMAT.md. */
import {PLAYER_RADIUS} from '../config.js';
import {TACTICS} from '../data/tactics.js';
import {validateLines} from './objectives.js';
import {validateSceneEvent} from './scenes.js';
import {validateDialogueChoices} from './dialogue-choices.js';

export const MAP_FORMAT = 1;
export const TERRAIN = {'.': 'void', g: 'ground', p: 'path', w: 'water', t: 'tallgrass'};
export const LANDMARK_KINDS = ['cottage', 'ranger', 'shrine', 'chest', 'sign'];
export const MAX_SIZE = 128;
export const MAX_CELLS = 16_384;
const MAX_MAP_ENTITIES = 8_192;

const blocksTerrain = t => t === 'void' || t === 'water';

/**
 * Can feet with a PLAYER_RADIUS footprint stand at (x, y)? Terrain is sampled at the four corners of the footprint and
 * solid props are circles. Used by the game and by map validation, so what validates is what can be walked.
 */
export function walkableAt(map, x, y, objectsByCell, maxSolid = 0) {
  const r = PLAYER_RADIUS;
  for (const [dx, dy] of [
    [-r, -r],
    [r, -r],
    [-r, r],
    [r, r],
  ])
    if (blocksTerrain(map.terrainAt(Math.round(x + dx), Math.round(y + dy)))) return false;
  if (!objectsByCell) return !map.objects.some(o => o.solid && Math.hypot(x - o.x, y - o.y) < o.solid + r);
  const extent = maxSolid + r;
  for (let cy = Math.max(0, Math.floor(y - extent)); cy <= Math.min(map.size.h - 1, Math.floor(y + extent)); cy++) {
    for (let cx = Math.max(0, Math.floor(x - extent)); cx <= Math.min(map.size.w - 1, Math.floor(x + extent)); cx++) {
      if ((objectsByCell.get(`${cx},${cy}`) ?? []).some(o => o.solid && Math.hypot(x - o.x, y - o.y) < o.solid + r)) return false;
    }
  }
  return true;
}
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FLAG = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.(seal|chest)$/;
const isPoint = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Checks raw map JSON against the format and cross-references.
 * @param {object[]} rawMaps every map in the adventure
 * @param {{spriteNames:Set<string>, speciesIds:Set<string>}} ctx
 * @returns {string[]} human-readable errors, each prefixed with the map and field
 */
export function validateMaps(rawMaps, ctx) {
  const errors = [];
  const byId = new Map();
  for (const m of rawMaps) {
    if (!isObj(m) || typeof m.id !== 'string' || !ID.test(m.id)) errors.push(`map ${JSON.stringify(m?.id)}: id must be lowercase-kebab-case`);
    else if (byId.has(m.id)) errors.push(`map ${m.id}: duplicate id`);
    else byId.set(m.id, m);
  }
  for (const m of rawMaps) if (isObj(m) && byId.get(m.id) === m) validateOne(m, byId, ctx, errors);
  if (!errors.length) {
    for (const m of rawMaps) {
      const compiled = compileMap(m, {
        spriteIndex: n => [...ctx.spriteNames].indexOf(n),
        speciesIndex: id => [...ctx.speciesIds].indexOf(id),
        mapById: byId,
        regionIndex: () => 0,
      });
      checkPlayable(compiled, byId, errors);
    }
  }
  return errors;
}

function validateOne(m, byId, ctx, errors) {
  const at = (where, msg) => errors.push(`map ${m.id}: ${where}: ${msg}`);
  if (m.format !== MAP_FORMAT) at('format', `expected ${MAP_FORMAT}, got ${JSON.stringify(m.format)}`);
  const collections = ['landmarks', 'exits', 'props', 'zones', 'triggers'];
  const malformed = collections.filter(key => m[key] !== undefined && !Array.isArray(m[key]));
  if (malformed.length) {
    for (const key of malformed) at(key, 'must be an array');
    return;
  }
  if (typeof m.name !== 'string' || !m.name) at('name', 'required');
  const w = m.size?.w,
    h = m.size?.h;
  const boundedSize = Number.isInteger(w) && Number.isInteger(h) && w >= 4 && h >= 4 && w <= MAX_SIZE && h <= MAX_SIZE && w * h <= MAX_CELLS;
  if (!boundedSize) at('size', `w/h must be integers in 4..${MAX_SIZE} with no more than ${MAX_CELLS} total tiles`);
  if (!boundedSize) return;
  const entityCount = (m.landmarks?.length ?? 0) + (m.exits?.length ?? 0) + (m.props?.length ?? 0) + (m.zones?.length ?? 0) + (m.triggers?.length ?? 0);
  if (entityCount > MAX_MAP_ENTITIES || (m.props ?? []).some(g => (g?.at?.length ?? 0) > MAX_CELLS))
    return at('content', `map content is bounded to ${MAX_MAP_ENTITIES} entities and ${MAX_CELLS} prop positions`);
  const legend = isObj(m.legend) ? m.legend : TERRAIN;
  for (const [ch, name] of Object.entries(legend)) if (TERRAIN[ch] !== name) at(`legend.${ch}`, `unknown terrain "${name}" (use ${JSON.stringify(TERRAIN)})`);
  if (!Array.isArray(m.terrain) || (Number.isInteger(h) && m.terrain.length !== h)) at('terrain', `needs exactly ${h} rows`);
  else {
    m.terrain.forEach((row, y) => {
      if (typeof row !== 'string' || (Number.isInteger(w) && row.length !== w)) at(`terrain[${y}]`, `row must be a string of ${w} characters`);
      else
        for (const ch of row)
          if (!(ch in TERRAIN)) {
            at(`terrain[${y}]`, `unknown terrain character "${ch}"`);
            break;
          }
    });
  }
  const inside = p => isPoint(p) && p[0] >= 0 && p[1] >= 0 && p[0] < w && p[1] < h;
  const sprite = (where, name) => {
    if (!ctx.spriteNames.has(name)) at(where, `unknown sprite "${name}" (not in asset manifest)`);
  };
  const flag = (where, f) => {
    const hit = typeof f === 'string' && FLAG.exec(f);
    if (!hit) at(where, `flag "${f}" must look like <map-id>.seal or <map-id>.chest`);
    else if (!byId.has(hit[1])) at(where, `flag "${f}" references unknown map "${hit[1]}"`);
  };
  const species = (where, id) => {
    if (!ctx.speciesIds.has(id)) at(where, `unknown species "${id}"`);
  };

  if (!isObj(m.spawns) || !isPoint(m.spawns.camp) || !inside(m.spawns.camp)) at('spawns.camp', 'a "camp" spawn [x, y] inside the map is required');
  else for (const [name, p] of Object.entries(m.spawns)) if (!inside(p)) at(`spawns.${name}`, 'must be [x, y] inside the map');

  const ids = new Set();
  const landmarkIds = new Set((m.landmarks ?? []).map(landmark => landmark?.id).filter(id => typeof id === 'string'));
  const routeEventIds = new Set();
  (m.landmarks ?? []).forEach((l, i) => {
    const where = `landmarks[${i}] (${l?.id})`;
    if (!isObj(l) || typeof l.id !== 'string') return at(`landmarks[${i}]`, 'id required');
    if (ids.has(l.id)) at(where, 'duplicate landmark/exit id');
    ids.add(l.id);
    if (!LANDMARK_KINDS.includes(l.kind)) at(where, `kind must be one of ${LANDMARK_KINDS.join(', ')}`);
    sprite(where + '.sprite', l.sprite);
    if (!inside(l.at)) at(where + '.at', 'must be [x, y] inside the map');
    if (!(l.w > 0)) at(where + '.w', 'sprite width must be positive');
    if (l.solid !== undefined && !(Number.isFinite(l.solid) && l.solid > 0 && l.solid <= 16))
      at(where + '.solid', 'collision radius must be greater than 0 and at most 16 tiles');
    if (l.flag !== undefined) flag(where + '.flag', l.flag);
    if (l.kind === 'shrine') {
      if (!isObj(l.guardian)) at(where + '.guardian', 'shrines need { species, level }');
      else {
        species(where + '.guardian.species', l.guardian.species);
        if (!Number.isInteger(l.guardian.level) || l.guardian.level < 1 || l.guardian.level > 99) at(where + '.guardian.level', 'integer 1..99');
        if (l.guardian.power !== undefined && !(l.guardian.power >= 0.5 && l.guardian.power <= 3))
          at(where + '.guardian.power', 'damage multiplier between 0.5 and 3 (default 1)');
        if (l.guardian.tactic !== undefined && !Object.hasOwn(TACTICS, l.guardian.tactic))
          at(where + '.guardian.tactic', `unknown tactic "${l.guardian.tactic}" (known: ${Object.keys(TACTICS).join(', ')})`);
      }
      if (typeof l.flag !== 'string') at(where + '.flag', 'shrines need the milestone flag they complete');
      if (!isObj(l.reward) || !['coins', 'potions', 'xp'].every(k => Number.isInteger(l.reward[k]) && l.reward[k] >= 0))
        at(where + '.reward', 'shrines need { coins, potions, xp } (whole numbers) paid once when the seal is earned');
    }
    if (l.kind === 'chest') {
      if (typeof l.flag !== 'string') at(where + '.flag', 'chests need a persistence flag so opening them is remembered');
      if (!isObj(l.reward)) at(where + '.reward', 'chests need { coins, potions, orbs }');
    }
    if (l.kind === 'sign' && typeof l.text !== 'string' && !Array.isArray(l.lines)) at(where + '.text', 'signs need text (or lines)');
    if (l.lines !== undefined) errors.push(...validateLines(l.lines, `map ${m.id}: ${where}`, {mapIds: new Set(byId.keys())}));
    if (l.choices !== undefined)
      errors.push(
        ...validateDialogueChoices(l.choices, {speakerIds: landmarkIds, targetIds: landmarkIds, mapIds: new Set(byId.keys())}).map(
          error => `${where}: ${error}`,
        ),
      );
    if (l.tag !== undefined && (typeof l.tag !== 'string' || l.tag.length > 16)) at(where + '.tag', 'tag is a short label (up to 16 characters)');
    if (l.secret !== undefined && typeof l.secret !== 'boolean') at(where + '.secret', 'true (hidden from the maps until found nearby) or false');
    if (l.mapLabel !== undefined && (typeof l.mapLabel !== 'string' || !l.mapLabel || l.mapLabel.length > 24))
      at(where + '.mapLabel', 'the name shown on maps (1-24 characters)');
  });
  (m.exits ?? []).forEach((e, i) => {
    const where = `exits[${i}] (${e?.id})`;
    if (!isObj(e) || typeof e.id !== 'string') return at(`exits[${i}]`, 'id required');
    if (ids.has(e.id)) at(where, 'duplicate landmark/exit id');
    ids.add(e.id);
    sprite(where + '.sprite', e.sprite);
    if (!inside(e.at)) at(where + '.at', 'must be [x, y] inside the map');
    const target = byId.get(e.to?.map);
    if (!target) at(where + '.to.map', `unknown map "${e.to?.map}"`);
    else if (!isPoint(target.spawns?.[e.to.spawn])) at(where + '.to.spawn', `map "${e.to.map}" has no spawn "${e.to.spawn}"`);
    if (e.requires !== undefined) flag(where + '.requires', e.requires);
    if (e.route !== undefined) {
      const route = e.route;
      if (!isObj(route)) at(where + '.route', 'must be an optional companion route object');
      else {
        if (!ID.test(route.id ?? '')) at(where + '.route.id', 'needs a stable lowercase ID');
        else if (routeEventIds.has(`route-${route.id}`)) at(where + '.route.id', 'duplicates another route unlock ID in this map');
        else routeEventIds.add(`route-${route.id}`);
        if (!isObj(route.requires) || typeof route.requires.ability !== 'string' || !ID.test(route.requires.ability))
          at(where + '.route.requires', 'needs a stable ability ID and optional habitat ID');
        else if (route.requires.habitat !== undefined && (typeof route.requires.habitat !== 'string' || !ID.test(route.requires.habitat)))
          at(where + '.route.requires.habitat', 'must be a stable lowercase ID');
        if (typeof route.hint !== 'string' || !route.hint.trim() || route.hint.length > 240)
          at(where + '.route.hint', 'needs a short player-facing explanation (1–240 characters)');
        if (typeof route.unlockedText !== 'string' || !route.unlockedText.trim() || route.unlockedText.length > 240)
          at(where + '.route.unlockedText', 'needs a short discovery message (1–240 characters)');
        if (!isObj(route.reward) || !Object.keys(route.reward).length || Object.keys(route.reward).some(key => !['coins', 'potions', 'orbs'].includes(key)))
          at(where + '.route.reward', 'needs a non-empty coins, potions or orbs reward');
        else
          for (const [key, value] of Object.entries(route.reward))
            if (!Number.isInteger(value) || value < 0 || value > 999) at(where + `.route.reward.${key}`, 'must be an integer from 0 to 999');
      }
    }
  });
  (m.props ?? []).forEach((g, i) => {
    const where = `props[${i}]`;
    sprite(where + '.sprite', g?.sprite);
    if (!Array.isArray(g?.at) || !g.at.every(inside)) at(where + '.at', 'must be a list of [x, y] points inside the map');
    if (!(g?.w > 0)) at(where + '.w', 'sprite width must be positive');
    if (g?.solid !== undefined && !(Number.isFinite(g.solid) && g.solid > 0 && g.solid <= 16))
      at(where + '.solid', 'collision radius must be greater than 0 and at most 16 tiles');
    if (!['scenery', 'grass', 'flower'].includes(g?.kind)) at(where + '.kind', 'must be scenery, grass or flower');
  });
  (m.zones ?? []).forEach((z, i) => {
    const where = `zones[${i}] (${z?.id})`;
    if (!Array.isArray(z?.terrain) || !z.terrain.every(ch => ch in TERRAIN && ch !== '.')) at(where + '.terrain', 'list of terrain characters (not ".")');
    if (!Array.isArray(z?.pool) || !z.pool.length) at(where + '.pool', 'needs at least one species');
    else
      z.pool.forEach(entry => {
        const id = typeof entry === 'string' ? entry : entry?.species;
        species(where + '.pool', id);
        if (typeof entry === 'object' && entry !== null && !(Number.isFinite(entry.weight) && entry.weight > 0 && entry.weight <= 100))
          at(where + '.pool', `weight for "${id}" must be a number above 0 and at most 100`);
      });
    if (
      z?.distance !== undefined &&
      !(
        Array.isArray(z.distance) &&
        z.distance.length === 2 &&
        z.distance.every(Number.isFinite) &&
        z.distance[0] >= 1 &&
        z.distance[1] >= z.distance[0] &&
        z.distance[1] <= 40
      )
    )
      at(where + '.distance', '[min, max] tiles of walking in this zone between encounters (1 <= min <= max <= 40, default [4, 7])');
    if (!Array.isArray(z?.level) || z.level.length !== 2 || !z.level.every(Number.isInteger) || z.level[0] < 1 || z.level[1] < z.level[0] || z.level[1] > 99)
      at(where + '.level', '[min, max] integers, 1 <= min <= max <= 99');
    if (z?.rect !== undefined && !(Array.isArray(z.rect) && z.rect.length === 4 && z.rect.every(Number.isFinite))) at(where + '.rect', '[x0, y0, x1, y1]');
  });
  const quietIds = new Set();
  (m.quiet ?? []).forEach((q, i) => {
    const where = `quiet[${i}] (${q?.id})`;
    if (typeof q?.id !== 'string' || !ID.test(q.id)) at(where, 'id required (lowercase-kebab-case)');
    else if (quietIds.has(q.id)) at(where, 'duplicate quiet area id');
    else quietIds.add(q.id);
    const r = q?.rect;
    if (!Array.isArray(r) || r.length !== 4 || !r.every(Number.isFinite) || r[0] > r[2] || r[1] > r[3] || r[0] < 0 || r[1] < 0 || r[2] > w || r[3] > h)
      at(where + '.rect', `[x0, y0, x1, y1] inside the map (0..${w}, 0..${h}) with x0 <= x1 and y0 <= y1`);
    if (q?.label !== undefined && (typeof q.label !== 'string' || q.label.length > 24)) at(where + '.label', 'a short name (up to 24 characters)');
  });
  const sceneEventIds = new Set();
  (m.triggers ?? []).forEach((t, i) => {
    const where = `triggers[${i}] (${t?.id})`;
    if (!inside(t?.at)) at(where + '.at', 'must be [x, y] inside the map');
    if (!['enter', 'interact'].includes(t?.on)) at(where + '.on', 'enter or interact');
    const hasEvents = Array.isArray(t?.events) && t.events.length > 0;
    if (t?.do === undefined && hasEvents) {
      /* a trigger may consist only of scene events */
    } else if (!Array.isArray(t?.do) || !t.do.length) at(where + '.do', 'needs at least one action (or scene events)');
    else
      t.do.forEach((a, j) => {
        if (a?.type === 'toast') {
          if (typeof a.text !== 'string') at(`${where}.do[${j}]`, 'toast needs text');
        } else if (a?.type === 'battle') {
          species(`${where}.do[${j}].species`, a.species);
          if (!Number.isInteger(a.level) || a.level < 1 || a.level > 99) at(`${where}.do[${j}].level`, 'integer 1..99');
        } else at(`${where}.do[${j}]`, 'action type must be "toast" or "battle"');
      });
    (t.events ?? []).forEach((event, j) => {
      errors.push(
        ...validateSceneEvent(event, {
          speciesIds: ctx.speciesIds,
          speakerIds: new Set((m.landmarks ?? []).map(landmark => landmark.id)),
          mapId: m.id,
          mapIds: new Set(byId.keys()),
          where: `${where}.events[${j}]`,
        }),
      );
      if (sceneEventIds.has(event?.id)) errors.push(`${where}.events[${j}].id: duplicate scene event id "${event.id}" in map ${m.id}`);
      if (routeEventIds.has(event?.id)) errors.push(`${where}.events[${j}].id: conflicts with a companion route unlock ID in map ${m.id}`);
      sceneEventIds.add(event?.id);
      if (event?.actions?.some(action => action.type === 'challenge') && t.on !== 'interact')
        errors.push(`${where}.events[${j}]: challenges must use an interact trigger`);
    });
  });
}

/** Builds the runtime shape. Input must already be valid. */
export function compileMap(m, {spriteIndex, speciesIndex, mapById, regionIndex}) {
  const rows = m.terrain;
  const terrainAt = (x, y) => (rows[y]?.[x] !== undefined ? TERRAIN[rows[y][x]] : 'void');
  const tiles = [];
  for (let y = 0; y < m.size.h; y++) {
    for (let x = 0; x < m.size.w; x++) {
      const t = terrainAt(x, y);
      if (t !== 'void') tiles.push({x, y, water: t === 'water', path: t === 'path', grass: t === 'tallgrass'});
    }
  }
  const objects = [];
  const mk = (src, kind, extra = {}) => ({
    x: src.at[0],
    y: src.at[1],
    id: spriteIndex(src.sprite),
    w: src.w,
    kind,
    ...(src.solid ? {solid: src.solid} : {}),
    ...extra,
  });
  for (const g of m.props ?? []) for (const at of g.at) objects.push(mk({...g, at}, g.kind));
  const landmarks = (m.landmarks ?? []).map(l =>
    mk(l, l.kind, {
      ref: l.id,
      label: l.label,
      name: l.name,
      flag: l.flag,
      text: l.text,
      lines: l.lines,
      choices: l.choices,
      tag: l.tag,
      secret: l.secret === true,
      mapLabel: l.mapLabel,
      reward: l.reward,
      guardian: l.guardian && {id: speciesIndex(l.guardian.species), level: l.guardian.level, tactic: l.guardian.tactic, power: l.guardian.power},
    }),
  );
  const exits = (m.exits ?? []).map(e => {
    const target = mapById?.get(e.to.map);
    return mk(e, 'gate', {
      ref: e.id,
      label: e.label,
      target: e.to.map,
      targetRegion: target ? regionIndex(target.biome) : 0,
      targetName: target?.name ?? e.to.map,
      spawn: e.to.spawn,
      requires: e.requires,
      route: e.route,
    });
  });
  objects.push(...landmarks, ...exits);
  objects.sort((a, b) => a.x + a.y - b.x - b.y);
  const spawns = Object.fromEntries(Object.entries(m.spawns).map(([k, p]) => [k, {x: p[0], y: p[1]}]));
  const zones = (m.zones ?? []).map(z => ({
    id: z.id,
    terrain: z.terrain.map(ch => TERRAIN[ch]),
    rect: z.rect,
    pool: z.pool.map(e => speciesIndex(typeof e === 'string' ? e : e.species)),
    weights: z.pool.map(e => (typeof e === 'string' ? 1 : e.weight)),
    level: z.level,
    distance: z.distance ?? [4, 7],
  }));
  const triggers = (m.triggers ?? []).map(t => ({
    id: t.id,
    x: t.at[0],
    y: t.at[1],
    radius: t.radius ?? 1.5,
    on: t.on,
    once: t.once !== false,
    actions: (t.do ?? []).map(a => (a.type === 'battle' ? {type: 'battle', id: speciesIndex(a.species), level: a.level} : a)),
    events: t.events?.map(event => ({
      ...event,
      actions: event.actions.map(action => (action.type === 'challenge' ? {...action, species: speciesIndex(action.species)} : action)),
    })),
  }));
  const quiet = (m.quiet ?? []).map(q => ({id: q.id, rect: q.rect, label: q.label}));
  return {id: m.id, biome: m.biome, name: m.name, size: m.size, terrainAt, tiles, objects, spawns, zones, triggers, quiet};
}

/** Semantic checks that need the compiled map: spawn safety, exits on land, reachable goals. */
function checkPlayable(map, byId, errors) {
  const at = (where, msg) => errors.push(`map ${map.id}: ${where}: ${msg}`);
  const solidsByCell = new Map();
  let maxSolid = 0;
  for (const object of map.objects) {
    const key = `${Math.floor(object.x)},${Math.floor(object.y)}`;
    const cell = solidsByCell.get(key) ?? [];
    cell.push(object);
    solidsByCell.set(key, cell);
    maxSolid = Math.max(maxSolid, object.solid ?? 0);
  }
  const walkable = (x, y) => walkableAt(map, x, y, solidsByCell, maxSolid);
  const camp = map.spawns.camp;
  if (!walkable(camp.x, camp.y)) return at('spawns.camp', `spawn (${camp.x}, ${camp.y}) is not walkable`);
  for (const [name, p] of Object.entries(map.spawns)) if (!walkable(p.x, p.y)) at(`spawns.${name}`, `spawn (${p.x}, ${p.y}) is not walkable`);
  // Flood-fill walkable tiles from the camp spawn.
  const seen = new Set([`${Math.round(camp.x)},${Math.round(camp.y)}`]);
  const queue = [[Math.round(camp.x), Math.round(camp.y)]];
  while (queue.length) {
    const [x, y] = queue.pop();
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const key = `${x + dx},${y + dy}`;
      if (!seen.has(key) && walkable(x + dx, y + dy)) {
        seen.add(key);
        queue.push([x + dx, y + dy]);
      }
    }
  }
  const reachable = o =>
    [...seen].some(k => {
      const [x, y] = k.split(',').map(Number);
      return Math.hypot(x - o.x, y - o.y) < 1.9;
    });
  for (const o of map.objects) {
    if (!['ranger', 'shrine', 'chest', 'sign', 'gate'].includes(o.kind)) continue;
    if (map.terrainAt(Math.round(o.x), Math.round(o.y)) === 'void') at(`${o.kind} "${o.ref}"`, `placed off the island at (${o.x}, ${o.y})`);
    else if (!reachable(o)) at(`${o.kind} "${o.ref}"`, `cannot be reached from the camp spawn (${camp.x}, ${camp.y})`);
  }
  for (const z of map.zones) {
    const has = [...seen].some(k => {
      const [x, y] = k.split(',').map(Number);
      return zoneMatches(z, map.terrainAt(x, y), x, y);
    });
    if (!has) at(`zone "${z.id}"`, 'covers no tiles the player can reach');
  }
  if (!byId.size) at('set', 'no maps');
}

export function zoneMatches(zone, terrain, x, y) {
  if (!zone.terrain.includes(terrain)) return false;
  return !zone.rect || (x >= zone.rect[0] && y >= zone.rect[1] && x <= zone.rect[2] && y <= zone.rect[3]);
}
