/* Optional, linear event-driven objective lifecycle. Current compact objectives keep their existing format. */
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const object = value => value && typeof value === 'object' && !Array.isArray(value);

export function validateObjectiveEvents(definition) {
  const errors = [];
  if (!definition || definition.format !== 1 || !ID.test(definition.id ?? '') || !Array.isArray(definition.stages) || !definition.stages.length)
    return ['objective-event: needs { format: 1, id, stages: [...] }'];
  const ids = new Set();
  for (const [i, stage] of definition.stages.entries()) {
    if (!ID.test(stage?.id ?? '') || ids.has(stage.id)) errors.push(`stages[${i}].id: must be unique lowercase kebab-case`);
    ids.add(stage?.id);
    if (!object(stage?.on) || typeof stage.on.type !== 'string' || !stage.on.type) errors.push(`stages[${i}].on.type: required event type`);
    if (stage?.next !== undefined && (typeof stage.next !== 'string' || !ID.test(stage.next))) errors.push(`stages[${i}].next: must name a stage id`);
    if (stage?.reward !== undefined && !object(stage.reward)) errors.push(`stages[${i}].reward: must be a data object`);
  }
  for (const [i, stage] of definition.stages.entries())
    if (stage?.next && !ids.has(stage.next)) errors.push(`stages[${i}].next: unknown stage "${stage.next}"`);
  return errors;
}

export function createObjectiveState(definition) {
  const errors = validateObjectiveEvents(definition);
  if (errors.length) throw new Error(errors.join('\n'));
  return {id: definition.id, status: 'available', stage: definition.stages[0].id, paid: []};
}

/** Applies at most one stage per event. `reward` is returned once and the caller owns persistence. */
export function applyObjectiveEvent(state, definition, event) {
  const errors = validateObjectiveEvents(definition);
  if (errors.length) throw new Error(errors.join('\n'));
  if (state.id !== definition.id || state.status === 'complete' || state.status === 'rewarded') return {changed: false};
  const stage = definition.stages.find(item => item.id === state.stage);
  if (!stage || !event || event.type !== stage.on.type || Object.entries(stage.on).some(([key, value]) => event[key] !== value)) return {changed: false};
  state.status = 'active';
  if (stage.next) {
    state.stage = stage.next;
    return {changed: true, status: state.status, stage: state.stage};
  }
  state.status = 'complete';
  if (stage.reward && !state.paid.includes(stage.id)) {
    state.paid.push(stage.id);
    state.status = 'rewarded';
    return {changed: true, status: state.status, reward: structuredClone(stage.reward)};
  }
  return {changed: true, status: state.status};
}
