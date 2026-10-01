/* Writes the runtime save through the save codec. Storage is injected so it can be faked in tests. */
import {KEYS} from '../save.js';
import {battleCheckpoint} from '../domain/battle.js';

export function createPersistence({storage, codec, game, writable, onStatus}) {
  let locked = false;
  const persist = function () {
    if (locked) return false;
    game.save.x = game.player.x;
    game.save.y = game.player.y;
    game.save.battle = battleCheckpoint(game.battle);
    if (!writable) {
      onStatus('session-only');
      return false;
    }
    try {
      storage.setItem(KEYS.v3, codec.serialize(game.save));
      onStatus('saved');
      return true;
    } catch {
      onStatus('unavailable');
      return false;
    }
  };
  /** After this, nothing is written (used right before starting over or restoring, then reloading). */
  persist.lock = () => (locked = true);
  return persist;
}
