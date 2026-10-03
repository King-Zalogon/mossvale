/* Optional generic bag/stash transactions. State is caller-owned and only changes after full validation. */
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const sum = counts => Object.values(counts).reduce((total, count) => total + count, 0);

export function validateInventoryRules(rules) {
  const errors = [];
  if (!object(rules) || !object(rules.items)) return ['inventory items must be an object table'];
  for (const [id, item] of Object.entries(rules.items)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) errors.push(`items.${id}: id must be lowercase kebab-case`);
    if (!item || typeof item.name !== 'string' || !item.name) errors.push(`items.${id}.name: required`);
    if (!Number.isInteger(item?.price) || item.price < 0) errors.push(`items.${id}.price: must be a non-negative integer`);
    if (!['usable', 'valuable', 'key'].includes(item?.kind)) errors.push(`items.${id}.kind: must be usable, valuable, or key`);
    if (item?.effect !== undefined && (!object(item.effect) || !['heal-percent', 'none'].includes(item.effect.type)))
      errors.push(`items.${id}.effect: unknown item effect`);
  }
  for (const field of ['carryCap', 'storageCap'])
    if (!Number.isInteger(rules?.[field]) || rules[field] < 0 || rules[field] > 999) errors.push(`${field}: must be an integer from 0 to 999`);
  return errors;
}

export function createInventory() {
  return {bag: {}, storage: {}, coins: 0};
}

export function moveInventory(state, {item, quantity, from = 'bag', to = 'storage', rules}) {
  if (!['bag', 'storage'].includes(from) || !['bag', 'storage'].includes(to) || from === to) return {ok: false, reason: 'location'};
  if (!rules?.items?.[item]) return {ok: false, reason: 'unknown'};
  if (!Number.isInteger(quantity) || quantity < 1) return {ok: false, reason: 'quantity'};
  if ((state[from]?.[item] ?? 0) < quantity) return {ok: false, reason: 'missing'};
  if (sum(state[to] ?? {}) + quantity > rules[to === 'bag' ? 'carryCap' : 'storageCap']) return {ok: false, reason: 'full'};
  state[from][item] -= quantity;
  if (!state[from][item]) delete state[from][item];
  state[to][item] = (state[to][item] ?? 0) + quantity;
  return {ok: true, item, quantity};
}

export function sellInventory(state, item, quantity, rules) {
  const definition = rules?.items?.[item];
  if (!definition) return {ok: false, reason: 'unknown'};
  if (definition.kind !== 'valuable') return {ok: false, reason: 'not-for-sale'};
  if (!Number.isInteger(quantity) || quantity < 1) return {ok: false, reason: 'quantity'};
  if ((state.bag?.[item] ?? 0) < quantity) return {ok: false, reason: 'missing'};
  const coins = definition.sellPrice * quantity;
  if (!Number.isSafeInteger(coins) || !Number.isSafeInteger(state.coins + coins)) return {ok: false, reason: 'limit'};
  state.bag[item] -= quantity;
  if (!state.bag[item]) delete state.bag[item];
  state.coins += coins;
  return {ok: true, item, quantity, coins};
}
