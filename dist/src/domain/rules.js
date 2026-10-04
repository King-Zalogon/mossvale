/* Pure game rules over a runtime save (species/region *indexes*). No DOM, timers or randomness. */
import {species} from '../data/species.js';
import {moves} from '../data/moves.js';
import {regions} from '../data/regions.js';
import {
  BASE_LEVEL,
  BENCH_SHARE,
  CATCH_UP_BONUS,
  CATCH_UP_GAP,
  ELEMENT_POWER,
  MAX_LEVEL,
  MAX_XP,
  MOVE_UPGRADE_LEVEL,
  PARTY_SIZE,
  UPGRADED_ELEMENT_POWER,
  XP_PER_LEVEL,
  TYPE_ADVANTAGE,
  TYPE_DISADVANTAGE,
} from '../config.js';

export const level = (save, id) => Math.min(MAX_LEVEL, BASE_LEVEL + Math.floor((save.team[id]?.xp || 0) / XP_PER_LEVEL));
export const maxHP = (save, id) => species[id].stats.hp + (level(save, id) - BASE_LEVEL) * 4;
export const companion = (save, id = save.active) => save.team[id];
/** Milestone flags used by map data: `<region-id>.seal` (shrine guardian beaten) and `<region-id>.chest` (chest opened). */
export function flagDone(save, flag) {
  const [regionId, kind] = flag.split('.');
  const i = regions.findIndex(r => r.id === regionId);
  if (i < 0) return save.mapFlags?.includes(flag) === true;
  return kind === 'seal' ? save.badges.includes(i) : save.chests.includes(i);
}

/** Marks a milestone flag done (the inverse of flagDone). Idempotent. */
export function setFlag(save, flag) {
  const [regionId, kind] = flag.split('.');
  const i = regions.findIndex(r => r.id === regionId);
  const list = kind === 'seal' ? save.badges : save.chests;
  if (i >= 0 && !list.includes(i)) list.push(i);
  else if (i < 0 && /^[a-z0-9]+(?:-[a-z0-9]+)*\.(seal|chest)$/.test(flag)) {
    save.mapFlags ??= [];
    if (!save.mapFlags.includes(flag)) save.mapFlags.push(flag);
  }
}

export const unlocked = (save, regionId) => regionId === 0 || save.badges.includes(regionId - 1);

export function effectiveness(attacker, defender) {
  const a = species[attacker];
  const type = species[defender].type;
  return a.strong.includes(type) ? TYPE_ADVANTAGE : a.weak.includes(type) ? TYPE_DISADVANTAGE : 1;
}

export function clampHealth(save) {
  for (const id of save.caught) {
    const c = companion(save, id);
    c.hp = Math.max(0, Math.min(maxHP(save, id), Number(c.hp) || 0));
  }
}

export function healTeam(save) {
  for (const id of save.caught) companion(save, id).hp = maxHP(save, id);
}

/**
 * Team rules. `save.party` lists the (at most PARTY_SIZE) companions who can fight, in order; every other captured
 * creature is in the reserve. The active companion is always in the party. Nothing is ever dropped from `caught`.
 */
export const inParty = (save, id) => save.party.includes(id);
export const reserve = save => save.caught.filter(i => !save.party.includes(i));
export const healthyParty = save => save.party.filter(i => companion(save, i).hp > 0);

/** Repairs `save.party` so it is unique, owned, bounded and contains the active companion. */
export function normalizeParty(save) {
  const party = [...new Set(save.party || [])].filter(i => save.caught.includes(i)).slice(0, PARTY_SIZE);
  if (!party.includes(save.active)) party.length >= PARTY_SIZE ? party.splice(-1, 1, save.active) : party.push(save.active);
  if (!save.party) for (const i of save.caught) if (party.length < PARTY_SIZE && !party.includes(i)) party.push(i);
  save.party = party;
}

/** Makes `id` the companion. A reserve creature joins the team, replacing the previous companion if the team is full. */
export function setActive(save, id) {
  if (!save.caught.includes(id)) return false;
  if (!inParty(save, id)) {
    if (save.party.length < PARTY_SIZE) save.party.push(id);
    else save.party[save.party.indexOf(save.active)] = id;
  }
  save.active = id;
  return true;
}

export function addToParty(save, id) {
  if (!save.caught.includes(id) || inParty(save, id) || save.party.length >= PARTY_SIZE) return false;
  save.party.push(id);
  return true;
}

/** Moves a teammate to the reserve. The active companion and the last teammate cannot leave. */
export function removeFromParty(save, id) {
  if (!inParty(save, id) || id === save.active || save.party.length <= 1) return false;
  save.party = save.party.filter(i => i !== id);
  return true;
}

/** Progress inside the current level for the HUD: `{into, needed, maxed}`. */
export function xpProgress(save, id) {
  const xp = save.team[id]?.xp || 0;
  return level(save, id) >= MAX_LEVEL ? {into: XP_PER_LEVEL, needed: XP_PER_LEVEL, maxed: true} : {into: xp % XP_PER_LEVEL, needed: XP_PER_LEVEL, maxed: false};
}

/** Elemental move name and power; the move grows stronger at MOVE_UPGRADE_LEVEL. */
export const moveUpgraded = (save, id) => level(save, id) >= MOVE_UPGRADE_LEVEL;
const elementalMove = id => moves[species[id].move] ?? {name: species[id].move, power: 1};
export const moveName = (save, id) => elementalMove(id).name + (moveUpgraded(save, id) ? '+' : '');
export const elementPower = (save, id) => (moveUpgraded(save, id) ? UPGRADED_ELEMENT_POWER : ELEMENT_POWER) * elementalMove(id).power;

/** Adds XP to one companion (clamped to the cap). Returns what changed. */
export function addXP(save, id, amount) {
  const c = companion(save, id);
  const before = level(save, id);
  const upgradedBefore = moveUpgraded(save, id);
  c.xp = Math.min(MAX_XP, Math.max(0, c.xp + Math.max(0, Math.floor(amount))));
  const after = level(save, id);
  if (after > before) c.hp = Math.min(maxHP(save, id), c.hp + (after - before) * 12);
  return {id, gained: Math.floor(amount), leveled: after > before, level: after, upgraded: !upgradedBefore && moveUpgraded(save, id)};
}

/**
 * Awards `amount` XP for a won encounter. The active companion gets it (with a catch-up bonus when it trails the
 * team's best by CATCH_UP_GAP levels, so a new catch is not a grind); every other companion gets BENCH_SHARE of it.
 * Returns {text, active, bench} where `text` is the player-facing summary.
 */
export function awardXP(save, amount) {
  const best = Math.max(...save.caught.map(i => level(save, i)));
  const bonus = level(save, save.active) <= best - CATCH_UP_GAP ? CATCH_UP_BONUS : 1;
  const active = addXP(save, save.active, amount * bonus);
  const bench = save.caught.filter(i => i !== save.active).map(i => addXP(save, i, Math.max(1, amount * BENCH_SHARE)));
  const name = species[save.active].name;
  const lines = [
    active.leveled
      ? `${name} reached level ${active.level}!`
      : level(save, save.active) >= MAX_LEVEL
        ? `${name} is at the top level.`
        : `${name} gained ${active.gained} XP.`,
  ];
  if (active.upgraded) lines.push(`${moveName(save, save.active)} grew stronger!`);
  for (const b of bench) if (b.leveled) lines.push(`${species[b.id].name} reached level ${b.level}!`);
  return {text: lines.join(' '), active, bench};
}
