/* Turns raw map JSON plus the content registries into validated, compiled maps indexed by region. Pure. */
import {compileMap, validateMaps} from './mapdata.js';
import {collectFlags, validateObjectives} from './objectives.js';

/**
 * @param {object[]} rawMaps parsed map files
 * @param {{regions: object[]}} content
 * @param {object} [rawObjectives] parsed objectives.json
 * @param {{assets:{name:string}[], species:{id:string}[], regions:{id:string}[]}} content
 * @returns {{maps: object[], errors: string[]}} `maps[i]` belongs to `regions[i]`; empty when errors exist
 */
export function buildAdventure(rawMaps, {assets, species, regions}, rawObjectives) {
  const spriteNames = new Set(assets.map(a => a.name));
  const speciesIds = new Set(species.map(s => s.id));
  const errors = validateMaps(rawMaps, {spriteNames, speciesIds});
  const ordered = regions.map(r => rawMaps.find(m => m?.id === r.id));
  regions.forEach((r, i) => {
    if (!ordered[i]) errors.push(`region "${r.id}": no map file with this id`);
  });
  for (const m of rawMaps) if (m?.id && !regions.some(r => r.id === m.id)) errors.push(`map ${m.id}: no region with this id in data/regions.js`);
  if (rawObjectives !== undefined) {
    errors.push(...validateObjectives(rawObjectives, {mapIds: new Set(rawMaps.map(m => m?.id))}));
  }
  if (!errors.length) errors.push(...checkProgression(ordered, regions, rawObjectives?.objectives ?? []), ...checkSources(ordered, species));
  if (errors.length) return {maps: [], objectives: [], errors};
  const spriteIndex = name => assets.findIndex(a => a.name === name);
  const speciesIndex = id => species.findIndex(s => s.id === id);
  const regionIndex = id => regions.findIndex(r => r.id === id);
  return {maps: ordered.map(m => compileMap(m, {spriteIndex, speciesIndex, regionIndex})), objectives: rawObjectives?.objectives ?? [], errors: []};
}

/**
 * Softlock check on the unlock graph: starting from the first region, repeatedly collect the milestone flags of the
 * maps you can reach (their shrines and chests are reachable: maps are validated first) and open the exits whose
 * requirement you hold. Every map must open up, and every flag an objective asks for must be earnable.
 */
function checkProgression(ordered, regions, objectives) {
  const errors = [];
  const byId = new Map(ordered.map(m => [m.id, m]));
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
  for (const r of regions) {
    if (reached.has(r.id)) continue;
    const needs = [...new Set(ordered.flatMap(m => (m.exits ?? []).filter(e => e.to.map === r.id && e.requires).map(e => e.requires)))];
    errors.push(
      `progression: map "${r.id}" can never be reached from "${regions[0].id}"${needs.length ? ` (its entrances need ${needs.join(' or ')}, which cannot be earned first)` : ' (no exit leads to it)'}`,
    );
  }
  for (const f of collectFlags(objectives)) if (!flags.has(f)) errors.push(`progression: objectives ask for "${f}", but no reachable landmark awards it`);
  return errors;
}

/** Every creature must be findable: it has to appear in at least one encounter zone (zones are validated as reachable). */
function checkSources(ordered, species) {
  const sourced = new Set();
  for (const m of ordered) for (const z of m.zones ?? []) for (const e of z.pool) sourced.add(typeof e === 'string' ? e : e.species);
  return species.filter(s => !sourced.has(s.id)).map(s => `species: "${s.id}" has no encounter zone in any map, so it could never be found`);
}
