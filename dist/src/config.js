/* Shared constants. No behavior. */
export const MAX_MAP_SIZE = 128;
export const TILE_W = 56;
export const TILE_H = 28;
export let XP_PER_LEVEL = 45;
export let BASE_LEVEL = 5;

// Growth (issue #25). Tune here; rules.js and the save codec derive everything from these.
export let MAX_LEVEL = 15; // bounded: the strongest planned enemy is level 11
export let MAX_XP = (MAX_LEVEL - BASE_LEVEL) * XP_PER_LEVEL; // xp is stored as a running total and clamped to this
export let MOVE_UPGRADE_LEVEL = 10; // elemental move grows stronger at this level
export let ELEMENT_POWER = 16;
export let UPGRADED_ELEMENT_POWER = 20;
export let BENCH_SHARE = 0.5; // companions that did not fight get this fraction of each XP award (minimum 1)
export let CATCH_UP_GAP = 2; // a fighter this many levels below the team's best earns bonus XP
export let CATCH_UP_BONUS = 1.5;

// Team (issue #17): up to PARTY_SIZE companions fight; everyone else waits in the reserve and still earns bench XP.
export let PARTY_SIZE = 3;

// Battle (issue #16). Focus is the special move's tradeoff: Quick strike and Guard build it, the elemental move spends it.
export let FOCUS_MAX = 3;
export let FOCUS_START = 2;
export let ELEMENT_COST = 1;
export let FOCUS_GAIN = 1;
export let GUARD_FACTOR = 0.35; // enemy damage multiplier while guarding
export let TYPE_ADVANTAGE = 1.6;
export let TYPE_DISADVANTAGE = 0.65;

// Movement (issue #15)
export const PLAYER_RADIUS = 0.25; // feet footprint, in tiles: terrain and solid props use the same size
export const MOVE_STEP = 1 / 60; // simulation sub-step so distance and collisions do not depend on the frame rate
export const FOLLOW_GAP = 1.0; // how far behind the player (along the walked path) the companion trails

// Encounter pacing (issue #26). Distance between encounters is per zone (default 4-7 tiles of walking in it).
export const GRACE_AFTER_BATTLE = 4; // seconds without an encounter after a fight or fleeing
export const GRACE_ON_ARRIVAL = 3; // seconds after changing maps or returning to camp
export const UNSEEN_PREFERENCE = 0.6; // chance an encounter picks a creature you have not met yet, if the zone has any

/** Apply pack-owned growth and battle tuning while keeping shared movement constants fixed. */
export function configurePackRules(progression, battle, moves) {
  XP_PER_LEVEL = progression.xpPerLevel;
  BASE_LEVEL = progression.baseLevel;
  MAX_LEVEL = progression.maxLevel;
  MAX_XP = (MAX_LEVEL - BASE_LEVEL) * XP_PER_LEVEL;
  MOVE_UPGRADE_LEVEL = progression.moveUpgradeLevel;
  BENCH_SHARE = progression.benchShare;
  CATCH_UP_GAP = progression.catchUpGap;
  CATCH_UP_BONUS = progression.catchUpBonus;
  PARTY_SIZE = progression.partySize;
  ELEMENT_POWER = moves.elemental.power;
  UPGRADED_ELEMENT_POWER = moves.elemental.upgradedPower;
  ELEMENT_COST = moves.elemental.focusCost;
  FOCUS_GAIN = moves.elemental.focusGain;
  TYPE_ADVANTAGE = moves.strongMultiplier;
  TYPE_DISADVANTAGE = moves.weakMultiplier;
  FOCUS_MAX = battle.focusMax;
  FOCUS_START = battle.focusStart;
  GUARD_FACTOR = battle.guardFactor;
}
