const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COLOR = /^#[0-9a-f]{6}$/i;
const ACTIONS = new Set(['strike', 'element', 'charge', 'heavy', 'brace']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;

/** Validate the pack-owned rule and presentation tables before they reach the shared engine. */
export function validateRegistries(raw, {assetNames}) {
  const errors = [];
  const at = (field, message) => errors.push(`registries ${field}: ${message}`);
  if (!object(raw)) return ['registries: expected an object'];
  if (raw.format !== 1) at('format', 'expected version 1');
  const speciesIds = new Set();
  const types = new Set();
  if (!Array.isArray(raw.types) || !raw.types.length) at('types', 'needs a list of element type IDs');
  else
    raw.types.forEach((entry, i) => {
      if (!object(entry) || typeof entry.id !== 'string' || !ID.test(entry.id) || types.has(entry.id)) at(`types[${i}].id`, 'needs a unique lowercase id');
      else if (typeof entry.name !== 'string' || !entry.name || types.has(entry.name)) at(`types[${i}].name`, 'needs a unique display name');
      else types.add(entry.name);
    });
  if (!Array.isArray(raw.species) || !raw.species.length) at('species', 'needs at least one species');
  else
    raw.species.forEach((entry, i) => {
      const field = `species[${i}]`;
      if (!object(entry) || typeof entry.id !== 'string' || !ID.test(entry.id) || speciesIds.has(entry.id))
        at(field + '.id', 'needs a unique immutable lowercase id');
      else speciesIds.add(entry.id);
      for (const key of ['name', 'type', 'move', 'desc']) if (typeof entry?.[key] !== 'string' || !entry[key]) at(field + '.' + key, 'required text');
      if (typeof entry?.type !== 'string' || !types.has(entry.type)) at(field + '.type', 'must reference a pack type ID');
      if (!Number.isInteger(entry?.hp) || !finite(entry?.hp, 1, 9999)) at(field + '.hp', 'must be a positive whole number');
      if (!assetNames.has(entry?.sprite)) at(field + '.sprite', `unknown shared asset "${entry?.sprite}"`);
      for (const key of ['strong', 'weak'])
        if (!Array.isArray(entry?.[key]) || !entry[key].every(type => typeof type === 'string')) at(field + '.' + key, 'needs a list of type names');
    });
  if (!Array.isArray(raw.regions) || !raw.regions.length) at('regions', 'needs at least one region');
  else {
    const ids = new Set();
    raw.regions.forEach((entry, i) => {
      const field = `regions[${i}]`;
      if (!object(entry) || typeof entry.id !== 'string' || !ID.test(entry.id) || ids.has(entry.id)) at(field + '.id', 'needs a unique immutable lowercase id');
      else ids.add(entry.id);
      for (const key of ['name', 'short', 'subtitle', 'tag', 'seal', 'desc'])
        if (typeof entry?.[key] !== 'string' || !entry[key]) at(field + '.' + key, 'required text');
      if (!Array.isArray(entry?.palette) || entry.palette.length !== 6 || !entry.palette.every(color => typeof color === 'string' && COLOR.test(color)))
        at(field + '.palette', 'needs six hex colors');
      if (!assetNames.has(entry?.preview)) at(field + '.preview', `unknown shared asset "${entry?.preview}"`);
    });
  }
  for (const [i, entry] of (Array.isArray(raw.species) ? raw.species : []).entries()) {
    for (const key of ['strong', 'weak'])
      for (const type of Array.isArray(entry?.[key]) ? entry[key] : []) if (!types.has(type)) at(`species[${i}].${key}`, `unknown type "${type}"`);
  }
  if (!object(raw.moves) || !object(raw.moves.elemental)) at('moves', 'needs an elemental move table');
  else {
    const move = raw.moves.elemental;
    for (const [key, min, max] of [
      ['power', 1, 999],
      ['upgradedPower', 1, 999],
      ['focusCost', 0, 99],
      ['focusGain', 0, 99],
    ])
      if (!finite(move[key], min, max)) at('moves.elemental.' + key, 'must be a bounded number');
    if (!finite(raw.moves.strongMultiplier, 1, 10) || !finite(raw.moves.weakMultiplier, 0, 1)) at('moves', 'type multipliers must be bounded numbers');
  }
  if (!object(raw.economy) || !object(raw.economy.caps) || !object(raw.economy.restFloor) || !Array.isArray(raw.economy.shop) || !object(raw.economy.rewards))
    at('economy', 'needs caps, restFloor, shop and rewards tables');
  else {
    for (const field of ['coins', 'potions', 'orbs'])
      if (!finite(raw.economy.caps[field], 0, 1_000_000)) at('economy.caps.' + field, 'must be a non-negative number');
    const ids = new Set();
    raw.economy.shop.forEach((offer, i) => {
      if (!object(offer) || typeof offer.id !== 'string' || !ID.test(offer.id) || ids.has(offer.id)) at(`economy.shop[${i}].id`, 'needs a unique lowercase id');
      else ids.add(offer.id);
      if (!['potions', 'orbs'].includes(offer?.item) || !finite(offer?.qty, 1, 1000) || !finite(offer?.price, 0, 1_000_000))
        at(`economy.shop[${i}]`, 'needs a known supply, positive quantity and non-negative price');
    });
    for (const key of ['wild', 'guardianRepeat', 'capture']) if (!object(raw.economy.rewards[key])) at('economy.rewards.' + key, 'required reward table');
  }
  if (!object(raw.tactics) || !Array.isArray(raw.tactics.defaultPattern) || !object(raw.tactics.patterns)) at('tactics', 'needs defaultPattern and patterns');
  else {
    for (const [key, pattern] of [
      ['defaultPattern', raw.tactics.defaultPattern],
      ...Object.entries(raw.tactics.patterns).map(([id, value]) => [`patterns.${id}.pattern`, value?.pattern]),
    ])
      if (!Array.isArray(pattern) || !pattern.length || !pattern.every(action => ACTIONS.has(action)))
        at('tactics.' + key, 'needs a non-empty sequence of supported actions');
    for (const field of ['heavyFactor', 'braceFactor']) if (!finite(raw.tactics[field], 0.1, 10)) at('tactics.' + field, 'must be a positive bounded number');
    if (!object(raw.tactics.intentText) || [...ACTIONS].some(action => typeof raw.tactics.intentText[action] !== 'string'))
      at('tactics.intentText', 'needs player-facing text for every action');
  }
  if (
    !object(raw.progression) ||
    !finite(raw.progression.xpPerLevel, 1, 10000) ||
    !finite(raw.progression.baseLevel, 1, 98) ||
    !finite(raw.progression.maxLevel, raw.progression.baseLevel + 1, 99)
  )
    at('progression', 'needs valid xpPerLevel, baseLevel and maxLevel');
  else {
    if (!finite(raw.progression.moveUpgradeLevel, raw.progression.baseLevel, raw.progression.maxLevel))
      at('progression.moveUpgradeLevel', 'must fall within the level range');
    if (!finite(raw.progression.partySize, 1, 6) || !Number.isInteger(raw.progression.partySize)) at('progression.partySize', 'must be an integer from 1 to 6');
    if (!finite(raw.progression.benchShare, 0, 1) || !finite(raw.progression.catchUpGap, 0, 98) || !finite(raw.progression.catchUpBonus, 1, 10))
      at('progression', 'invalid share or catch-up values');
    if (raw.progression.maxXp !== (raw.progression.maxLevel - raw.progression.baseLevel) * raw.progression.xpPerLevel)
      at('progression.maxXp', 'must equal the configured level span multiplied by xpPerLevel');
  }
  if (
    !object(raw.battle) ||
    !finite(raw.battle.focusMax, 1, 20) ||
    !finite(raw.battle.focusStart, 0, raw.battle.focusMax) ||
    !finite(raw.battle.guardFactor, 0, 1)
  )
    at('battle', 'needs valid focus and guard rules');
  return errors;
}

/** Convert asset names in a pack registry to the shared manifest's stable runtime indexes. */
export function resolveRegistries(raw, assets) {
  const spriteId = name => assets.findIndex(asset => asset.name === name);
  return {
    species: raw.species.map(entry => ({...entry, sprite: spriteId(entry.sprite)})),
    regions: raw.regions.map(entry => ({...entry, preview: spriteId(entry.preview)})),
  };
}
