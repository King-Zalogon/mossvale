/* Starting over and restoring, without ever silently erasing recoverable progress.
   "New game" first copies the current adventure into one archive slot; "Restore" swaps the archive and the current save. */
import {KEYS} from '../save.js';

/** True once the player has done anything worth keeping. */
export const hasProgress = save =>
  save.met || save.wins > 0 || save.caught.length > 1 || save.badges.length > 0 || save.chests.length > 0 || save.coins > 0 || save.playTime > 30;

export function summarize(save, species) {
  const minutes = Math.round(save.playTime / 60);
  const parts = [`${save.caught.length} of ${species.length} friends`, `${save.badges.length} seal${save.badges.length === 1 ? '' : 's'}`];
  if (minutes >= 1) parts.push(`${minutes} min played`);
  return parts.join(' · ');
}

/** The archived adventure as a validated runtime save plus when it was archived, or null. */
export function readArchive(storage, codec) {
  try {
    const entry = JSON.parse(storage.getItem(KEYS.archive));
    const save = codec.normalize(JSON.parse(entry.raw), false);
    return save ? {save, at: String(entry.at)} : null;
  } catch {
    return null;
  }
}

const stamp = () => new Date().toISOString();

/**
 * Archives the current adventure (if it has progress) and writes a fresh save.
 * Returns {ok, replacedArchive}. When `ok` is false nothing was changed.
 */
export function startOver({storage, codec, save}) {
  try {
    const replacedArchive = !!storage.getItem(KEYS.archive);
    if (hasProgress(save)) storage.setItem(KEYS.archive, JSON.stringify({at: stamp(), raw: codec.serialize(save)}));
    const fresh = codec.serialize(codec.fresh());
    storage.setItem(KEYS.v3, fresh);
    storage.setItem(KEYS.backup, fresh); // otherwise corruption recovery would resurrect the old adventure
    return {ok: true, replacedArchive};
  } catch {
    return {ok: false, replacedArchive: false};
  }
}

/** Swaps the archived adventure with the current one, so nothing is lost either way. */
export function restoreArchive({storage, codec, save}) {
  try {
    const archived = readArchive(storage, codec);
    if (!archived) return {ok: false};
    const current = codec.serialize(save);
    storage.setItem(KEYS.v3, codec.serialize(archived.save));
    storage.setItem(KEYS.backup, codec.serialize(archived.save));
    storage.setItem(KEYS.archive, JSON.stringify({at: stamp(), raw: current}));
    return {ok: true};
  } catch {
    return {ok: false};
  }
}
