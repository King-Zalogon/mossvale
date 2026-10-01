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
export const ELEMENT_POWER = 12;
export const UPGRADED_ELEMENT_POWER = 16;
export const BENCH_SHARE = 0.5; // companions that did not fight get this fraction of each XP award (minimum 1)
export const CATCH_UP_GAP = 2; // a fighter this many levels below the team's best earns bonus XP
export const CATCH_UP_BONUS = 1.5;

// Team (issue #17): up to PARTY_SIZE companions fight; everyone else waits in the reserve and still earns bench XP.
export const PARTY_SIZE = 3;
