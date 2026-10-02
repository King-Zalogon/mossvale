/* Shared constants. No behavior. */
export const MAX_MAP_SIZE = 64;
export const TILE_W = 56;
export const TILE_H = 28;
export const XP_PER_LEVEL = 45;
export const BASE_LEVEL = 5;

// Growth (issue #25). Tune here; rules.js and the save codec derive everything from these.
export const MAX_LEVEL = 15; // bounded: the strongest planned enemy is level 11
export const MAX_XP = (MAX_LEVEL - BASE_LEVEL) * XP_PER_LEVEL; // xp is stored as a running total and clamped to this
export const MOVE_UPGRADE_LEVEL = 10; // elemental move grows stronger at this level
export const ELEMENT_POWER = 16;
export const UPGRADED_ELEMENT_POWER = 20;
export const BENCH_SHARE = 0.5; // companions that did not fight get this fraction of each XP award (minimum 1)
export const CATCH_UP_GAP = 2; // a fighter this many levels below the team's best earns bonus XP
export const CATCH_UP_BONUS = 1.5;

// Team (issue #17): up to PARTY_SIZE companions fight; everyone else waits in the reserve and still earns bench XP.
export const PARTY_SIZE = 3;

// Battle (issue #16). Focus is the special move's tradeoff: Quick strike and Guard build it, the elemental move spends it.
export const FOCUS_MAX = 3;
export const FOCUS_START = 2;
export const ELEMENT_COST = 1;
export const FOCUS_GAIN = 1;
export const GUARD_FACTOR = 0.35; // enemy damage multiplier while guarding

// Movement (issue #15)
export const PLAYER_RADIUS = 0.25; // feet footprint, in tiles: terrain and solid props use the same size
export const MOVE_STEP = 1 / 60; // simulation sub-step so distance and collisions do not depend on the frame rate
export const FOLLOW_GAP = 1.0; // how far behind the player (along the walked path) the companion trails

// Encounter pacing (issue #26). Distance between encounters is per zone (default 4-7 tiles of walking in it).
export const GRACE_AFTER_BATTLE = 4; // seconds without an encounter after a fight or fleeing
export const GRACE_ON_ARRIVAL = 3; // seconds after changing maps or returning to camp
export const UNSEEN_PREFERENCE = 0.6; // chance an encounter picks a creature you have not met yet, if the zone has any
