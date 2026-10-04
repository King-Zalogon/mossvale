/* Optional, linear event-driven objective lifecycle. Current compact objectives keep their existing format. */
import {markSceneRun} from './scenes.js';

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const object = value => value && typeof value === 'object' && !Array.isArray(value);

export function validateObjectiveEvents(definition) {
  const errors = [];
  if (!definition || definition.format !== 1 || !ID.test(definition.id ?? '') || !Array.isArray(definition.stages) || !definition.stages.length)
    return ['objective-event: needs { format: 1, id, stages: [...] }'];
  if (definition.title !== undefined && (typeof definition.title !== 'string' || !definition.title.trim())) errors.push('title: must be non-empty text');
  const ids = new Set();
  for (const [i, stage] of definition.stages.entries()) {
    if (!ID.test(stage?.id ?? '') || ids.has(stage.id)) errors.push(`stages[${i}].id: must be unique lowercase kebab-case`);
    ids.add(stage?.id);
    if (stage?.label !== undefined && (typeof stage.label !== 'string' || !stage.label.trim())) errors.push(`stages[${i}].label: must be non-empty text`);
    if (!object(stage?.on) || typeof stage.on.type !== 'string' || !stage.on.type) errors.push(`stages[${i}].on.type: required event type`);
    if (stage?.count !== undefined && (!Number.isInteger(stage.count) || stage.count < 1 || stage.count > 99))
      errors.push(`stages[${i}].count: must be an integer from 1 to 99`);
    if (stage?.next !== undefined && (typeof stage.next !== 'string' || !ID.test(stage.next))) errors.push(`stages[${i}].next: must name a stage id`);
    if (stage?.reward !== undefined) {
      if (!object(stage.reward)) errors.push(`stages[${i}].reward: must be a data object`);
      else {
        const keys = Object.keys(stage.reward);
        if (!keys.length || keys.some(key => !['coins', 'potions', 'orbs'].includes(key))) errors.push(`stages[${i}].reward: accepts coins, potions and orbs`);
        for (const key of keys)
          if (!Number.isInteger(stage.reward[key]) || stage.reward[key] < 0 || stage.reward[key] > 999)
            errors.push(`stages[${i}].reward.${key}: must be an integer from 0 to 999`);
        if (stage.next) errors.push(`stages[${i}].reward: rewards must be on a terminal stage`);
      }
    }
  }
  for (const [i, stage] of definition.stages.entries())
    if (stage?.next && !ids.has(stage.next)) errors.push(`stages[${i}].next: unknown stage "${stage.next}"`);
  const byId = new Map(definition.stages.map(stage => [stage?.id, stage]));
  for (const stage of definition.stages) {
    const seen = new Set([stage.id]);
    let next = stage.next;
    while (next && byId.has(next)) {
      if (seen.has(next)) {
        errors.push(`stages (${stage.id}): next chain contains a cycle at "${next}"`);
        break;
      }
      seen.add(next);
      next = byId.get(next).next;
    }
  }
  const reachable = new Set();
  let next = definition.stages[0]?.id;
  while (next && byId.has(next) && !reachable.has(next)) {
    reachable.add(next);
    next = byId.get(next).next;
  }
  for (const stage of definition.stages) if (!reachable.has(stage.id)) errors.push(`stages (${stage.id}): unreachable from the first stage`);
  return errors;
}

export function createObjectiveState(definition) {
  const errors = validateObjectiveEvents(definition);
  if (errors.length) throw new Error(errors.join('\n'));
  return {id: definition.id, status: 'available', stage: definition.stages[0].id, count: 0, paid: []};
}

export function validateObjectiveState(state, definition) {
  const errors = [];
  if (!state || state.id !== definition?.id) errors.push('state.id does not match objective definition');
  const stageIds = new Set(definition?.stages?.map(stage => stage.id) ?? []);
  if (!stageIds.has(state?.stage)) errors.push(`state.stage names unknown stage "${state?.stage ?? ''}"`);
  if (!['available', 'active', 'complete', 'rewarded'].includes(state?.status)) errors.push('state.status is invalid');
  const current = definition?.stages?.find(stage => stage.id === state?.stage);
  const progress = state?.count ?? 0;
  if (!Number.isInteger(progress) || progress < 0 || progress >= (current?.count ?? 1)) errors.push('state.count is outside the current stage range');
  const rewardStages = new Set((definition?.stages ?? []).filter(stage => stage.reward).map(stage => stage.id));
  if (!Array.isArray(state?.paid)) errors.push('state.paid must be a list');
  else {
    if (new Set(state.paid).size !== state.paid.length) errors.push('state.paid contains duplicates');
    for (const stageId of state.paid) if (!rewardStages.has(stageId)) errors.push(`state.paid contains non-reward stage "${stageId}"`);
  }
  return errors;
}

/** Applies at most one stage per event. `reward` is returned once and the caller owns persistence. */
export function applyObjectiveEvent(state, definition, event) {
  const errors = validateObjectiveEvents(definition);
  if (errors.length) throw new Error(errors.join('\n'));
  const stateErrors = validateObjectiveState(state, definition);
  if (stateErrors.length) return {changed: false, errors: stateErrors};
  if (state.id !== definition.id || state.status === 'complete' || state.status === 'rewarded') return {changed: false};
  const stage = definition.stages.find(item => item.id === state.stage);
  if (!stage || !event || event.type !== stage.on.type || Object.entries(stage.on).some(([key, value]) => event[key] !== value)) return {changed: false};
  state.status = 'active';
  state.count = (state.count ?? 0) + 1;
  const required = stage.count ?? 1;
  if (state.count < required) return {changed: true, status: state.status, stage: state.stage, count: state.count};
  state.count = 0;
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

/** A collision-free scene-journal ID for a completed objective stage. */
export function objectiveStageEventId(definition, stage) {
  const segment = value => `${value.length}-${value}`;
  return `objective-${segment(definition.id)}-${segment(stage.id)}`;
}

function objectiveProgressEventId(definition, stage, count) {
  return `${objectiveStageEventId(definition, stage)}-progress-${count}`;
}

/** Rebuilds linear progress from the same bounded event journal used by ordinary map scenes. */
export function restoreObjectiveState(definition, eventKeys = []) {
  const state = createObjectiveState(definition);
  const recorded = new Set(eventKeys.map(key => key.slice(key.indexOf('/') + 1)));
  for (let count = 0; count < definition.stages.length; count++) {
    const stage = definition.stages.find(item => item.id === state.stage);
    if (!stage) break;
    const required = stage.count ?? 1;
    if (recorded.has(objectiveStageEventId(definition, stage))) {
      let changed = true;
      for (let progress = 0; progress < required; progress++) changed = applyObjectiveEvent(state, definition, stage.on).changed && changed;
      if (!changed) break;
      continue;
    }
    for (let progress = 1; progress < required && recorded.has(objectiveProgressEventId(definition, stage, progress)); progress++) {
      if (!applyObjectiveEvent(state, definition, stage.on).changed) break;
    }
    break;
  }
  return state;
}

/** Applies and journals one stage atomically from the caller's point of view; reward application is a caller concern. */
export function recordObjectiveEvent(save, definition, event, mapId) {
  const state = restoreObjectiveState(definition, save.events ?? []);
  const stage = definition.stages.find(item => item.id === state.stage);
  const result = applyObjectiveEvent(state, definition, event);
  if (!result.changed) return {changed: false, state};
  const completed = !stage || state.stage !== stage.id || state.status === 'complete' || state.status === 'rewarded';
  const marker = stage && (completed ? objectiveStageEventId(definition, stage) : objectiveProgressEventId(definition, stage, state.count));
  if (!marker || !markSceneRun(save, mapId, marker)) return {changed: false, reason: 'event-limit', state};
  return {changed: true, state: restoreObjectiveState(definition, save.events), ...result};
}
