/* Turns raw map JSON plus the content registries into validated, compiled maps indexed by region and map id. Pure. */
import {compileMap, validateMaps} from './mapdata.js';
import {expandMapPrefabs} from './prefabs.js';
import {collectFlags, validateObjectives} from './objectives.js';
import {validateStory} from './story.js';
import {validatePack} from './pack.js';
import {validateInventoryRules} from './inventory.js';
import {validateObjectiveEvents} from './objective-events.js';
import {biomes} from '../data/biomes.js';

/**
 * @param {object[]} rawMaps parsed map files
 * @param {{regions: object[]}} content
 * @param {object} [rawObjectives] parsed objectives.json
 * @param {object} [rawStory] parsed story.json
 * @param {object} [rawPack] parsed maps/index.json: the adventure pack manifest (docs/PACKS.md)
 * @param {object} [inventoryRules] pack-owned optional item rules
 * @param {{assets:{name:string}[], species:{id:string}[], regions:{id:string}[], packId?:string}} content
 * @returns {{maps: object[], mapsById: object, errors: string[]}} `maps[i]` is the region hub; mapsById also includes side maps.
 */
export function buildAdventure(rawMaps, {assets, species, regions, packId}, rawObjectives, rawStory, rawPack, inventoryRules) {
  const spriteNames = new Set(assets.map(a => a.name));
  const speciesIds = new Set(species.map(s => s.id));
  const biomeIds = new Set(biomes.map(b => b.id));
  const expansion = expandMapPrefabs(rawMaps, rawPack?.prefabs);
  const maps = expansion.maps;
  const errors = [...expansion.errors, ...validateMaps(maps, {spriteNames, speciesIds, assets})];
  for (const s of species) if (s.biome && !biomeIds.has(s.biome)) errors.push(`species "${s.id}": unknown biome "${s.biome}"`);
  for (const r of regions) if (r.biome && !biomeIds.has(r.biome)) errors.push(`region "${r.id}": unknown biome "${r.biome}"`);
  const ordered = regions.map(r => maps.find(m => m?.id === r.id));
  regions.forEach((r, i) => {
    if (!ordered[i]) errors.push(`region "${r.id}": no map file with this id`);
    else if (r.biome && ordered[i].biome && ordered[i].biome !== r.biome)
      errors.push(`region "${r.id}": map biome "${ordered[i].biome}" does not match region biome "${r.biome}"`);
  });
  for (const m of maps) {
    if (!m?.id) continue;
    if (!regions.some(r => r.id === m.id || (r.biome && r.biome === m.biome)))
      errors.push(`map ${m.id}: no region for biome "${m.biome}" in the pack registry`);
  }
  if (rawObjectives !== undefined) {
    errors.push(...validateObjectives(rawObjectives, {mapIds: new Set(maps.map(m => m?.id))}));
    errors.push(...validateEventObjectives(rawObjectives, maps, speciesIds));
  }
  if (rawStory !== undefined) errors.push(...validateStory(rawStory, {mapIds: new Set(maps.map(m => m?.id))}));
  if (rawPack?.inventory && inventoryRules === undefined) errors.push('pack inventory: the selected inventory rules file was not loaded');
  if (inventoryRules !== undefined) errors.push(...validateInventoryRules(inventoryRules).map(error => `inventory ${error}`));
  if (rawPack !== undefined) {
    errors.push(...validatePack(rawPack, {packId, speciesIds}));
    if (Array.isArray(rawPack?.maps)) {
      for (const id of rawPack.maps) if (!maps.some(m => m?.id === id)) errors.push(`pack maps: "${id}" is listed but no such map was loaded`);
      for (const m of maps) if (m?.id && !rawPack.maps.includes(m.id)) errors.push(`pack maps: map "${m.id}" is loaded but not listed in the pack`);
    }
    if (rawPack?.ending === 'story' && !rawStory?.ending) errors.push('pack ending: the pack refers to the story ending, but the story file defines none');
  }
  if (!errors.length) {
    const available = rawPack?.species ? species.filter(s => rawPack.species.includes(s.id)) : species;
    // Home-biome coverage is a requirement of Mossvale's authored adventure, not
    // of other packs which may reuse a subset of its creatures in their own maps.
    const expectedBiomes = rawPack?.id === 'mossvale' ? biomes : [];
    errors.push(
      ...checkProgression(maps, regions, rawObjectives?.objectives ?? [], rawStory),
      ...checkSources(maps, available, expectedBiomes),
      ...checkPoolsStayInPack(maps, available),
      ...checkMilestoneOrder(maps, regions, rawPack?.milestones),
    );
  }
  if (errors.length) return {maps: [], objectives: [], eventObjectives: [], story: undefined, errors};
  const spriteIndex = name => assets.findIndex(a => a.name === name);
  const speciesIndex = id => species.findIndex(s => s.id === id);
  const regionIndex = biome => {
    const index = regions.findIndex(r => r.biome === biome);
    return index >= 0 ? index : regions.findIndex(r => r.id === biome);
  };
  const mapById = new Map(maps.map(m => [m.id, m]));
  const compile = m => compileMap(m, {spriteIndex, speciesIndex, mapById, regionIndex});
  return {
    maps: ordered.map(compile),
    mapsById: Object.fromEntries(maps.map(m => [m.id, compile(m)])),
    objectives: rawObjectives?.objectives ?? [],
    eventObjectives: rawObjectives?.eventObjectives ?? [],
    story: rawStory,
    errors: [],
  };
}

const EVENT_FIELDS = {
  'interaction.used': new Set(['mapId', 'target', 'kind']),
  'capture.completed': new Set(['species', 'isNew', 'joined']),
  'portal.traveled': new Set(['fromMap', 'toMap', 'spawn']),
  'dialogue.choice': new Set(['mapId', 'speaker', 'target', 'choice']),
  'challenge.started': new Set(['mapId', 'species', 'level', 'boss']),
  'battle.started': new Set(['mapId', 'species', 'level', 'boss']),
};

function validateEventObjectives(rawObjectives, maps, speciesIds) {
  if (rawObjectives?.eventObjectives === undefined) return [];
  const errors = [];
  if (!Array.isArray(rawObjectives.eventObjectives)) return ['eventObjectives: must be a list when present'];
  const mapIds = new Set(maps.map(map => map?.id));
  const landmarkIdsByMap = new Map(maps.map(map => [map?.id, new Set((Array.isArray(map?.landmarks) ? map.landmarks : []).map(landmark => landmark?.id))]));
  const choiceIds = new Set(
    maps.flatMap(map =>
      (Array.isArray(map?.landmarks) ? map.landmarks : []).flatMap(landmark =>
        (Array.isArray(landmark?.choices) ? landmark.choices : []).map(choice => `${map.id}/${choice?.id ?? ''}`),
      ),
    ),
  );
  const objectiveIds = new Set();
  for (const [index, definition] of rawObjectives.eventObjectives.entries()) {
    const where = `eventObjectives[${index}] (${definition?.id ?? 'unknown'})`;
    errors.push(...validateObjectiveEvents(definition).map(error => `${where}: ${error}`));
    if (objectiveIds.has(definition?.id)) errors.push(`${where}: duplicate objective id`);
    objectiveIds.add(definition?.id);
    for (const [stageIndex, stage] of (Array.isArray(definition?.stages) ? definition.stages : []).entries()) {
      const event = stage?.on;
      const at = `${where}.stages[${stageIndex}].on`;
      const fields = EVENT_FIELDS[event?.type];
      if (!fields) {
        errors.push(`${at}.type: unsupported gameplay event "${event?.type ?? ''}"`);
        continue;
      }
      for (const key of Object.keys(event)) if (key !== 'type' && !fields.has(key)) errors.push(`${at}.${key}: not a field of ${event.type}`);
      if (event.mapId !== undefined && !mapIds.has(event.mapId)) errors.push(`${at}.mapId: unknown map "${event.mapId}"`);
      if (event.target !== undefined) {
        const known =
          event.mapId !== undefined ? landmarkIdsByMap.get(event.mapId)?.has(event.target) : [...landmarkIdsByMap.values()].some(ids => ids.has(event.target));
        if (!known) errors.push(`${at}.target: unknown stable landmark id "${event.target}"`);
      }
      if (event.choice !== undefined && !choiceIds.has(`${event.mapId}/${event.choice}`))
        errors.push(`${at}.choice: unknown stable choice id "${event.choice}" for map "${event.mapId ?? ''}"`);
      if (event.speaker !== undefined && !landmarkIdsByMap.get(event.mapId)?.has(event.speaker))
        errors.push(`${at}.speaker: unknown stable speaker id "${event.speaker}" for map "${event.mapId ?? ''}"`);
      if (event.species !== undefined && !speciesIds.has(event.species)) errors.push(`${at}.species: unknown species "${event.species}"`);
      for (const key of ['fromMap', 'toMap']) if (event[key] !== undefined && !mapIds.has(event[key])) errors.push(`${at}.${key}: unknown map "${event[key]}"`);
    }
  }
  return errors;
}

const flagsAwarded = map =>
  [
    ...(map.landmarks ?? []).map(landmark => landmark.flag),
    ...(map.triggers ?? []).flatMap(trigger =>
      (trigger.events ?? [])
        .flatMap(event => event.actions ?? [])
        .filter(action => action.type === 'flag')
        .map(action => action.flag),
    ),
  ].filter(Boolean);

/**
 * Softlock check on the unlock graph: starting from the first region, repeatedly collect the milestone flags of the
 * maps you can reach (their shrines and chests are reachable: maps are validated first) and open the exits whose
 * requirement you hold. Every map must open up, and every flag an objective asks for must be earnable.
 */
function checkProgression(allMaps, regions, objectives, story) {
  const errors = [];
  const byId = new Map(allMaps.map(m => [m.id, m]));
  const reached = new Set([regions[0].id]);
  const flags = new Set();
  for (let changed = true; changed;) {
    changed = false;
    for (const id of [...reached]) {
      const m = byId.get(id);
      for (const flag of flagsAwarded(m)) if (!flags.has(flag)) (flags.add(flag), (changed = true));
      for (const e of m.exits ?? []) if (!reached.has(e.to.map) && (!e.requires || flags.has(e.requires))) (reached.add(e.to.map), (changed = true));
    }
  }
  for (const m of allMaps) {
    if (reached.has(m.id)) continue;
    const needs = [...new Set(allMaps.flatMap(source => (source.exits ?? []).filter(e => e.to.map === m.id && e.requires).map(e => e.requires)))];
    errors.push(
      `progression: map "${m.id}" can never be reached from "${regions[0].id}"${needs.length ? ` (its entrances need ${needs.join(' or ')}, which cannot be earned first)` : ' (no exit leads to it)'}`,
    );
  }
  for (const f of [...collectFlags(objectives), ...collectFlags([{done: story?.ending?.when}])])
    if (!flags.has(f)) errors.push(`progression: objectives ask for "${f}", but no reachable landmark awards it`);
  return errors;
}

/** Every creature must be findable: it has to appear in at least one encounter zone (zones are validated as reachable). */
function checkSources(ordered, species, expectedBiomes = []) {
  const sourced = new Set();
  for (const m of ordered) for (const z of m.zones ?? []) for (const e of z.pool) sourced.add(typeof e === 'string' ? e : e.species);
  const errors = species.filter(s => !sourced.has(s.id)).map(s => `species: "${s.id}" has no encounter zone in any map, so it could never be found`);
  for (const biome of expectedBiomes) {
    const primary = species.filter(s => s.biome === biome.id);
    if (!primary.length) errors.push(`biome "${biome.id}" needs at least one primary species`);
    const biomeMaps = ordered.filter(m => m.biome === biome.id);
    if (!biomeMaps.length) errors.push(`biome "${biome.id}" needs at least one playable map`);
    const pool = new Set(biomeMaps.flatMap(m => (m.zones ?? []).flatMap(z => z.pool.map(e => (typeof e === 'string' ? e : e.species)))));
    for (const s of primary) if (!pool.has(s.id)) errors.push(`species: primary ${biome.id} resident "${s.id}" is missing from ${biome.name} encounters`);
  }
  return errors;
}

/** A pack's creature list is the source of truth: encounter zones and shrine guardians may only use those creatures. */
function checkPoolsStayInPack(ordered, available) {
  const ids = new Set(available.map(s => s.id));
  const errors = [];
  for (const m of ordered) {
    for (const z of m.zones ?? [])
      for (const e of z.pool) {
        const id = typeof e === 'string' ? e : e.species;
        if (!ids.has(id)) errors.push(`pack species: map ${m.id} zone "${z.id}" uses "${id}", which the pack does not list`);
      }
    for (const l of m.landmarks ?? [])
      if (l.guardian && !ids.has(l.guardian.species))
        errors.push(`pack species: map ${m.id} guardian "${l.id}" uses "${l.guardian.species}", which the pack does not list`);
  }
  return errors;
}

/** The pack's milestone order must be playable: each flag is earnable from the maps open after the ones before it. */
function checkMilestoneOrder(allMaps, regions, milestones) {
  if (!milestones?.length) return [];
  const byId = new Map(allMaps.map(m => [m.id, m]));
  const errors = [];
  const held = new Set();
  for (const flag of milestones) {
    const reached = new Set([regions[0].id]);
    const earnable = new Set();
    for (let changed = true; changed;) {
      changed = false;
      for (const id of [...reached]) {
        const m = byId.get(id);
        for (const f of flagsAwarded(m)) earnable.add(f);
        for (const e of m.exits ?? []) if (!reached.has(e.to.map) && (!e.requires || held.has(e.requires))) (reached.add(e.to.map), (changed = true));
      }
    }
    if (!earnable.has(flag))
      errors.push(`pack milestones: "${flag}" cannot be earned yet when the milestones before it (${[...held].join(', ') || 'none'}) are done`);
    held.add(flag);
  }
  return errors;
}
