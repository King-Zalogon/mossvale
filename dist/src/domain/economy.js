/* Supplies, shop and rewards as small transactions over the save. Each function either completes fully or changes nothing. */
import {CAPS, REST_FLOOR, SHOP} from '../data/economy.js';
import {flagDone, healTeam, setFlag} from './rules.js';

const FIELDS = ['coins', 'potions', 'orbs'];

/** Adds rewards, respecting the bag limits. Returns what was actually received. */
export function grant(save, gains = {}) {
  const got = {};
  for (const k of FIELDS) {
    const add = Math.max(0, Math.floor(gains[k] || 0));
    got[k] = Math.min(add, Math.max(0, CAPS[k] - save[k]));
    save[k] += got[k];
  }
  return got;
}

/** Buys a shop offer. `reason` explains a refusal: 'unknown' | 'coins' | 'full'. */
export function buy(save, offerId) {
  const offer = SHOP.find(o => o.id === offerId);
  if (!offer) return {ok: false, reason: 'unknown'};
  if (save.coins < offer.price) return {ok: false, reason: 'coins', offer};
  if (save[offer.item] + offer.qty > CAPS[offer.item]) return {ok: false, reason: 'full', offer};
  save.coins -= offer.price;
  save[offer.item] += offer.qty;
  return {ok: true, offer};
}

export function canBuy(save, offer) {
  return save.coins >= offer.price && save[offer.item] + offer.qty <= CAPS[offer.item];
}

/** The ranger's free rest: heal everyone and top supplies up to the floor (never reduces anything). */
export function restAtCamp(save) {
  healTeam(save);
  for (const [k, floor] of Object.entries(REST_FLOOR)) save[k] = Math.max(save[k], floor);
}

/** Opens a chest once. Returns what was received, or null if it was already opened. */
export function claimChest(save, landmark) {
  if (flagDone(save, landmark.flag)) return null;
  setFlag(save, landmark.flag);
  return grant(save, landmark.reward);
}
