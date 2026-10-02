/* Goals and short NPC lines as data (dist/maps/objectives.json). Deliberately tiny: a chain of objectives, each
   finished by one condition, plus optional lines picked by condition. No branching, no scripting.
   Conditions: {flag}, {met}, {caught: N | "all"}, {seen: N | "all"}, {visited: mapId}, {all: [...]}, {not: cond}. */
import {flagDone} from './rules.js';

export const OBJECTIVES_FORMAT = 1;
const FLAG = /^[a-z0-9]+(?:-[a-z0-9]+)*\.(seal|chest)$/;

/** Does `save` satisfy the condition? `ctx` = {speciesCount, regions}. Unknown conditions are false. */
export function holds(cond, save, ctx) {
  if (!cond || typeof cond !== 'object') return true; // no condition means "always"
  if ('flag' in cond) return flagDone(save, cond.flag);
  if ('met' in cond) return save.met === cond.met;
  if ('caught' in cond) return save.caught.length >= (cond.caught === 'all' ? ctx.speciesCount : cond.caught);
  if ('seen' in cond) return save.seen.length >= (cond.seen === 'all' ? ctx.speciesCount : cond.seen);
  if ('visited' in cond) return save.visited.includes(ctx.regions.findIndex(r => r.id === cond.visited));
  if ('all' in cond) return cond.all.every(c => holds(c, save, ctx));
  if ('not' in cond) return !holds(cond.not, save, ctx);
  return false;
}

const fill = (text, save, ctx) => text.replaceAll('{caught}', save.caught.length).replaceAll('{total}', ctx.speciesCount);

/** The first objective whose `done` condition is not met yet (the last one never finishes). */
export function currentObjective(save, objectives, ctx) {
  const o = objectives.find(item => item.done && !holds(item.done, save, ctx)) ?? objectives.at(-1);
  const here = o.map === undefined || ctx.regions[save.region]?.id === o.map;
  return {
    id: o.id,
    step: o.step,
    title: o.title,
    copy: o.copy,
    pin: here ? o.pin : (o.pinElsewhere ?? o.pin),
    lines: (o.lines ?? []).map(l => [holds(l.done, save, ctx), fill(l.text, save, ctx)]),
    map: o.map,
  };
}

/** The first line whose `when` holds (a line without `when` is the fallback), or null. */
export function pickLine(lines, save, ctx) {
  const hit = (lines ?? []).find(l => holds(l.when, save, ctx));
  return hit ? fill(hit.text, save, ctx) : null;
}

/** Structural checks on the objectives file. Returns readable errors. */
export function validateObjectives(data, {mapIds}) {
  const errors = [];
  const at = (where, msg) => errors.push(`objectives: ${where}: ${msg}`);
  if (!data || data.format !== OBJECTIVES_FORMAT || !Array.isArray(data.objectives) || !data.objectives.length)
    return [`objectives: needs { format: ${OBJECTIVES_FORMAT}, objectives: [...] }`];
  const checkCond = (where, c) => {
    if (c === undefined) return;
    if (!c || typeof c !== 'object' || Array.isArray(c)) return at(where, 'condition must be an object');
    const keys = Object.keys(c);
    if (keys.length !== 1) return at(where, `condition needs exactly one key, got ${JSON.stringify(keys)}`);
    const [k] = keys;
    if (k === 'flag') {
      if (!FLAG.test(c.flag) || !mapIds.has(c.flag.split('.')[0])) at(where, `flag "${c.flag}" must be <map-id>.seal or <map-id>.chest of an existing map`);
    } else if (k === 'met') {
      if (typeof c.met !== 'boolean') at(where, 'met must be true or false');
    } else if (k === 'caught' || k === 'seen') {
      if (!(c[k] === 'all' || (Number.isInteger(c[k]) && c[k] >= 0))) at(where, `${k} must be a count or "all"`);
    } else if (k === 'visited') {
      if (!mapIds.has(c.visited)) at(where, `visited names unknown map "${c.visited}"`);
    } else if (k === 'all') {
      if (!Array.isArray(c.all)) at(where, 'all must be a list');
      else c.all.forEach((x, i) => checkCond(`${where}.all[${i}]`, x));
    } else if (k === 'not') checkCond(where + '.not', c.not);
    else at(where, `unknown condition "${k}"`);
  };
  const ids = new Set();
  data.objectives.forEach((o, i) => {
    const where = `objectives[${i}] (${o?.id})`;
    if (typeof o?.id !== 'string' || ids.has(o.id)) at(where, 'needs a unique id');
    ids.add(o?.id);
    for (const key of ['step', 'title', 'copy', 'pin']) if (typeof o?.[key] !== 'string') at(`${where}.${key}`, 'required text');
    if (o?.map !== undefined && !mapIds.has(o.map)) at(where + '.map', `unknown map "${o.map}"`);
    checkCond(where + '.done', o?.done);
    if (i < data.objectives.length - 1 && !o?.done) at(where + '.done', 'only the last objective may be open-ended');
    (o?.lines ?? []).forEach((l, j) => {
      if (typeof l?.text !== 'string') at(`${where}.lines[${j}].text`, 'required text');
      checkCond(`${where}.lines[${j}].done`, l?.done);
    });
  });
  return errors;
}

/** Validates the `when` conditions of NPC/sign lines found in maps. */
export function validateLines(lines, where, {mapIds}) {
  const errors = [];
  (lines ?? []).forEach((l, i) => {
    if (typeof l?.text !== 'string') errors.push(`${where}.lines[${i}].text: required text`);
    errors.push(
      ...validateObjectives(
        {format: OBJECTIVES_FORMAT, objectives: [{id: 'x', step: '', title: '', copy: '', pin: '', lines: [{text: l?.text ?? '', done: l?.when}]}]},
        {mapIds},
      ).map(e => `${where}.lines[${i}].when: ${e.split(': ').slice(2).join(': ')}`),
    );
  });
  return errors;
}

/** Every milestone flag an objective list depends on. */
export function collectFlags(objectives) {
  const flags = new Set();
  const walk = c => {
    if (!c || typeof c !== 'object') return;
    if (c.flag) flags.add(c.flag);
    for (const child of c.all ?? []) walk(child);
    walk(c.not);
  };
  for (const o of objectives) {
    walk(o.done);
    for (const l of o.lines ?? []) walk(l.done);
  }
  return flags;
}
