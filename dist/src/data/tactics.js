import defaults from '../../maps/registries.json' with {type: 'json'};

export const DEFAULT_PATTERN = [...defaults.tactics.defaultPattern];
export let HEAVY_FACTOR = defaults.tactics.heavyFactor;
export let BRACE_FACTOR = defaults.tactics.braceFactor;
export let GUARDIAN_HP_BONUS = defaults.tactics.guardianHpBonus ?? 18;
export const TACTICS = structuredClone(defaults.tactics.patterns);
export const INTENT_TEXT = {...defaults.tactics.intentText};

export function replaceTactics(data) {
  DEFAULT_PATTERN.splice(0, DEFAULT_PATTERN.length, ...data.defaultPattern);
  HEAVY_FACTOR = data.heavyFactor;
  BRACE_FACTOR = data.braceFactor;
  GUARDIAN_HP_BONUS = data.guardianHpBonus ?? 18;
  for (const key of Object.keys(TACTICS)) delete TACTICS[key];
  Object.assign(TACTICS, structuredClone(data.patterns));
  for (const key of Object.keys(INTENT_TEXT)) delete INTENT_TEXT[key];
  Object.assign(INTENT_TEXT, data.intentText);
}

/** What the player sees under the battle log for a guardian's next move. */
export const planOf = tacticId => TACTICS[tacticId]?.pattern ?? DEFAULT_PATTERN;
