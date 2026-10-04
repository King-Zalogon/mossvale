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
    else if (item?.effect?.type === 'heal-percent' && !(Number.isInteger(item.effect.percent) && item.effect.percent >= 1 && item.effect.percent <= 100))
      errors.push(`items.${id}.effect.percent: must be an integer from 1 to 100`);
    if (item?.kind === 'valuable' && !(Number.isInteger(item.sellPrice) && item.sellPrice >= 0))
      errors.push(`items.${id}.sellPrice: valuables need a non-negative integer sell price`);
  }
  for (const field of ['carryCap', 'storageCap'])
    if (!Number.isInteger(rules?.[field]) || rules[field] < 0 || rules[field] > 999) errors.push(`${field}: must be an integer from 0 to 999`);
  for (const [table, entries] of Object.entries(rules.drops ?? {})) {
    if (!Array.isArray(entries) || !entries.length) errors.push(`drops.${table}: a non-empty list of drops is required`);
    else
      entries.forEach((entry, i) => {
        const where = `drops.${table}[${i}]`;
        if (!rules.items[entry?.item]) errors.push(`${where}.item: unknown item "${entry?.item}"`);
        if (!Number.isInteger(entry?.weight) || entry.weight < 1) errors.push(`${where}.weight: must be a positive integer`);
        if (!Number.isInteger(entry?.min) || !Number.isInteger(entry?.max) || entry.min < 1 || entry.max < entry.min)
          errors.push(`${where}: min/max must be integers with 1 <= min <= max`);
      });
  }
  for (const [field, item] of Object.entries(rules.supplies ?? {}))
    if (!['potions', 'orbs'].includes(field) || !rules.items[item]) errors.push(`supplies.${field}: maps the save's potions/orbs to a known item`);
  return errors;
}

export function createInventory() {
  return {bag: {}, storage: {}, coins: 0, claimed: {}};
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

const clone = state => structuredClone(state);
const room = (state, location, rules) => rules[location === 'bag' ? 'carryCap' : 'storageCap'] - sum(state[location] ?? {});

/** Buys `quantity` of a usable item with coins. Nothing changes if the bag is full or coins are short. */
export function buyInventory(state, item, quantity, rules) {
  const definition = rules?.items?.[item];
  if (!definition) return {ok: false, reason: 'unknown'};
  if (definition.kind === 'key' || definition.buyable === false || definition.price < 1) return {ok: false, reason: 'not-for-sale'};
  if (!Number.isInteger(quantity) || quantity < 1) return {ok: false, reason: 'quantity'};
  const cost = definition.price * quantity;
  if (state.coins < cost) return {ok: false, reason: 'coins'};
  if (room(state, 'bag', rules) < quantity) return {ok: false, reason: 'full'};
  state.coins -= cost;
  state.bag[item] = (state.bag[item] ?? 0) + quantity;
  return {ok: true, item, quantity, cost};
}

/** Puts a whole list of {item, quantity} into the bag, or nothing at all when any item is unknown or the bag cannot hold them. */
export function gatherInventory(state, grants, rules) {
  let total = 0;
  for (const {item, quantity} of grants) {
    if (!rules?.items?.[item]) return {ok: false, reason: 'unknown'};
    if (!Number.isInteger(quantity) || quantity < 1) return {ok: false, reason: 'quantity'};
    total += quantity;
  }
  if (total > room(state, 'bag', rules)) return {ok: false, reason: 'full'};
  for (const {item, quantity} of grants) state.bag[item] = (state.bag[item] ?? 0) + quantity;
  return {ok: true, grants};
}

/** Rolls a drop table with an injected random source (0 <= rng() < 1); the same roll always gives the same drop. */
export function rollDrop(rules, table, rng) {
  const entries = rules?.drops?.[table];
  if (!entries?.length) return null;
  let pick = rng() * entries.reduce((total, entry) => total + entry.weight, 0);
  const entry = entries.find(candidate => (pick -= candidate.weight) < 0) ?? entries.at(-1);
  return {item: entry.item, quantity: entry.min + Math.floor(rng() * (entry.max - entry.min + 1))};
}

/** Uses one item. A heal-percent item restores that share of max HP and is only spent when it heals something. */
export function useInventory(state, item, {hp, maxHp}, rules) {
  const definition = rules?.items?.[item];
  if (!definition) return {ok: false, reason: 'unknown'};
  if (definition.kind !== 'usable' || definition.effect?.type !== 'heal-percent') return {ok: false, reason: 'no-effect'};
  if ((state.bag[item] ?? 0) < 1) return {ok: false, reason: 'missing'};
  if (hp >= maxHp) return {ok: false, reason: 'full-health'};
  const healed = Math.min(maxHp - hp, Math.max(1, Math.ceil((maxHp * definition.effect.percent) / 100)));
  state.bag[item] -= 1;
  if (!state.bag[item]) delete state.bag[item];
  return {ok: true, item, healed, hp: hp + healed};
}

/** Home/bed stash fixture: move between the bag and the stash with the shared caps. */
export const deposit = (state, item, quantity, rules) => moveInventory(state, {item, quantity, from: 'bag', to: 'storage', rules});
export const withdraw = (state, item, quantity, rules) => moveInventory(state, {item, quantity, from: 'storage', to: 'bag', rules});

/** Pays a reward once per claim key (capture and defeat rewards use different keys), or changes nothing. */
export function claimInventory(state, key, grants, rules, coins = 0) {
  if (state.claimed?.[key]) return {ok: false, reason: 'claimed'};
  if (!Number.isInteger(coins) || coins < 0) return {ok: false, reason: 'quantity'};
  const result = grants.length ? gatherInventory(state, grants, rules) : {ok: true, grants};
  if (!result.ok) return result;
  state.coins += coins;
  state.claimed = {...state.claimed, [key]: true};
  return {ok: true, key, grants, coins};
}

/**
 * Runs `action(draft)` on a copy and keeps the result only when it succeeded and `persist(draft)` accepted it (returned
 * something other than false and did not throw). A failed write leaves the caller's state exactly as it was.
 */
export function commitInventory(state, action, persist) {
  const draft = clone(state);
  const result = action(draft);
  if (!result?.ok) return result;
  try {
    if (persist(draft) === false) return {ok: false, reason: 'persist'};
  } catch {
    return {ok: false, reason: 'persist'};
  }
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, draft);
  return result;
}

/** Lifts the established coins/potions/orbs of a save into an inventory, so a pack that adopts items keeps old supplies. */
export function suppliesToInventory(save, rules) {
  const state = createInventory();
  state.coins = save.coins ?? 0;
  for (const [field, item] of Object.entries(rules?.supplies ?? {})) if ((save[field] ?? 0) > 0) state.bag[item] = save[field];
  return state;
}

/** Writes an inventory's mapped supplies and coins back into the save fields; other save fields are untouched. */
export function inventoryToSupplies(state, save, rules) {
  const out = {...save, coins: state.coins};
  for (const [field, item] of Object.entries(rules?.supplies ?? {})) out[field] = state.bag[item] ?? 0;
  return out;
}
