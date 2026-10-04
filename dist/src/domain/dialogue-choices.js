/* Optional conditional dialogue choices. Stable IDs and objective conditions keep pack data portable. */
import {holds, validateLines} from './objectives.js';

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateDialogueChoices(choices, {speakerIds = new Set(), targetIds = new Set(), mapIds = new Set()} = {}) {
  const errors = [];
  if (!Array.isArray(choices)) return ['choices must be a list'];
  const ids = new Set();
  for (const [index, choice] of choices.entries()) {
    const where = `choices[${index}]`;
    if (!ID.test(choice?.id ?? '') || ids.has(choice.id)) errors.push(`${where}.id: must be unique lowercase kebab-case`);
    ids.add(choice?.id);
    if (!speakerIds.has(choice?.speaker)) errors.push(`${where}.speaker: unknown stable speaker "${choice?.speaker ?? ''}"`);
    if (!targetIds.has(choice?.target)) errors.push(`${where}.target: unknown stable target "${choice?.target ?? ''}"`);
    if (typeof choice?.text !== 'string' || !choice.text.trim()) errors.push(`${where}.text: required choice text`);
    if (typeof choice?.reply !== 'string' || !choice.reply.trim()) errors.push(`${where}.reply: required response text`);
    if (choice?.when !== undefined) errors.push(...validateLines([{text: choice.text ?? '', when: choice.when}], where, {mapIds}));
    if (choice?.event !== undefined && (!choice.event || typeof choice.event.type !== 'string')) errors.push(`${where}.event.type: required event type`);
  }
  return errors;
}

export function availableDialogueChoices(choices, save, ctx) {
  return (choices ?? []).filter(choice => holds(choice.when, save, ctx));
}

export function selectDialogueChoice(choices, id, save, ctx) {
  return availableDialogueChoices(choices, save, ctx).find(choice => choice.id === id) ?? null;
}
