/* The light story layer as data (dist/maps/story.json): an opening premise, one-time tips and an ending.
   Deliberately small: text screens and a completion flag, no branches. */
import {holds, validateLines} from './objectives.js';

export const STORY_FORMAT = 1;
export const HINT_EVENTS = ['first-battle', 'low-health', 'can-switch', 'first-ranger'];
export const MAX_HINTS = 30;

const screenErrors = (name, s) => {
  const errors = [];
  if (typeof s?.title !== 'string' || !s.title) errors.push(`story: ${name}.title: required text`);
  if (!Array.isArray(s?.paragraphs) || !s.paragraphs.length || !s.paragraphs.every(p => typeof p === 'string' && p))
    errors.push(`story: ${name}.paragraphs: needs at least one paragraph of text`);
  if (typeof s?.button !== 'string' || !s.button) errors.push(`story: ${name}.button: required text`);
  return errors;
};

export function validateStory(story, {mapIds}) {
  if (!story || story.format !== STORY_FORMAT) return [`story: needs { format: ${STORY_FORMAT} }`];
  const errors = [];
  if (story.premise !== undefined) errors.push(...screenErrors('premise', story.premise));
  if (story.ending !== undefined) {
    errors.push(...screenErrors('ending', story.ending));
    // The ending condition uses the same vocabulary as NPC lines.
    errors.push(...validateLines([{when: story.ending.when, text: 'x'}], 'story: ending', {mapIds}).filter(e => !e.includes('.text')));
    if (story.ending.when === undefined) errors.push('story: ending.when: needs a condition (otherwise the ending would play immediately)');
  }
  const ids = new Set();
  (story.hints ?? []).forEach((h, i) => {
    if (typeof h?.id !== 'string' || !/^[a-z0-9-]{1,30}$/.test(h.id) || ids.has(h.id)) errors.push(`story: hints[${i}].id: needs a unique lowercase id`);
    ids.add(h?.id);
    if (!HINT_EVENTS.includes(h?.event)) errors.push(`story: hints[${i}].event: must be one of ${HINT_EVENTS.join(', ')}`);
    if (typeof h?.text !== 'string' || !h.text) errors.push(`story: hints[${i}].text: required text`);
  });
  return errors;
}

/** The tip for `event` that the player has not seen yet, or null. */
export function pendingHint(story, event, save) {
  return (story?.hints ?? []).find(h => h.event === event && !save.hints.includes(h.id)) ?? null;
}

/** Records that a tip/premise was shown (bounded, no duplicates). */
export function markSeen(save, id) {
  if (!save.hints.includes(id) && save.hints.length < MAX_HINTS) save.hints.push(id);
}

/** The ending to show now: its condition holds and the adventure is not yet marked complete. */
export function endingDue(story, save, ctx) {
  return story?.ending && !save.completed && holds(story.ending.when, save, ctx) ? story.ending : null;
}
