/* Visual state pairs only. Rewards and persistence remain owned by claimChest. */
import {assets, spriteId} from '../data/assets.js';

export const chestPairs = Object.freeze({
  'chest-wooden': 'chest-wooden-open-empty',
  'chest-reed-rope': 'chest-reed-rope-open-empty',
  'chest-sandstone-iron': 'chest-sandstone-iron-open-empty',
  'chest-pine-frost': 'chest-pine-frost-open-empty',
});

/** Compiled landmarks carry a numeric sprite id; authored landmarks carry a name. */
export function chestSprite(landmark, opened) {
  const name = assets[landmark.id]?.name ?? landmark.sprite;
  if (!opened) return spriteId(name);
  // Existing packs with another closed image retain #235's generic empty counterpart.
  return spriteId(chestPairs[name] ?? 'chest-wooden-open-empty');
}
