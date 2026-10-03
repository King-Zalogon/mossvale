import defaults from '../../maps/registries.json' with {type: 'json'};

const initial = defaults.economy;
export const CAPS = {...initial.caps};
export const REST_FLOOR = {...initial.restFloor};
export const SHOP = [...initial.shop];
export const REWARDS = structuredClone(initial.rewards);

export function replaceEconomy(data) {
  Object.assign(CAPS, data.caps);
  Object.assign(REST_FLOOR, data.restFloor);
  SHOP.splice(0, SHOP.length, ...data.shop.map(item => ({...item})));
  for (const key of Object.keys(REWARDS)) delete REWARDS[key];
  Object.assign(REWARDS, structuredClone(data.rewards));
}
