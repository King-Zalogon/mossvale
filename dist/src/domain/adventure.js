/* Turns raw map JSON plus the content registries into validated, compiled maps indexed by region. Pure. */
import {compileMap, validateMaps} from './mapdata.js';

/**
 * @param {object[]} rawMaps parsed map files
 * @param {{assets:{name:string}[], species:{id:string}[], regions:{id:string}[]}} content
 * @returns {{maps: object[], errors: string[]}} `maps[i]` belongs to `regions[i]`; empty when errors exist
 */
export function buildAdventure(rawMaps, {assets, species, regions}) {
  const spriteNames = new Set(assets.map(a => a.name));
  const speciesIds = new Set(species.map(s => s.id));
  const errors = validateMaps(rawMaps, {spriteNames, speciesIds});
  const ordered = regions.map(r => rawMaps.find(m => m?.id === r.id));
  regions.forEach((r, i) => {
    if (!ordered[i]) errors.push(`region "${r.id}": no map file with this id`);
  });
  for (const m of rawMaps) if (m?.id && !regions.some(r => r.id === m.id)) errors.push(`map ${m.id}: no region with this id in data/regions.js`);
  if (errors.length) return {maps: [], errors};
  const spriteIndex = name => assets.findIndex(a => a.name === name);
  const speciesIndex = id => species.findIndex(s => s.id === id);
  const regionIndex = id => regions.findIndex(r => r.id === id);
  return {maps: ordered.map(m => compileMap(m, {spriteIndex, speciesIndex, regionIndex})), errors: []};
}
