/* Pure battle rules. All randomness comes from the injected `rng`; all state lives in `save` and the battle object. */
import {species} from '../data/species.js';
import {moves} from '../data/moves.js';
import {BASE_LEVEL, UNSEEN_PREFERENCE, ELEMENT_COST, FOCUS_GAIN, FOCUS_MAX, FOCUS_START, GUARD_FACTOR, PARTY_SIZE, XP_PER_LEVEL} from '../config.js';
import {REWARDS} from '../data/economy.js';
import {BRACE_FACTOR, GUARDIAN_HP_BONUS, HEAVY_FACTOR, planOf, TACTICS} from '../data/tactics.js';
import {grant} from './economy.js';
import {claimInventory, inventoryToSupplies, rollDrop, syncInventorySupplies, useInventory} from './inventory.js';
import {awardXP, companion, effectiveness, elementPower, healTeam, level, maxHP, moveName} from './rules.js';

export const POTION_HEAL = 24;

function inventoryDrop(save, table, key, rng, rules) {
  if (!rules || !save.inventory) return [];
  const drop = rollDrop(rules, table, rng);
  if (!drop) return [];
  const result = claimInventory(save.inventory, key, [drop], rules);
  if (!result.ok) return [];
  Object.assign(save, inventoryToSupplies(save.inventory, save, rules));
  return result.grants;
}

/** Shrine challenges follow the current party's average level; ordinary encounters never scale. */
export function guardianLevel(save, guardian) {
  if (!save.party?.length) return guardian.level;
  const average = save.party.reduce((sum, id) => sum + level(save, id), 0) / save.party.length;
  return Math.max(guardian.level, Math.round(average));
}

/** Picks a different healthy companion if the active one is down. Returns false when the whole team is down. */
export function ensureHealthyCompanion(save) {
  if (companion(save).hp > 0) return true;
  const healthy = save.party.find(i => companion(save, i).hp > 0);
  if (healthy === undefined) return false;
  save.active = healthy;
  return true;
}

/** Weighted pick of one index from `ids` using the zone's weights. */
function weightedPick(zone, ids, rng) {
  const weights = ids.map(id => zone.weights?.[zone.pool.indexOf(id)] ?? 1);
  let roll = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ids.length; i++) if ((roll -= weights[i]) < 0) return ids[i];
  return ids.at(-1);
}

/** Picks a wild creature and level from an encounter zone (see mapdata.js). Prefers creatures not yet seen. */
export function rollWild(save, rng, zone) {
  const missing = zone.pool.filter(i => !save.seen.includes(i));
  const candidates = missing.length && rng() < UNSEEN_PREFERENCE ? missing : zone.pool;
  const id = weightedPick(zone, candidates, rng);
  const level = zone.level[0] + Math.floor(rng() * (zone.level[1] - zone.level[0] + 1));
  return {id, level};
}

/** How far to walk in `zone` before the next encounter. */
export function encounterDistance(zone, rng) {
  const [lo, hi] = zone?.distance ?? [4, 7];
  return lo + rng() * (hi - lo);
}

/** Starts an encounter with `{id, level, boss}`. Marks the creature seen. */
export function createBattle(save, rng, {id, level: enemyLevel, boss = false, tactic, power = 1}) {
  const hp = species[id].stats.hp + (enemyLevel - BASE_LEVEL) * 4 + (boss ? GUARDIAN_HP_BONUS : 0);
  save.met = true;
  if (!save.seen.includes(id)) save.seen.push(id);
  return {
    id,
    hp,
    max: hp,
    level: enemyLevel,
    boss,
    busy: false,
    guard: false,
    turn: 0,
    focus: FOCUS_START,
    tactic: boss ? tactic : undefined,
    power: boss ? power : 1,
    counterplay: [],
    over: false,
  };
}

function counterplayFor(save, battle, action) {
  if (!battle.boss) return [];
  return (TACTICS[battle.tactic]?.counterplay ?? []).filter(response => {
    if (response.action !== action.kind) return false;
    if (response.next && nextEnemyAction(battle) !== response.next) return false;
    if (response.previous && lastEnemyAction(battle) !== response.previous) return false;
    if (response.resistant && (action.id === undefined || effectiveness(battle.id, action.id) >= effectiveness(battle.id, save.active))) return false;
    return true;
  });
}

function recordCounterplay(save, battle, action) {
  const found = counterplayFor(save, battle, action);
  if (!found.length) return;
  battle.counterplay ??= [];
  for (const response of found) if (!battle.counterplay.includes(response.id)) battle.counterplay.push(response.id);
}

export function captureChance(save, battle) {
  if (battle.boss) return 0;
  return Math.min(0.96, 0.25 + (1 - battle.hp / battle.max) * 0.67 + Math.max(0, level(save, save.active) - battle.level) * 0.025);
}

/** The player's attack. kind: 'attack' (quick strike) | 'element'. Mutates battle.hp. */
export function playerStrike(save, battle, kind, rng) {
  const eff = kind === 'element' ? effectiveness(save.active, battle.id) : 1;
  const base = kind === 'element' ? elementPower(save, save.active) : species[save.active].stats.attack;
  const braced = lastEnemyAction(battle) === 'brace';
  const tactic = battle.boss ? TACTICS[battle.tactic] : null;
  const braceFactor = braced ? (kind === 'element' ? (tactic?.braceElementFactor ?? BRACE_FACTOR) : (tactic?.braceQuickFactor ?? BRACE_FACTOR)) : 1;
  const damage = Math.max(3, Math.round((base + (level(save, save.active) - BASE_LEVEL) * 1.25 + rng() * 4) * eff * braceFactor));
  battle.hp = Math.max(0, battle.hp - damage);
  return {
    kind,
    damage,
    eff,
    braced,
    brokeBrace: braced && kind === 'element' && braceFactor > 1,
    move: kind === 'element' ? moveName(save, save.active) : 'Quick strike',
    defeated: battle.hp === 0,
  };
}

export function usePotion(save) {
  const c = companion(save);
  if (save.potions < 1 || c.hp === maxHP(save, save.active)) return null;
  save.potions--;
  const healed = Math.min(POTION_HEAL, maxHP(save, save.active) - c.hp);
  c.hp += healed;
  return healed;
}

function useBattleItem(save, item, rules) {
  if (!rules || !save.inventory) return null;
  const healed = useInventory(save.inventory, item, {hp: companion(save).hp, maxHp: maxHP(save, save.active)}, rules);
  if (!healed.ok) return null;
  Object.assign(save, inventoryToSupplies(save.inventory, save, rules));
  return healed;
}

/** Spends an orb; returns false if none is available or the target cannot be captured. */
export function throwOrb(save, battle, rules) {
  if (battle.boss || save.orbs < 1) return false;
  if (rules) syncInventorySupplies(save, rules);
  save.orbs--;
  if (rules) syncInventorySupplies(save, rules);
  return true;
}

/** What the enemy will do on its next turn (from its tactic's repeating pattern). */
export function nextEnemyAction(battle) {
  const plan = planOf(battle.tactic);
  return plan[battle.turn % plan.length];
}

/** What the enemy did on its previous turn, or null before it has acted. */
export function lastEnemyAction(battle) {
  const plan = planOf(battle.tactic);
  return battle.turn > 0 ? plan[(battle.turn - 1) % plan.length] : null;
}

/** The enemy's turn on the active companion. Advances the turn. `action` says what it did ('charge' and 'brace' do no damage). */
export function enemyAttack(save, battle, rng) {
  const action = nextEnemyAction(battle);
  const element = action === 'element';
  const interrupted = action === 'charge' && battle.disruptCharge === true;
  delete battle.disruptCharge;
  const eff = element ? effectiveness(battle.id, save.active) : 1;
  const attacks = action !== 'charge' && action !== 'brace';
  const foe = species[battle.id];
  const defender = species[save.active];
  const tactic = battle.boss ? TACTICS[battle.tactic] : null;
  const repeatElement = element && lastEnemyAction(battle) === 'element';
  const raw =
    (7 + (foe.stats.attack - 10) * 0.4 + (battle.level - BASE_LEVEL) * 0.65 + rng() * 3) *
    (element ? (moves[foe.move]?.power ?? 1) : 1) *
    (battle.boss ? 1.08 : 1) *
    (battle.power ?? 1) *
    eff *
    (action === 'heavy' ? HEAVY_FACTOR : 1) *
    (repeatElement ? (tactic?.repeatElementFactor ?? 1) : 1) *
    (1 - (defender.stats.defense - 10) / 100);
  const unguarded = attacks ? Math.max(2, Math.round(raw)) : 0;
  const damage = attacks ? Math.max(2, Math.round(raw * (battle.guard ? GUARD_FACTOR : 1))) : 0;
  const c = companion(save);
  c.hp = Math.max(0, c.hp - damage);
  const counter = battle.guard && action === 'heavy' ? Math.round((unguarded - damage) * (tactic?.guardRiposteFactor ?? 0)) : 0;
  if (counter > 0) battle.hp = Math.max(0, battle.hp - counter);
  const recovered =
    action === 'charge' && !interrupted && tactic?.recoveryOnCharge && battle.hp > 0
      ? Math.min(battle.max - battle.hp, Math.ceil(battle.max * tactic.recoveryOnCharge))
      : 0;
  battle.hp += recovered;
  battle.guard = false;
  battle.turn++;
  return {damage, element, action, counter, recovered, interrupted, defeated: battle.hp === 0};
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
export function resolveWin(save, battle, rng, ctx = {}) {
  const newSeal = battle.boss && !save.badges.includes(save.region);
  const seal = ctx.sealReward ?? {coins: 60, potions: 2, xp: 65}; // from the shrine in the map data
  const [lo, hi] = REWARDS.wild.coins;
  const responses = (TACTICS[battle.tactic]?.counterplay ?? []).filter(response => battle.counterplay?.includes(response.id));
  const responseBonus = responses.reduce(
    (sum, response) => ({
      coins: sum.coins + (response.reward?.coins ?? 0),
      potions: sum.potions + (response.reward?.potions ?? 0),
      xp: sum.xp + (response.reward?.xp ?? 0),
    }),
    {coins: 0, potions: 0, xp: 0},
  );
  const coins = (newSeal ? seal.coins : battle.boss ? REWARDS.guardianRepeat.coins : lo + Math.floor(rng() * (hi - lo + 1))) + responseBonus.coins;
  const xp = (newSeal ? seal.xp : battle.boss ? REWARDS.guardianRepeat.xp : REWARDS.wild.xp) + responseBonus.xp;
  const itemRewards = battle.boss ? [] : inventoryDrop(save, 'wild-win', `defeat-${battle.id}-${save.wins + 1}`, rng, ctx.inventoryRules);
  save.wins++;
  const got = grant(save, {coins, potions: (newSeal ? seal.potions : 0) + responseBonus.potions});
  if (ctx.inventoryRules) syncInventorySupplies(save, ctx.inventoryRules);
  const xpText = awardXP(save, xp).text;
  if (newSeal) {
    save.badges.push(save.region);
    healTeam(save);
  }
  return {
    newSeal,
    reward: got.coins,
    xp,
    potions: got.potions,
    xpText,
    id: battle.id,
    boss: battle.boss,
    responseLabels: responses.map(response => response.label),
    responseCoins: responseBonus.coins,
    responseXp: responseBonus.xp,
    responsePotions: responseBonus.potions,
    itemRewards,
  };
}

/** Applies a successful capture. */
export function resolveCapture(save, battle, ctx = {}, rng = () => 0.5) {
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
  const itemRewards = inventoryDrop(save, 'capture', `capture-${battle.id}-${save.wins + 1}`, rng, ctx.inventoryRules);
  const xpText = awardXP(save, REWARDS.capture.xp).text;
  const got = grant(save, {coins: REWARDS.capture.coins});
  if (ctx.inventoryRules) syncInventorySupplies(save, ctx.inventoryRules);
  save.wins++;
  return {isNew, id, joined, xpText, coins: got.coins, xp: REWARDS.capture.xp, itemRewards};
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
    ? {
        id: battle.id,
        hp: battle.hp,
        max: battle.max,
        level: battle.level,
        boss: battle.boss,
        guard: battle.guard,
        turn: battle.turn,
        focus: battle.focus,
        tactic: battle.tactic,
        power: battle.power,
        counterplay: battle.counterplay ?? [],
      }
    : null;

/**
 * Resolves one full round atomically: the player's action, then the enemy's reply (unless the battle just ended).
 * Everything that changes `save` (orbs, potions, HP, rewards, captures) happens here, exactly once; callers only
 * animate the returned `events`, each carrying an `after` snapshot for display.
 * ctx: {sealReward} from the shrine's map data (optional).
 * action: {kind: 'attack'|'element'|'catch'|'potion'|'guard'|'switch', id?}
 * Returns null when the action is not allowed (battle over, no orbs/potions, invalid switch), otherwise
 * {events, ended: null|'win'|'caught'|'loss'}.
 */
export function resolveTurn(save, battle, action, rng, ctx = {}) {
  if (battle.over) return null;
  const events = [];
  const push = event => events.push({...event, after: snapshot(save, battle)});
  let ended = null;
  if (action.kind === 'attack' || action.kind === 'element') {
    if (action.kind === 'element') {
      if (battle.focus < ELEMENT_COST) return null; // the special move needs Focus
      battle.focus -= ELEMENT_COST;
    } else gainFocus(battle);
    battle.disruptCharge = action.kind === 'element' && nextEnemyAction(battle) === 'charge' && TACTICS[battle.tactic]?.chargeInterruptedBy === 'element';
    recordCounterplay(save, battle, action);
    const strike = playerStrike(save, battle, action.kind, rng);
    push({type: 'strike', ...strike});
    if (strike.defeated) {
      ended = 'win';
      push({type: 'win', ...resolveWin(save, battle, rng, ctx)});
    }
  } else if (action.kind === 'catch') {
    if (!throwOrb(save, battle, ctx.inventoryRules)) return null;
    push({type: 'throw'});
    if (rng() < captureChance(save, battle)) {
      ended = 'caught';
      push({type: 'caught', ...resolveCapture(save, battle, ctx, rng)});
    } else push({type: 'break-free'});
  } else if (action.kind === 'potion') {
    const item = ctx.inventoryRules?.supplies?.potions;
    const healed = item ? useBattleItem(save, item, ctx.inventoryRules) : usePotion(save);
    if (healed === null) return null;
    push({type: item ? 'item' : 'potion', item, healed: item ? healed.healed : healed});
  } else if (action.kind === 'item') {
    const healed = useBattleItem(save, action.id, ctx.inventoryRules);
    if (healed === null) return null;
    push({type: 'item', item: action.id, healed: healed.healed});
  } else if (action.kind === 'guard') {
    battle.guard = true;
    gainFocus(battle);
    recordCounterplay(save, battle, action);
    push({type: 'guard'});
  } else if (action.kind === 'switch') {
    if (!save.party.includes(action.id) || action.id === save.active || companion(save, action.id).hp <= 0) return null;
    recordCounterplay(save, battle, action);
    save.active = action.id;
    push({type: 'switch', id: action.id});
  } else return null;
  if (!ended) {
    const hit = enemyAttack(save, battle, rng);
    push({type: 'enemy', ...hit});
    if (hit.defeated) {
      ended = 'win';
      push({type: 'win', ...resolveWin(save, battle, rng, ctx)});
    } else {
      const faint = resolveFaint(save);
      if (faint.status === 'switched') push({type: 'faint-switch', fainted: faint.fainted, replacement: faint.replacement});
      else if (faint.status === 'lost') {
        ended = 'loss';
        push({type: 'loss', ...resolveLoss(save)});
      }
    }
  }
  if (ended) battle.over = true;
  return {events, ended};
}
