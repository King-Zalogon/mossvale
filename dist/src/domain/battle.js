/* Pure battle rules. All randomness comes from the injected `rng`; all state lives in `save` and the battle object. */
import {species} from '../data/species.js';
import {BASE_LEVEL, ELEMENT_COST, FOCUS_GAIN, FOCUS_MAX, FOCUS_START, GUARD_FACTOR, PARTY_SIZE, XP_PER_LEVEL} from '../config.js';
import {awardXP, companion, effectiveness, elementPower, healTeam, level, maxHP, moveName} from './rules.js';

export const POTION_HEAL = 24;

/** Picks a different healthy companion if the active one is down. Returns false when the whole team is down. */
export function ensureHealthyCompanion(save) {
  if (companion(save).hp > 0) return true;
  const healthy = save.party.find(i => companion(save, i).hp > 0);
  if (healthy === undefined) return false;
  save.active = healthy;
  return true;
}

/** Picks a wild creature and level from an encounter zone (see mapdata.js). Prefers creatures not yet seen. */
export function rollWild(save, rng, zone) {
  const missing = zone.pool.filter(i => !save.seen.includes(i));
  const pool = missing.length && rng() < 0.6 ? missing : zone.pool;
  const id = pool[Math.floor(rng() * pool.length)];
  const level = zone.level[0] + Math.floor(rng() * (zone.level[1] - zone.level[0] + 1));
  return {id, level};
}

/** Starts an encounter with `{id, level, boss}`. Marks the creature seen. */
export function createBattle(save, rng, {id, level: enemyLevel, boss = false}) {
  const hp = species[id].hp + (enemyLevel - BASE_LEVEL) * 4 + (boss ? 18 : 0);
  save.met = true;
  if (!save.seen.includes(id)) save.seen.push(id);
  return {id, hp, max: hp, level: enemyLevel, boss, busy: false, guard: false, turn: 0, focus: FOCUS_START, over: false};
}

export function captureChance(save, battle) {
  if (battle.boss) return 0;
  return Math.min(0.96, 0.25 + (1 - battle.hp / battle.max) * 0.67 + Math.max(0, level(save, save.active) - battle.level) * 0.025);
}

/** The player's attack. kind: 'attack' (quick strike) | 'element'. Mutates battle.hp. */
export function playerStrike(save, battle, kind, rng) {
  const eff = kind === 'element' ? effectiveness(save.active, battle.id) : 1;
  const base = kind === 'element' ? elementPower(save, save.active) : 10;
  const damage = Math.max(3, Math.round((base + (level(save, save.active) - BASE_LEVEL) * 1.25 + rng() * 4) * eff));
  battle.hp = Math.max(0, battle.hp - damage);
  return {kind, damage, eff, move: kind === 'element' ? moveName(save, save.active) : 'Quick strike', defeated: battle.hp === 0};
}

export function usePotion(save) {
  const c = companion(save);
  if (save.potions < 1 || c.hp === maxHP(save, save.active)) return null;
  save.potions--;
  const healed = Math.min(POTION_HEAL, maxHP(save, save.active) - c.hp);
  c.hp += healed;
  return healed;
}

/** Spends an orb; returns false if none is available or the target cannot be captured. */
export function throwOrb(save, battle) {
  if (battle.boss || save.orbs < 1) return false;
  save.orbs--;
  return true;
}

/** The enemy's attack on the active companion. Advances the turn. */
export function enemyAttack(save, battle, rng) {
  const element = battle.turn % 2 === 1;
  const eff = element ? effectiveness(battle.id, save.active) : 1;
  const damage = Math.max(
    2,
    Math.round((7 + (battle.level - BASE_LEVEL) * 0.65 + rng() * 3) * (battle.boss ? 1.08 : 1) * eff * (battle.guard ? GUARD_FACTOR : 1)),
  );
  const c = companion(save);
  c.hp = Math.max(0, c.hp - damage);
  battle.guard = false;
  battle.turn++;
  return {damage, element};
}

/** After an enemy hit: swap in a healthy companion, or report that the team is out. */
export function resolveFaint(save) {
  if (companion(save).hp > 0) return {status: 'ok'};
  const replacement = save.party.find(i => i !== save.active && companion(save, i).hp > 0);
  if (replacement === undefined) return {status: 'lost'};
  const fainted = save.active;
  save.active = replacement;
  return {status: 'switched', fainted, replacement};
}

/** Applies victory rewards. Returns data for the result screen. */
export function resolveWin(save, battle, rng) {
  const newSeal = battle.boss && !save.badges.includes(save.region);
  const reward = newSeal ? 60 : battle.boss ? 12 : 8 + Math.floor(rng() * 7);
  const xp = newSeal ? 65 : battle.boss ? 20 : 24;
  save.wins++;
  save.coins += reward;
  const xpText = awardXP(save, xp).text;
  if (newSeal) {
    save.badges.push(save.region);
    save.potions += 2;
    healTeam(save);
  }
  return {newSeal, reward, xp, xpText, id: battle.id, boss: battle.boss};
}

/** Applies a successful capture. */
export function resolveCapture(save, battle) {
  const id = battle.id;
  const isNew = !save.caught.includes(id);
  let joined = null;
  if (isNew) {
    save.caught.push(id);
    joined = save.party.length < PARTY_SIZE ? 'team' : 'reserve'; // a full team never loses a capture: it waits in the reserve
    if (joined === 'team') save.party.push(id);
    save.team[id] = {xp: Math.max(0, battle.level - BASE_LEVEL) * XP_PER_LEVEL, hp: 0};
    save.team[id].hp = maxHP(save, id);
  }
  const xpText = awardXP(save, 20).text;
  save.coins += 10;
  save.wins++;
  return {isNew, id, joined, xpText};
}

/** A lost battle: heal everyone; the controller moves the player to camp. */
export function resolveLoss(save) {
  const id = save.active;
  healTeam(save);
  return {id};
}

const snapshot = (save, battle) => ({active: save.active, mine: companion(save).hp, enemy: battle.hp, focus: battle.focus});
const gainFocus = battle => (battle.focus = Math.min(FOCUS_MAX, battle.focus + FOCUS_GAIN));

/** The persisted part of a battle (no UI flags). */
export const battleCheckpoint = battle =>
  battle && !battle.over
    ? {id: battle.id, hp: battle.hp, max: battle.max, level: battle.level, boss: battle.boss, guard: battle.guard, turn: battle.turn, focus: battle.focus}
    : null;

/**
 * Resolves one full round atomically: the player's action, then the enemy's reply (unless the battle just ended).
 * Everything that changes `save` (orbs, potions, HP, rewards, captures) happens here, exactly once; callers only
 * animate the returned `events`, each carrying an `after` snapshot for display.
 * action: {kind: 'attack'|'element'|'catch'|'potion'|'guard'|'switch', id?}
 * Returns null when the action is not allowed (battle over, no orbs/potions, invalid switch), otherwise
 * {events, ended: null|'win'|'caught'|'loss'}.
 */
export function resolveTurn(save, battle, action, rng) {
  if (battle.over) return null;
  const events = [];
  const push = event => events.push({...event, after: snapshot(save, battle)});
  let ended = null;
  if (action.kind === 'attack' || action.kind === 'element') {
    if (action.kind === 'element') {
      if (battle.focus < ELEMENT_COST) return null; // the special move needs Focus
      battle.focus -= ELEMENT_COST;
    } else gainFocus(battle);
    const strike = playerStrike(save, battle, action.kind, rng);
    push({type: 'strike', ...strike});
    if (strike.defeated) {
      ended = 'win';
      push({type: 'win', ...resolveWin(save, battle, rng)});
    }
  } else if (action.kind === 'catch') {
    if (!throwOrb(save, battle)) return null;
    push({type: 'throw'});
    if (rng() < captureChance(save, battle)) {
      ended = 'caught';
      push({type: 'caught', ...resolveCapture(save, battle)});
    } else push({type: 'break-free'});
  } else if (action.kind === 'potion') {
    const healed = usePotion(save);
    if (healed === null) return null;
    push({type: 'potion', healed});
  } else if (action.kind === 'guard') {
    battle.guard = true;
    gainFocus(battle);
    push({type: 'guard'});
  } else if (action.kind === 'switch') {
    if (!save.party.includes(action.id) || action.id === save.active || companion(save, action.id).hp <= 0) return null;
    save.active = action.id;
    push({type: 'switch', id: action.id});
  } else return null;
  if (!ended) {
    const hit = enemyAttack(save, battle, rng);
    push({type: 'enemy', ...hit});
    const faint = resolveFaint(save);
    if (faint.status === 'switched') push({type: 'faint-switch', fainted: faint.fainted, replacement: faint.replacement});
    else if (faint.status === 'lost') {
      ended = 'loss';
      push({type: 'loss', ...resolveLoss(save)});
    }
  }
  if (ended) battle.over = true;
  return {events, ended};
}
