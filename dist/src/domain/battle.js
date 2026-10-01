/* Pure battle rules. All randomness comes from the injected `rng`; all state lives in `save` and the battle object. */
import {species} from '../data/species.js';
import {regions} from '../data/regions.js';
import {BASE_LEVEL, XP_PER_LEVEL} from '../config.js';
import {companion, effectiveness, gainXP, healTeam, level, maxHP} from './rules.js';

export const POTION_HEAL = 24;

/** Picks a different healthy companion if the active one is down. Returns false when the whole team is down. */
export function ensureHealthyCompanion(save) {
  if (companion(save).hp > 0) return true;
  const healthy = save.caught.find(i => companion(save, i).hp > 0);
  if (healthy === undefined) return false;
  save.active = healthy;
  return true;
}

/** Starts an encounter against `id` (random region creature when undefined). Marks the creature seen. */
export function createBattle(save, rng, id, boss = false) {
  const r = regions[save.region];
  if (id === undefined) {
    const missing = r.pool.filter(i => !save.seen.includes(i));
    const pool = missing.length && rng() < 0.6 ? missing : r.pool;
    id = pool[Math.floor(rng() * pool.length)];
  }
  const enemyLevel = boss ? r.bossLevel : r.level + Math.floor(rng() * 3);
  const hp = species[id].hp + (enemyLevel - BASE_LEVEL) * 4 + (boss ? 18 : 0);
  save.met = true;
  if (!save.seen.includes(id)) save.seen.push(id);
  return {id, hp, max: hp, level: enemyLevel, boss, busy: false, guard: false, turn: 0, token: Symbol('encounter')};
}

export function captureChance(save, battle) {
  if (battle.boss) return 0;
  return Math.min(0.96, 0.25 + (1 - battle.hp / battle.max) * 0.67 + Math.max(0, level(save, save.active) - battle.level) * 0.025);
}

/** The player's attack. kind: 'attack' (quick strike) | 'element'. Mutates battle.hp. */
export function playerStrike(save, battle, kind, rng) {
  const eff = kind === 'element' ? effectiveness(save.active, battle.id) : 1;
  const base = kind === 'element' ? 12 : 10;
  const damage = Math.max(3, Math.round((base + (level(save, save.active) - BASE_LEVEL) * 1.25 + rng() * 4) * eff));
  battle.hp = Math.max(0, battle.hp - damage);
  return {kind, damage, eff, defeated: battle.hp === 0};
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
  const damage = Math.max(2, Math.round((7 + (battle.level - BASE_LEVEL) * 0.65 + rng() * 3) * (battle.boss ? 1.08 : 1) * eff * (battle.guard ? 0.35 : 1)));
  const c = companion(save);
  c.hp = Math.max(0, c.hp - damage);
  battle.guard = false;
  battle.turn++;
  battle.busy = false;
  return {damage, element};
}

/** After an enemy hit: swap in a healthy companion, or report that the team is out. */
export function resolveFaint(save) {
  if (companion(save).hp > 0) return {status: 'ok'};
  const replacement = save.caught.find(i => i !== save.active && companion(save, i).hp > 0);
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
  const xpText = gainXP(save, xp);
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
  if (isNew) {
    save.caught.push(id);
    save.team[id] = {xp: Math.max(0, battle.level - BASE_LEVEL) * XP_PER_LEVEL, hp: 0};
    save.team[id].hp = maxHP(save, id);
  }
  const xpText = gainXP(save, 20);
  save.coins += 10;
  save.wins++;
  return {isNew, id, xpText};
}

/** A lost battle: heal everyone; the controller moves the player to camp. */
export function resolveLoss(save) {
  const id = save.active;
  healTeam(save);
  return {id};
}
