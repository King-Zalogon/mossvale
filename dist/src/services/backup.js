/* Portable save backup: export to a JSON file, import with validation, and restore the session checkpoint.
   Saves live in one browser on one address; this is how progress moves between browsers or devices.
   Nothing here talks to a server. */
import {commitSaveTransaction, KEYS, packOf, readSaveItem, VERSION} from '../save.js';
import {hasProgress} from './profile.js';

export const BACKUP_KIND = 'mossvale-save-backup';
export const BACKUP_FORMAT = 1;
export const MAX_BACKUP_BYTES = 1_000_000;

export const exportFileName = (date = new Date()) => `mossvale-save-${date.toISOString().slice(0, 10)}.json`;

/** The text of a backup file: a small envelope around the current save schema. */
export function exportBackup(codec, save, build = null, now = new Date()) {
  return (
    JSON.stringify(
      {kind: BACKUP_KIND, format: BACKUP_FORMAT, exportedAt: now.toISOString(), build: build?.short ?? null, save: JSON.parse(codec.serialize(save))},
      null,
      2,
    ) + '\n'
  );
}

/**
 * Checks a file's text. Returns {ok: true, save, exportedAt, build} with a fully validated runtime save,
 * or {ok: false, reason} in plain words. Never throws; never touches storage.
 */
export function parseBackup(text, codec) {
  if (typeof text !== 'string' || text.length > MAX_BACKUP_BYTES) return {ok: false, reason: 'That file is too large to be a Mossvale save.'};
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return {ok: false, reason: 'That file is not valid JSON, so it cannot be a Mossvale save.'};
  }
  const isEnvelope = data && typeof data === 'object' && data.kind === BACKUP_KIND;
  const payload = isEnvelope ? data.save : data; // a bare save payload (e.g. copied from storage) is accepted too
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Number.isInteger(payload.version))
    return {ok: false, reason: 'That file does not look like a Mossvale save.'};
  if (payload.version > VERSION)
    return {
      ok: false,
      reason: `That save was made by a newer version of Mossvale (schema ${payload.version}). Update the game first; your current progress was not touched.`,
    };
  if (![VERSION, 3, 2].includes(payload.version)) return {ok: false, reason: `Saves of schema ${payload.version} are not supported.`};
  if (packOf(payload) !== codec.pack)
    return {ok: false, reason: `That save belongs to another adventure ("${packOf(payload)}"), not "${codec.pack}". Your current progress was not touched.`};
  const contentProblem = codec.contentIssue(payload);
  if (contentProblem) return {ok: false, reason: contentProblem};
  const save = codec.normalize(payload, payload.version === 2);
  if (!save) return {ok: false, reason: 'That file does not look like a Mossvale save.'};
  return {
    ok: true,
    save,
    exportedAt: isEnvelope && typeof data.exportedAt === 'string' ? data.exportedAt : null,
    build: isEnvelope ? (data.build ?? null) : null,
  };
}

const stamp = () => new Date().toISOString();

/** Replaces the current save with `incoming`, first archiving the current adventure (if it has progress). */
export function importSave({storage, codec, save, incoming}) {
  try {
    const changes = {};
    if (hasProgress(save)) changes[KEYS.archive] = JSON.stringify({at: stamp(), raw: codec.serialize(save)});
    else {
      const archive = readSaveItem(storage, KEYS.archive);
      if (archive !== null) changes[KEYS.archive] = archive;
    }
    const raw = codec.serialize(incoming);
    changes[KEYS.v3] = raw;
    changes[KEYS.backup] = raw;
    return commitSaveTransaction(storage, changes);
  } catch {
    return {ok: false, recoveryPending: false, reason: 'storage'};
  }
}

/** The checkpoint kept from the start of the last session, as a validated save, or null. */
export function readCheckpoint(storage, codec) {
  try {
    const raw = JSON.parse(readSaveItem(storage, KEYS.backup));
    if (codec.contentIssue(raw)) return null;
    const save = codec.normalize(raw, false);
    return save ?? null;
  } catch {
    return null;
  }
}

/** Puts the session checkpoint back as the current save (the current one is archived first). */
export function restoreCheckpoint({storage, codec, save}) {
  const checkpoint = readCheckpoint(storage, codec);
  return checkpoint ? importSave({storage, codec, save, incoming: checkpoint}) : {ok: false};
}
