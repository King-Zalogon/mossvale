/* Pure game rules over a runtime save (species/region *indexes*). No DOM, timers or randomness. */
import {species} from '../data/species.js';
import {regions} from '../data/regions.js';
import {BASE_LEVEL, XP_PER_LEVEL} from '../config.js';

export const level = (save, id) => BASE_LEVEL + Math.floor((save.team[id]?.xp || 0) / XP_PER_LEVEL);
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

/** Adds XP and returns the player-facing summary line. */
export function gainXP(save, amount, id = save.active) {
  const before = level(save, id);
  companion(save, id).xp += amount;
  const after = level(save, id);
  if (after > before) {
    companion(save, id).hp = Math.min(maxHP(save, id), companion(save, id).hp + (after - before) * 12);
    return `${species[id].name} reached level ${after}!`;
  }
  return `${species[id].name} gained ${amount} XP.`;
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
