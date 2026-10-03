/* Adventure catalog and per-adventure progress bookkeeping (#67). Storage is injected so it can be faked in tests.
   The catalog (adventures.json) lists the packs a build offers; the chosen one is remembered in the browser and takes
   effect on the next load, so one page never holds two adventures' registries or progress. Settings are shared by
   every adventure on purpose (sound, text size and zoom are about the player, not the story). */
import {commitSaveTransaction, keysFor, KEYS, LEGACY_PACK, packOf, readSaveItem} from '../save.js';

export const CATALOG_FORMAT = 1;
export const ADVENTURE_KEY = 'mossvale-adventure';
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PATH = /^(?:[a-z0-9][a-z0-9-]*\/)+$/;

/** The catalog of a build that predates the chooser: the one adventure in `maps/`. */
export const DEFAULT_CATALOG = {format: CATALOG_FORMAT, adventures: [{id: LEGACY_PACK, name: 'Mossvale', path: 'maps/'}]};

/** @returns {{adventures: {id:string,name:string,brief:string,path:string}[], errors: string[]}} */
export function parseCatalog(raw) {
  const errors = [];
  const adventures = [];
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {adventures, errors: ['catalog: adventures.json must be an object']};
  if (raw.format !== CATALOG_FORMAT) errors.push(`catalog format: expected ${CATALOG_FORMAT}, got ${JSON.stringify(raw.format)}`);
  if (!Array.isArray(raw.adventures) || !raw.adventures.length) errors.push('catalog adventures: a non-empty list is required');
  const seen = new Set();
  (Array.isArray(raw.adventures) ? raw.adventures : []).forEach((a, i) => {
    const where = `catalog adventures[${i}]`;
    if (a === null || typeof a !== 'object') return errors.push(`${where}: must be an object`);
    if (typeof a.id !== 'string' || !ID.test(a.id)) return errors.push(`${where}.id: lowercase-kebab-case id required`);
    if (seen.has(a.id)) return errors.push(`${where}.id: duplicate adventure "${a.id}"`);
    seen.add(a.id);
    if (typeof a.name !== 'string' || !a.name) errors.push(`${where}.name: required`);
    if (typeof a.path !== 'string' || !PATH.test(a.path)) errors.push(`${where}.path: a relative folder ending with / (for example "maps/")`);
    if (a.brief !== undefined && typeof a.brief !== 'string') errors.push(`${where}.brief: must be text`);
    if (typeof a.name === 'string' && typeof a.path === 'string') adventures.push({id: a.id, name: a.name, brief: a.brief ?? '', path: a.path});
  });
  return {adventures: errors.length ? [] : adventures, errors};
}

/**
 * Which adventure to open: an explicit request (the `?adventure=` address option), then the remembered choice, then
 * the first one in the catalog. `note` explains a fallback in plain words so a missing adventure is never silent.
 */
export function chooseAdventure(adventures, {requested = null, stored = null} = {}) {
  const byId = id => adventures.find(a => a.id === id);
  if (requested && byId(requested)) return {entry: byId(requested), note: ''};
  const missing = requested || stored;
  if (!requested && stored && byId(stored)) return {entry: byId(stored), note: ''};
  const entry = adventures[0];
  return {
    entry,
    note: missing ? `The adventure "${missing}" is not available in this version, so "${entry.name}" was opened. Its saved progress was left untouched.` : '',
  };
}

export function readSelection(storage) {
  try {
    const id = storage.getItem(ADVENTURE_KEY);
    return typeof id === 'string' && ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** Remembers the chosen adventure for the next load. Returns whether the write worked. */
export function writeSelection(storage, id) {
  try {
    storage.setItem(ADVENTURE_KEY, id);
    return true;
  } catch {
    return false;
  }
}

/**
 * What the chooser shows for an adventure without loading it: whether it has a save and its headline numbers, read
 * from the raw payload (another adventure's species list is not loaded, so nothing is normalized here).
 * @returns {{state: 'none'|'saved'|'unreadable', caught?: number, seals?: number, minutes?: number}}
 */
export function peekProgress(storage, id) {
  const keys = keysFor(id);
  let raw;
  try {
    raw = readSaveItem(storage, keys.v3, keys);
  } catch {
    return {state: 'unreadable'};
  }
  if (raw == null) return {state: 'none'};
  try {
    const save = JSON.parse(raw);
    if (save === null || typeof save !== 'object' || packOf(save) !== id) return {state: 'unreadable'};
    return {
      state: 'saved',
      caught: Array.isArray(save.caught) ? save.caught.length : 0,
      seals: Array.isArray(save.badges) ? save.badges.length : 0,
      minutes: Math.round((Number(save.playTime) || 0) / 60),
    };
  } catch {
    return {state: 'unreadable'};
  }
}

export function describeProgress(p) {
  if (p.state === 'none') return 'Not started';
  if (p.state === 'unreadable') return 'Saved progress needs attention';
  const parts = [`${p.caught} friend${p.caught === 1 ? '' : 's'}`, `${p.seals} seal${p.seals === 1 ? '' : 's'}`];
  if (p.minutes >= 1) parts.push(`${p.minutes} min played`);
  return parts.join(' · ');
}

/**
 * Builds before the chooser stored every adventure under the first adventure's keys, and a build of another pack
 * marked its saves with `pack`. If the original keys hold another pack's save, copy it (and its checkpoint and
 * archive) to that pack's own keys through the recovery journal, and only then remove the originals. Safe to run on
 * every start: an interrupted run is finished by the journal, and a repeated run finds nothing left to move.
 * @returns {{moved: string[], blocked: string[]}} packs relocated, and packs whose own keys already hold different progress
 */
export function relocateLegacyPacks(storage) {
  const result = {moved: [], blocked: []};
  try {
    if (storage.getItem(KEYS.transaction) != null) return result; // a first-adventure journal is finished (and reported) by the load; relocation waits for the next start
    const raw = storage.getItem(KEYS.v3);
    if (raw == null) return result;
    const owner = packOf(JSON.parse(raw));
    if (owner === LEGACY_PACK || !ID.test(owner)) return result;
    const target = keysFor(owner);
    const existing = readSaveItem(storage, target.v3, target);
    if (existing != null && existing !== raw) {
      result.blocked.push(owner);
      return result;
    }
    const sameOwner = key => {
      const value = storage.getItem(key);
      if (value == null) return null;
      try {
        const parsed = JSON.parse(value);
        return packOf(key === KEYS.archive ? JSON.parse(parsed.raw) : parsed) === owner ? value : null;
      } catch {
        return null;
      }
    };
    const checkpoint = sameOwner(KEYS.backup);
    const archive = sameOwner(KEYS.archive);
    const changes = {[target.v3]: raw, [target.backup]: checkpoint ?? raw};
    if (archive !== null && readSaveItem(storage, target.archive, target) == null) changes[target.archive] = archive;
    const committed = commitSaveTransaction(storage, changes, target);
    if (!committed.ok || committed.recoveryPending) return result; // the originals stay until the copy is complete
    storage.removeItem(KEYS.v3);
    if (checkpoint !== null) storage.removeItem(KEYS.backup);
    if (archive !== null && target.archive in changes) storage.removeItem(KEYS.archive);
    result.moved.push(owner);
  } catch {
    /* relocation is best effort; the originals are untouched until a copy is committed */
  }
  return result;
}
