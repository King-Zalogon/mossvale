/* Optional authored help. Facts and heard levels reuse the canonical per-adventure scene-event journal. */
import {holds, validateLines} from './objectives.js';
import {companionCanUseRoute} from './companion-routes.js';
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function hintKey(mapId, hintId, level) {
  return `${mapId}/hint-${hintId}-${level}`;
}
export function validateHints(hints, {mapIds, species, where = 'hints'}) {
  if (!Array.isArray(hints)) return [`${where}: must be an array`];
  const errors = [],
    ids = new Set();
  if (hints.length > 16) errors.push(`${where}: limited to 16 hints per map`);
  for (const [i, hint] of hints.entries()) {
    const path = `${where}[${i}]`;
    if (!hint || !idPattern.test(hint.id ?? '') || ids.has(hint.id)) errors.push(`${path}.id: unique lowercase-kebab-case required`);
    ids.add(hint?.id);
    if (!hint?.when || !hint?.resolved) errors.push(`${path}: explicit when and resolved conditions required`);
    for (const condition of [hint?.when, hint?.resolved]) errors.push(...validateLines([{when: condition, text: 'hint'}], path, {mapIds}));
    if (
      !Array.isArray(hint?.levels) ||
      hint.levels.length < 1 ||
      hint.levels.length > 3 ||
      hint.levels.some(text => typeof text !== 'string' || !text.trim() || text.length > 320)
    )
      errors.push(`${path}.levels: 1–3 nonempty text levels, each at most 320 characters`);
    if (hint?.requires !== undefined) {
      if (!hint.requires || typeof hint.requires !== 'object' || Array.isArray(hint.requires)) {
        errors.push(`${path}.requires: expected capability object`);
        continue;
      }
      if (
        !hint.requires.ability ||
        Object.keys(hint.requires).some(key => !['ability', 'habitat'].includes(key)) ||
        !species.some(sp => companionCanUseRoute({requires: hint.requires}, sp))
      )
        errors.push(`${path}.requires: must name an actually registered ability and optional matching habitat`);
    }
    if (hint?.disclosure !== 'observation' && hint?.disclosure !== 'lead') errors.push(`${path}.disclosure: observation or lead required; no answer tier`);
  }
  return errors;
}
export function hintState(hint, mapId, save, context) {
  const heard = hint.levels.reduce((depth, _, level) => ((save.events ?? []).includes(hintKey(mapId, hint.id, level)) ? Math.max(depth, level + 1) : depth), 0);
  const resolved = holds(hint.resolved, save, context);
  const companion = context.species?.[save.active];
  const present = (save.party ?? []).includes(save.active) && (save.caught ?? []).includes(save.active) && (save.team?.[save.active]?.hp ?? 0) > 0;
  const capable = !hint.requires || (present && companionCanUseRoute({requires: hint.requires}, companion));
  return {id: hint.id, heard, resolved, relevant: !resolved && holds(hint.when, save, context) && capable};
}
export function nextHint(map, save, context) {
  for (const hint of map.hints ?? []) {
    const state = hintState(hint, map.id, save, context);
    if (state.relevant) {
      const level = Math.min(state.heard, hint.levels.length - 1);
      return {
        ...state,
        level,
        repeat: state.heard >= hint.levels.length,
        key: hintKey(map.id, hint.id, level),
        text: hint.levels[level],
        disclosure: hint.disclosure,
      };
    }
  }
  return null;
}
