/* Compatibility contract shared by pack validation, static builds and the save codec's callers (#283).
   Every number is an integer level, never a dotted version string, so nothing here compares versions ad hoc.
   Guide: docs/COMPATIBILITY.md. Pure: no DOM, storage, clock or network. */
import {VERSION} from './save.js';

export const ENGINE_VERSION = 1;
export const SAVE_SCHEMA_VERSION = VERSION;

/** Inclusive range of levels this game can load. Widen `min` only together with a tested migration (see COMPATIBILITY.md). */
export const SUPPORT = Object.freeze({
  packFormat: Object.freeze({min: 1, max: 1}),
  engineVersion: Object.freeze({min: ENGINE_VERSION, max: ENGINE_VERSION}),
  saveSchema: Object.freeze({min: SAVE_SCHEMA_VERSION, max: SAVE_SCHEMA_VERSION}),
});

/** Saves this game reads: the current schema as is, older ones by an in-memory migration that never rewrites the stored copy. */
export const READABLE_SAVE_SCHEMAS = Object.freeze({min: 1, max: SAVE_SCHEMA_VERSION});

const LABEL = {packFormat: 'pack format', engineVersion: 'engine version', saveSchema: 'save schema'};

const range = ({min, max}) => (min === max ? `${min}` : `${min} to ${max}`);

/**
 * Where one required level sits relative to what this game supports.
 * @returns {{status: 'compatible'|'newer'|'older'|'invalid', message: string}}
 *   `newer`: the pack needs a newer game; `older`: the pack predates the supported range; `invalid`: not an integer level.
 */
export function checkLevel(kind, value, span = SUPPORT[kind]) {
  const label = LABEL[kind] ?? kind;
  if (!Number.isInteger(value) || value < 1)
    return {status: 'invalid', message: `requires ${JSON.stringify(value)}; ${label} must be a positive integer (this game supports ${range(span)})`};
  if (value > span.max)
    return {
      status: 'newer',
      message: `requires ${value}; this game supports ${range(span)}. The pack was made for a newer game: update the game or restore a build that supports it`,
    };
  if (value < span.min)
    return {
      status: 'older',
      message: `requires ${value}; this game supports ${range(span)}. The pack was made for an older game and is no longer supported: port it deliberately to the current contract (docs/COMPATIBILITY.md)`,
    };
  return {status: 'compatible', message: ''};
}

/**
 * Judges a pack manifest's declared requirements against a support range.
 * @param {object} raw parsed manifest
 * @param {{packFormat?: object, engineVersion?: object, saveSchema?: object}} [support]
 * @returns {{status: 'compatible'|'requires-newer-game'|'pack-too-old'|'invalid', issues: {field: string, status: string, message: string}[]}}
 *   An invalid or missing declaration outranks `newer`; `newer` outranks `older`, because updating the game is the cheaper fix.
 */
export function assessPackRequirements(raw, support = SUPPORT) {
  const span = {...SUPPORT, ...support};
  const issues = [];
  const add = (field, result) => result.status !== 'compatible' && issues.push({field, status: result.status, message: result.message});
  add('format', checkLevel('packFormat', raw?.format, span.packFormat));
  const req = raw?.requires;
  if (!req || typeof req !== 'object' || Array.isArray(req))
    issues.push({field: 'requires', status: 'invalid', message: 'engineVersion and saveSchema are required'});
  else {
    add('requires.engineVersion', checkLevel('engineVersion', req.engineVersion, span.engineVersion));
    add('requires.saveSchema', checkLevel('saveSchema', req.saveSchema, span.saveSchema));
  }
  const has = status => issues.some(issue => issue.status === status);
  const status = has('invalid') ? 'invalid' : has('newer') ? 'requires-newer-game' : has('older') ? 'pack-too-old' : 'compatible';
  return {status, issues};
}

/**
 * How a stored save's schema level is treated by this game.
 * `current` loads as is; `migrate` is converted in memory and only rewritten on the next save;
 * `future` is never loaded, overwritten or downgraded; `invalid` is not a level at all.
 */
export function classifySaveSchema(version, current = SAVE_SCHEMA_VERSION) {
  if (!Number.isInteger(version) || version < 1) return 'invalid';
  if (version > current) return 'future';
  return version === current ? 'current' : 'migrate';
}
