/* A deliberately small, data-only vocabulary for reusable map interactions. */
import {holds, validateLines} from './objectives.js';

export const SCENE_ACTIONS = ['dialogue', 'reward', 'flag', 'challenge'];
export const MAX_SCENE_EVENTS = 256;
const EVENT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FLAG = /^[a-z0-9]+(?:-[a-z0-9]+)*\.(seal|chest)$/;

export function sceneEventKey(mapId, id) {
  return `${mapId}/${id}`;
}

export function sceneHasRun(save, mapId, id) {
  return (save.events ?? []).includes(sceneEventKey(mapId, id));
}

export function markSceneRun(save, mapId, id) {
  const key = sceneEventKey(mapId, id);
  if (sceneHasRun(save, mapId, id)) return true;
  if ((save.events ?? []).length >= MAX_SCENE_EVENTS) return false;
  save.events.push(key);
  return true;
}

export function validateSceneEvent(event, {speciesIds, speakerIds = new Set(), mapId, mapIds, where}) {
  const errors = [];
  const at = (field, message) => errors.push(`${where}.${field}: ${message}`);
  if (!event || typeof event !== 'object' || Array.isArray(event)) return [`${where}: expected an event object`];
  if (typeof event.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(event.id)) at('id', 'stable lowercase-kebab-case id required');
  if (event.when !== undefined) {
    const conditionErrors = validateLines([{when: event.when, text: 'x'}], `${where}.when`, {mapIds}).filter(error => !error.includes('.text:'));
    errors.push(...conditionErrors);
  }
  if (typeof event.repeatable !== 'boolean') at('repeatable', 'choose true or false explicitly');
  if (!Array.isArray(event.actions) || !event.actions.length) at('actions', 'needs at least one action');
  else {
    let challengeSeen = false;
    event.actions.forEach((action, i) => {
      const field = `actions[${i}]`;
      if (challengeSeen) at(field, 'a challenge must be the last action');
      if (!action || typeof action !== 'object' || Array.isArray(action)) return at(field, 'expected an action object');
      if (action.type === 'dialogue') {
        if (typeof action.text !== 'string' || !action.text.trim() || action.text.length > 500) at(field, 'dialogue needs 1–500 characters of text');
        if (action.speaker !== undefined && action.speaker !== 'narrator' && action.speaker !== 'player' && !speakerIds.has(action.speaker))
          at(`${field}.speaker`, `unknown speaker "${action.speaker}" (use narrator, player, or a landmark id)`);
      } else if (action.type === 'reward') {
        const keys = Object.keys(action).filter(key => key !== 'type');
        if (!keys.length || keys.some(key => !['coins', 'potions', 'orbs'].includes(key))) at(field, 'reward accepts coins, potions and orbs');
        for (const key of keys)
          if (!Number.isInteger(action[key]) || action[key] < 0 || action[key] > 999) at(field, `${key} must be an integer from 0 to 999`);
      } else if (action.type === 'flag') {
        if (typeof action.flag !== 'string' || !FLAG.test(action.flag) || !mapIds.has(action.flag.split('.')[0]))
          at(field, 'flag must name an existing <map-id>.seal or <map-id>.chest');
      } else if (action.type === 'challenge') {
        challengeSeen = true;
        if (!speciesIds.has(action.species)) at(`${field}.species`, `unknown species "${action.species}"`);
        if (!Number.isInteger(action.level) || action.level < 1 || action.level > 99) at(`${field}.level`, 'integer 1..99');
        if (event.repeatable !== true) at(field, 'challenges must be explicitly repeatable so a loss cannot consume the interaction');
      } else at(field, `type must be one of ${SCENE_ACTIONS.join(', ')}`);
    });
  }
  if (mapId && typeof event.id === 'string' && !EVENT_ID.test(sceneEventKey(mapId, event.id))) at('id', 'cannot form a stable map/event key');
  return errors;
}

/** Applies non-challenge actions in order. The caller persists the complete result as one save transaction. */
export function applySceneActions(save, event, context) {
  const result = {dialogue: [], challenge: null, reward: null};
  for (const action of event.actions) {
    if (action.type === 'dialogue') result.dialogue.push({text: action.text, speaker: action.speaker ?? 'narrator'});
    else if (action.type === 'reward') {
      for (const key of ['coins', 'potions', 'orbs']) if (Number.isInteger(action[key])) save[key] += action[key];
      result.reward = action;
    } else if (action.type === 'flag') context.setFlag(action.flag);
    else if (action.type === 'challenge') result.challenge = {id: action.species, level: action.level};
  }
  return result;
}

export const sceneConditionHolds = (event, save, context) => !event.when || holds(event.when, save, context);
