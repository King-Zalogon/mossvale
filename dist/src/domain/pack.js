/* Adventure pack manifest (maps/index.json): which maps, creatures and milestones make up one adventure.
   Pure validation; the pack is data on top of the shared systems. Guide: docs/PACKS.md. */
import {ENGINE_VERSION, SAVE_SCHEMA_VERSION} from '../compatibility.js';

export const PACK_FORMAT = 1;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FLAG = /^[a-z0-9]+(?:-[a-z0-9]+)*\.(seal|chest)$/;
const SHA256 = /^[a-f0-9]{64}$/;

/** Canonical, stable IDs and relative paths for every byte file selected by a pack. */
export function packFileEntries(raw) {
  const files = [];
  const registries = raw?.registries ?? 'registries.json';
  if (typeof registries === 'string' && /^[a-z0-9-]+\.json$/.test(registries)) files.push({id: 'registry:main', path: registries});
  if (Array.isArray(raw?.maps) && raw.maps.every(id => typeof id === 'string' && ID.test(id))) {
    const directory = typeof raw.mapDirectory === 'string' && /^[a-z0-9-]+\/$/.test(raw.mapDirectory) ? raw.mapDirectory : '';
    for (const id of raw.maps) files.push({id: `map:${id}`, path: `${directory}${id}.json`});
  }
  for (const key of ['objectives', 'story', 'inventory'])
    if (typeof raw?.[key] === 'string' && /^[a-z0-9-]+\.json$/.test(raw[key])) files.push({id: `${key}:main`, path: raw[key]});
  return files;
}

/** Checks optional authored-pack metadata; shipped/runtime packs make both sections mandatory. */
export function validatePackMetadata(raw, {required = false, engineVersion = ENGINE_VERSION, saveSchema = SAVE_SCHEMA_VERSION} = {}) {
  const errors = [];
  const at = (where, message) => errors.push(`pack ${where}: ${message}`);
  if (required) {
    if (raw?.format !== PACK_FORMAT) at('format', `expected ${PACK_FORMAT}, got ${JSON.stringify(raw?.format)}`);
    if (typeof raw?.id !== 'string' || !ID.test(raw.id)) at('id', 'lowercase-kebab-case id required');
    if (!Number.isInteger(raw?.contentVersion) || raw.contentVersion < 1) at('contentVersion', 'a positive integer is required');
    if (!Array.isArray(raw?.maps) || !raw.maps.length || !raw.maps.every(id => typeof id === 'string' && ID.test(id)))
      at('maps', 'a non-empty list of map IDs is required');
    else if (new Set(raw.maps).size !== raw.maps.length) at('maps', 'duplicate map ID');
  }
  if (required || raw?.requires !== undefined) {
    const req = raw?.requires;
    if (!req || typeof req !== 'object' || Array.isArray(req)) at('requires', 'engineVersion and saveSchema are required');
    else {
      if (req.engineVersion !== engineVersion)
        at('requires.engineVersion', `requires ${JSON.stringify(req.engineVersion)}; this game supports ${engineVersion}`);
      if (req.saveSchema !== saveSchema) at('requires.saveSchema', `requires ${JSON.stringify(req.saveSchema)}; this game supports ${saveSchema}`);
    }
  }
  if (raw?.integrity !== undefined || required) {
    if (!Array.isArray(raw?.integrity)) at('integrity', 'a file hash record is required for every pack file');
    else {
      const expected = packFileEntries(raw);
      const byId = new Map();
      for (const item of raw.integrity) {
        if (!item || typeof item !== 'object' || typeof item.id !== 'string' || typeof item.path !== 'string' || typeof item.sha256 !== 'string') {
          at('integrity', 'each file needs a canonical id, relative path and SHA-256 hash');
          continue;
        }
        if (byId.has(item.id)) at('integrity', `duplicate file id "${item.id}"`);
        byId.set(item.id, item);
        if (!SHA256.test(item.sha256)) at(`integrity.${item.id}`, 'sha256 must be 64 lowercase hexadecimal characters');
      }
      for (const file of expected) {
        const item = byId.get(file.id);
        if (!item) at(`integrity.${file.id}`, `missing hash record for ${file.path}`);
        else if (item.path !== file.path) at(`integrity.${file.id}`, `expected canonical path ${file.path}, got ${item.path}`);
      }
      for (const item of raw.integrity)
        if (item?.id && !expected.some(file => file.id === item.id)) at(`integrity.${item.id}`, 'file is not selected by this pack');
      if (byId.size !== expected.length) at('integrity', `expected ${expected.length} canonical file record(s), got ${byId.size}`);
    }
  }
  return errors;
}

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
  errors.push(...validatePackMetadata(raw));
  if (raw.registries !== undefined && (typeof raw.registries !== 'string' || !/^[a-z0-9-]+\.json$/.test(raw.registries)))
    at('registries', 'must name a JSON file in the pack folder');
  if (raw.mapDirectory !== undefined && (typeof raw.mapDirectory !== 'string' || !/^[a-z0-9-]+\/$/.test(raw.mapDirectory)))
    at('mapDirectory', 'must be a relative folder name ending with /');
  for (const key of ['objectives', 'story', 'inventory'])
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
