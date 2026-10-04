/* Optional creature body-plan compiler. Outputs the ordinary flat runtime fields; sprites remain separately authored. */
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const object = value => value && typeof value === 'object' && !Array.isArray(value);

export function validateBodyPlan(plan) {
  const errors = [];
  if (!plan || !ID.test(plan.id ?? '') || !Array.isArray(plan.slots) || !plan.slots.length) return ['body plan needs a kebab-case id and non-empty slots'];
  const ids = new Set();
  for (const [i, slot] of plan.slots.entries()) {
    if (!ID.test(slot?.id ?? '') || ids.has(slot.id)) errors.push(`slots[${i}].id: must be unique lowercase kebab-case`);
    ids.add(slot?.id);
    if (!Array.isArray(slot?.accepts) || !slot.accepts.length || !slot.accepts.every(tag => typeof tag === 'string'))
      errors.push(`slots[${i}].accepts: needs compatible part tags`);
    if (slot?.excludes !== undefined && (!Array.isArray(slot.excludes) || !slot.excludes.every(tag => typeof tag === 'string')))
      errors.push(`slots[${i}].excludes: must be a list of incompatible part tags`);
    if (slot?.required !== undefined && typeof slot.required !== 'boolean') errors.push(`slots[${i}].required: must be boolean`);
  }
  return errors;
}

export function compileComposition(plan, parts, assignments, {modifierLimit = 0.5} = {}) {
  const errors = validateBodyPlan(plan);
  if (!object(parts) || !object(assignments)) errors.push('parts and assignments must be data objects');
  if (errors.length) return {errors};
  const abilities = new Set();
  const modifiers = {};
  const resolved = {};
  const resolvedTags = {};
  for (const slot of plan.slots) {
    const partId = assignments[slot.id];
    if (!partId) {
      if (slot.required) errors.push(`slot "${slot.id}" is required`);
      continue;
    }
    const part = parts[partId];
    if (!part) {
      errors.push(`slot "${slot.id}" references unknown part "${partId}"`);
      continue;
    }
    if (!Array.isArray(part.tags) || !part.tags.some(tag => slot.accepts.includes(tag)))
      errors.push(`part "${partId}" is not compatible with slot "${slot.id}"`);
    if (!Array.isArray(part.tags) || !part.tags.every(tag => typeof tag === 'string')) errors.push(`part "${partId}" tags must be strings`);
    if (resolved[slot.id]) errors.push(`slot "${slot.id}" is assigned more than once`);
    resolved[slot.id] = partId;
    resolvedTags[slot.id] = Array.isArray(part.tags) ? part.tags : [];
    for (const ability of part.abilities ?? []) if (typeof ability === 'string') abilities.add(ability);
    for (const [key, value] of Object.entries(part.modifiers ?? {})) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < -modifierLimit || value > modifierLimit)
        errors.push(`part "${partId}" modifier "${key}" is outside ±${modifierLimit}`);
      else modifiers[key] = (modifiers[key] ?? 0) + value;
    }
  }
  for (const slot of plan.slots) {
    const incompatible = (slot.excludes ?? []).find(tag => Object.values(resolvedTags).some(tags => tags.includes(tag)));
    if (incompatible) errors.push(`slot "${slot.id}" excludes assigned part tag "${incompatible}"`);
  }
  for (const [key, value] of Object.entries(modifiers))
    if (Math.abs(value) > modifierLimit) errors.push(`combined modifier "${key}" is outside ±${modifierLimit}`);
  for (const slotId of Object.keys(assignments)) if (!plan.slots.some(slot => slot.id === slotId)) errors.push(`unknown slot "${slotId}"`);
  if (errors.length) return {errors};
  return {errors: [], species: {parts: resolved, abilities: [...abilities].sort(), modifiers}};
}
