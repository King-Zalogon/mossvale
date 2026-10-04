/* Writes the runtime save through the save codec. Storage is injected so it can be faked in tests. */
import {recoverSaveTransaction} from '../save.js';
import {battleCheckpoint} from '../domain/battle.js';
import {syncInventorySupplies} from '../domain/inventory.js';

export function createPersistence({storage, codec, game, writable, onStatus, onEvent, inventoryRules}) {
  let locked = false;
  const persist = function () {
    if (locked) return false;
    game.save.x = game.player.x;
    game.save.y = game.player.y;
    game.save.battle = battleCheckpoint(game.battle);
    syncInventorySupplies(game.save, inventoryRules);
    if (!writable) {
      onStatus('session-only');
      onEvent?.('save.write', {status: 'session-only'});
      return false;
    }
    try {
      if (recoverSaveTransaction(storage, codec.keys).pending) {
        onStatus('unavailable');
        onEvent?.('save.write', {status: 'recovery-pending', mapId: game.save.mapId, battle: !!game.battle});
        return false;
      }
      storage.setItem(codec.keys.v3, codec.serialize(game.save));
      onStatus('saved');
      onEvent?.('save.write', {status: 'saved', mapId: game.save.mapId, battle: !!game.battle});
      return true;
    } catch {
      onStatus('unavailable');
      onEvent?.('save.write', {status: 'unavailable', mapId: game.save.mapId, battle: !!game.battle});
      return false;
    }
  };
  /** After this, nothing is written (used right before starting over or restoring, then reloading). */
  persist.lock = () => (locked = true);
  return persist;
}
