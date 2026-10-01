/* Pure game rules over a runtime save (species/region *indexes*). No DOM, timers or randomness. */
import {species} from '../data/species.js';
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
  UPGRADED_ELEMENT_POWER,
  XP_PER_LEVEL,
} from '../config.js';

export const level = (save, id) => Math.min(MAX_LEVEL, BASE_LEVEL + Math.floor((save.team[id]?.xp || 0) / XP_PER_LEVEL));
export const maxHP = (save, id) => species[id].hp + (level(save, id) - BASE_LEVEL) * 4;
export const companion = (save, id = save.active) => save.team[id];
/** Milestone flags used by map data: `<region-id>.seal` (shrine guardian beaten) and `<region-id>.chest` (chest opened). */
export function flagDone(save, flag) {
  const [regionId, kind] = flag.split('.');
  const i = regions.findIndex(r => r.id === regionId);
  return kind === 'seal' ? save.badges.includes(i) : save.chests.includes(i);
}

export const unlocked = (save, regionId) => regionId === 0 || save.badges.includes(regionId - 1);

export function effectiveness(attacker, defender) {
  const a = species[attacker];
  const type = species[defender].type;
  return a.strong.includes(type) ? 1.6 : a.weak.includes(type) ? 0.65 : 1;
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

/** Progress inside the current level for the HUD: `{into, needed, maxed}`. */
export function xpProgress(save, id) {
  const xp = save.team[id]?.xp || 0;
  return level(save, id) >= MAX_LEVEL ? {into: XP_PER_LEVEL, needed: XP_PER_LEVEL, maxed: true} : {into: xp % XP_PER_LEVEL, needed: XP_PER_LEVEL, maxed: false};
}

/** Elemental move name and power; the move grows stronger at MOVE_UPGRADE_LEVEL. */
export const moveUpgraded = (save, id) => level(save, id) >= MOVE_UPGRADE_LEVEL;
export const moveName = (save, id) => species[id].move + (moveUpgraded(save, id) ? '+' : '');
export const elementPower = (save, id) => (moveUpgraded(save, id) ? UPGRADED_ELEMENT_POWER : ELEMENT_POWER);

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

/** Current story objective as plain data for the HUD. */
export function objective(save) {
  if (save.caught.length < 2) {
    return {
      title: 'A friend in the grass',
      copy: 'Find a wild creature, weaken it, then throw a capture orb.',
      lines: [
        [save.met, 'Meet a wild creature'],
        [save.caught.length > 1, 'Catch your first new friend'],
      ],
      pin: 'Explore the tall grass',
      step: '01',
    };
  }
  for (let i = 0; i < 3; i++) {
    if (save.badges.includes(i)) continue;
    return {
      title: i === 0 ? 'Awaken the meadow' : i === 1 ? 'The heart of Amber Ridge' : 'A light in the snow',
      copy:
        i === 0
          ? 'Visit the blue crystal shrine north of camp and challenge its guardian.'
          : `Travel to ${regions[i].name} and awaken its shrine. A strong team helps.`,
      lines: [
        [save.badges.includes(i), `Earn the ${regions[i].seal.toLowerCase()}`],
        [save.visited.includes(i), `Explore ${regions[i].short.toLowerCase()}`],
      ],
      pin: save.region === i ? 'Follow the blue shrine marker north' : `Take the eastern trail to ${regions[i].short}`,
      step: '0' + (i + 2),
      region: i,
    };
  }
  const all = save.caught.length === 8;
  return {
    title: all ? 'Keeper of the isles' : 'Every friend has a story',
    copy: all
      ? 'All three shrines are awake, and every creature has a place in your journal. Keep exploring.'
      : 'The shrines are awake. Explore all three regions to befriend the remaining creatures.',
    lines: [
      [true, 'Awaken all three shrines'],
      [all, `Befriend every species (${save.caught.length} / 8)`],
    ],
    pin: all ? 'All shrines awakened · Keep exploring' : 'Find the remaining creatures',
    step: '05',
  };
}
