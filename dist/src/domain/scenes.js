/* A deliberately small, data-only vocabulary for reusable map interactions. */
import {holds, validateLines} from './objectives.js';
import {OBJECTIVE_MAX_TURNS, OBJECTIVE_REWARD_CAP} from '../config.js';

export const SCENE_ACTIONS = ['dialogue', 'reward', 'flag', 'challenge', 'move', 'face', 'wait', 'react'];
export const MAX_SCENE_EVENTS = 256;
export const MAX_SCENE_ACTIONS = 24;
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

export function validateSceneEvent(event, {speciesIds, speakerIds = new Set(), actorIds = new Set(), walkable, mapSize, mapId, mapIds, where}) {
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
  else if (event.actions.length > MAX_SCENE_ACTIONS) at('actions', `is limited to ${MAX_SCENE_ACTIONS} actions`);
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
        if (action.objective) {
          const objective = action.objective;
          if (objective.kind !== 'survive') at(`${field}.objective.kind`, 'must be survive');
          if (typeof objective.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(objective.id)) at(`${field}.objective.id`, 'must be lowercase kebab-case');
          if (!Number.isInteger(objective.turns) || objective.turns < 1 || objective.turns > OBJECTIVE_MAX_TURNS)
            at(`${field}.objective.turns`, `must be an integer from 1 to ${OBJECTIVE_MAX_TURNS}`);
          for (const key of ['title', 'description'])
            if (typeof objective[key] !== 'string' || !objective[key].trim()) at(`${field}.objective.${key}`, 'is required');
          for (const key of ['coins', 'potions', 'xp'])
            if (!Number.isInteger(objective.reward?.[key] ?? 0) || objective.reward[key] < 0 || objective.reward[key] > OBJECTIVE_REWARD_CAP)
              at(`${field}.objective.reward.${key}`, `must be an integer from 0 to ${OBJECTIVE_REWARD_CAP}`);
        }
      } else if (action.type === 'move') {
        if (action.actor !== 'player' && !actorIds.has(action.actor)) at(`${field}.actor`, 'must be player or a movable actor landmark id');
        if (!Array.isArray(action.to) || action.to.length !== 2 || !action.to.every(Number.isInteger)) at(`${field}.to`, 'must be an integer [x, y] map tile');
        else if (mapSize && (action.to[0] < 0 || action.to[1] < 0 || action.to[0] >= mapSize.w || action.to[1] >= mapSize.h))
          at(`${field}.to`, 'must be inside the map');
        else if (walkable && !walkable(action.to[0], action.to[1])) at(`${field}.to`, 'must be walkable');
      } else if (action.type === 'face') {
        if (action.actor !== 'player' && !actorIds.has(action.actor)) at(`${field}.actor`, 'must be player or a movable actor landmark id');
        if (action.target !== 'player' && !actorIds.has(action.target)) at(`${field}.target`, 'must be player or a movable actor landmark id');
        if (action.actor === action.target) at(field, 'actor cannot face itself');
      } else if (action.type === 'wait') {
        if (!Number.isInteger(action.ms) || action.ms < 0 || action.ms > 5000) at(`${field}.ms`, 'must be an integer from 0 to 5000');
      } else if (action.type === 'react') {
        if (action.actor !== 'player' && !actorIds.has(action.actor)) at(`${field}.actor`, 'must be player or a movable actor landmark id');
        if (!['notice', 'surprise', 'happy'].includes(action.pose)) at(`${field}.pose`, 'must be notice, surprise, or happy');
      } else at(field, `type must be one of ${SCENE_ACTIONS.join(', ')}`);
    });
  }
  if (mapId && typeof event.id === 'string' && !EVENT_ID.test(sceneEventKey(mapId, event.id))) at('id', 'cannot form a stable map/event key');
  return errors;
}

/** Applies non-challenge actions in order. The caller persists the complete result as one save transaction. */
export function applySceneActions(save, event, context) {
  const result = {dialogue: [], choreography: [], challenge: null, reward: null};
  for (const action of event.actions) {
    if (['move', 'face', 'wait', 'react'].includes(action.type)) result.choreography.push(structuredClone(action));
    else if (action.type === 'dialogue') result.dialogue.push({text: action.text, speaker: action.speaker ?? 'narrator'});
    else if (action.type === 'reward') {
      result.reward = action;
    } else if (action.type === 'flag') context.setFlag(action.flag);
    else if (action.type === 'challenge')
      result.challenge = {id: action.species, level: action.level, objective: action.objective ? structuredClone(action.objective) : undefined};
  }
  return result;
}

export const sceneConditionHolds = (event, save, context) => !event.when || holds(event.when, save, context);
