/* The shared item, shop and reward table. One place to tune supplies and money. */

/** Bag limits. Coins can pile up; supplies are capped so the bag stays readable. */
export const CAPS = {coins: 9999, potions: 99, orbs: 99};

/** What the ranger's free rest tops the bag up to (never takes anything away): prevents dead ends without a grind. */
export const REST_FLOOR = {orbs: 12, potions: 1};

/** The ranger's shop. `item` is the bag field it fills. */
export const SHOP = [
  {id: 'potion', item: 'potions', qty: 1, price: 10, label: 'Potion', thanks: 'One potion for the trail. Use it when your companion needs a little help.'},
  {id: 'orbs', item: 'orbs', qty: 5, price: 15, label: '5 orbs', thanks: 'Five fresh capture orbs. There’s always room for one more friend.'},
];

/** Battle and capture payouts. Chest and seal rewards live in the map data. */
export const REWARDS = {
  wild: {coins: [8, 14], xp: 24},
  guardianRepeat: {coins: 12, xp: 20},
  capture: {coins: 10, xp: 20},
};
