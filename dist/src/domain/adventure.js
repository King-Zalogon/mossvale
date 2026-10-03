/* Turns raw map JSON plus the content registries into validated, compiled maps indexed by region and map id. Pure. */
import {compileMap, validateMaps} from './mapdata.js';
import {collectFlags, validateObjectives} from './objectives.js';
import {validateStory} from './story.js';
import {validatePack} from './pack.js';
import {biomes} from '../data/biomes.js';

/**
 * @param {object[]} rawMaps parsed map files
 * @param {{regions: object[]}} content
 * @param {object} [rawObjectives] parsed objectives.json
 * @param {object} [rawStory] parsed story.json
 * @param {object} [rawPack] parsed maps/index.json: the adventure pack manifest (docs/PACKS.md)
 * @param {{assets:{name:string}[], species:{id:string}[], regions:{id:string}[], packId?:string}} content
 * @returns {{maps: object[], mapsById: object, errors: string[]}} `maps[i]` is the region hub; mapsById also includes side maps.
 */
export function buildAdventure(rawMaps, {assets, species, regions, packId}, rawObjectives, rawStory, rawPack) {
  const spriteNames = new Set(assets.map(a => a.name));
  const speciesIds = new Set(species.map(s => s.id));
  const biomeIds = new Set(biomes.map(b => b.id));
  const errors = validateMaps(rawMaps, {spriteNames, speciesIds});
  for (const s of species) if (!biomeIds.has(s.biome)) errors.push(`species "${s.id}": unknown biome "${s.biome}"`);
  for (const r of regions) if (!biomeIds.has(r.biome)) errors.push(`region "${r.id}": unknown biome "${r.biome}"`);
  const ordered = regions.map(r => rawMaps.find(m => m?.id === r.id));
  regions.forEach((r, i) => {
    if (!ordered[i]) errors.push(`region "${r.id}": no map file with this id`);
    else if (ordered[i].biome !== r.biome) errors.push(`region "${r.id}": map biome "${ordered[i].biome}" does not match region biome "${r.biome}"`);
  });
  for (const m of rawMaps) {
    if (!m?.id) continue;
    if (!regions.some(r => r.biome === m.biome)) errors.push(`map ${m.id}: no region for biome "${m.biome}" in data/regions.js`);
  }
  if (rawObjectives !== undefined) {
    errors.push(...validateObjectives(rawObjectives, {mapIds: new Set(rawMaps.map(m => m?.id))}));
  }
  if (rawStory !== undefined) errors.push(...validateStory(rawStory, {mapIds: new Set(rawMaps.map(m => m?.id))}));
  if (rawPack !== undefined) {
    errors.push(...validatePack(rawPack, {packId, speciesIds}));
    if (Array.isArray(rawPack?.maps)) {
      for (const id of rawPack.maps) if (!rawMaps.some(m => m?.id === id)) errors.push(`pack maps: "${id}" is listed but no such map was loaded`);
      for (const m of rawMaps) if (m?.id && !rawPack.maps.includes(m.id)) errors.push(`pack maps: map "${m.id}" is loaded but not listed in the pack`);
    }
    if (rawPack?.ending === 'story' && !rawStory?.ending) errors.push('pack ending: the pack refers to the story ending, but the story file defines none');
  }
  if (!errors.length) {
    const available = rawPack?.species ? species.filter(s => rawPack.species.includes(s.id)) : species;
    errors.push(
      ...checkProgression(rawMaps, regions, rawObjectives?.objectives ?? [], rawStory),
      ...checkSources(rawMaps, available, available.length === species.length ? biomes : []),
      ...checkPoolsStayInPack(rawMaps, available),
      ...checkMilestoneOrder(rawMaps, regions, rawPack?.milestones),
    );
  }
  if (errors.length) return {maps: [], objectives: [], story: undefined, errors};
  const spriteIndex = name => assets.findIndex(a => a.name === name);
  const speciesIndex = id => species.findIndex(s => s.id === id);
  const regionIndex = biome => regions.findIndex(r => r.biome === biome);
  const mapById = new Map(rawMaps.map(m => [m.id, m]));
  const compile = m => compileMap(m, {spriteIndex, speciesIndex, mapById, regionIndex});
  return {
    maps: ordered.map(compile),
    mapsById: Object.fromEntries(rawMaps.map(m => [m.id, compile(m)])),
    objectives: rawObjectives?.objectives ?? [],
    story: rawStory,
    errors: [],
  };
}

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
      for (const l of m.landmarks ?? []) if (l.flag && !flags.has(l.flag)) (flags.add(l.flag), (changed = true));
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
function checkSources(ordered, species, biomes) {
  const sourced = new Set();
  for (const m of ordered) for (const z of m.zones ?? []) for (const e of z.pool) sourced.add(typeof e === 'string' ? e : e.species);
  const errors = species.filter(s => !sourced.has(s.id)).map(s => `species: "${s.id}" has no encounter zone in any map, so it could never be found`);
  for (const biome of biomes) {
    const primary = species.filter(s => s.biome === biome.id);
    if (primary.length !== 3) errors.push(`biome "${biome.id}" needs exactly three primary species, found ${primary.length}`);
    const biomeMaps = ordered.filter(m => m.biome === biome.id);
    if (!biomeMaps.length) errors.push(`biome "${biome.id}" needs at least one playable map`);
    const pool = new Set(biomeMaps.flatMap(m => m.zones.flatMap(z => z.pool.map(e => (typeof e === 'string' ? e : e.species)))));
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
        for (const l of m.landmarks ?? []) if (l.flag) earnable.add(l.flag);
        for (const e of m.exits ?? []) if (!reached.has(e.to.map) && (!e.requires || held.has(e.requires))) (reached.add(e.to.map), (changed = true));
      }
    }
    if (!earnable.has(flag))
      errors.push(`pack milestones: "${flag}" cannot be earned yet when the milestones before it (${[...held].join(', ') || 'none'}) are done`);
    held.add(flag);
  }
  return errors;
}
