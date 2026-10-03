/* Adventure pack manifest (maps/index.json): which maps, creatures and milestones make up one adventure.
   Pure validation; the pack is data on top of the shared systems. Guide: docs/PACKS.md. */
export const PACK_FORMAT = 1;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FLAG = /^[a-z0-9]+(?:-[a-z0-9]+)*\.(seal|chest)$/;

/**
 * @param {object} raw parsed index.json
 * @param {{packId?: string, speciesIds: Set<string>}} ctx `packId` is the adventure this build's content belongs to
 * @returns {string[]} errors, each prefixed with `pack`
 */
export function validatePack(raw, {packId, speciesIds}) {
  const errors = [];
  const at = (where, msg) => errors.push(`pack ${where}: ${msg}`);
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return ['pack: index.json must be an object'];
  if (raw.format !== PACK_FORMAT) at('format', `expected ${PACK_FORMAT}, got ${JSON.stringify(raw.format)}`);
  if (typeof raw.id !== 'string' || !ID.test(raw.id)) at('id', 'lowercase-kebab-case id required (saves record it, so it never changes)');
  else if (packId !== undefined && raw.id !== packId) at('id', `"${raw.id}" is not the adventure this game's content and saves are built for ("${packId}")`);
  if (typeof raw.name !== 'string' || !raw.name) at('name', 'required');
  if (typeof raw.brief !== 'string' || !raw.brief) at('brief', 'a one-line description is required');
  if (raw.contentVersion !== undefined && (!Number.isInteger(raw.contentVersion) || raw.contentVersion < 1)) at('contentVersion', 'must be a positive integer');
  if (raw.registries !== undefined && (typeof raw.registries !== 'string' || !/^[a-z0-9-]+\.json$/.test(raw.registries)))
    at('registries', 'must name a JSON file in the pack folder');
  if (raw.mapDirectory !== undefined && (typeof raw.mapDirectory !== 'string' || !/^[a-z0-9-]+\/$/.test(raw.mapDirectory)))
    at('mapDirectory', 'must be a relative folder name ending with /');
  for (const key of ['objectives', 'story'])
    if (raw[key] !== undefined && (typeof raw[key] !== 'string' || !/^[a-z0-9-]+\.json$/.test(raw[key]))) at(key, 'must name a JSON file in the pack folder');
  if (!Array.isArray(raw.maps) || !raw.maps.length || !raw.maps.every(id => typeof id === 'string' && ID.test(id))) at('maps', 'a non-empty list of map ids');
  else if (new Set(raw.maps).size !== raw.maps.length) at('maps', 'duplicate map id');
  if (!Array.isArray(raw.species) || !raw.species.length) at('species', 'list the creature ids that can be found in this adventure');
  else {
    for (const id of raw.species) if (!speciesIds.has(id)) at('species', `unknown species "${id}"`);
    if (new Set(raw.species).size !== raw.species.length) at('species', 'duplicate species id');
  }
  if (!Array.isArray(raw.milestones) || !raw.milestones.every(f => typeof f === 'string' && FLAG.test(f)))
    at('milestones', 'the ordered list of flags (<map-id>.seal or <map-id>.chest) that mark progress');
  else if (new Set(raw.milestones).size !== raw.milestones.length) at('milestones', 'duplicate flag');
  if (raw.ending !== undefined && raw.ending !== 'story') at('ending', 'must be "story" (the ending defined in the story file) or omitted');
  return errors;
}

/** The milestones of a valid pack; the order is the order the adventure is meant to be completed in. */
export const milestonesOf = raw => raw?.milestones ?? [];
