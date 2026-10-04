#!/usr/bin/env node
/* Print human-reviewable visual briefs from the opt-in creature composition showcase. */
import showcase from '../art/characters/composition-prototypes.json' with {type: 'json'};
import {compileComposition, createCompositionArtBrief} from '../dist/src/domain/composition.js';

const lines = ['# Creature composition art briefs', '', 'Authoring references only. These records do not add species to the game or assemble sprites.', ''];
for (const composition of showcase.compositions) {
  const plan = showcase.bodyPlans[composition.bodyPlan];
  if (!plan) throw new Error(`${composition.id}: unknown body plan "${composition.bodyPlan}"`);
  const compiled = compileComposition(plan, showcase.parts, composition.assignments);
  if (compiled.errors.length) throw new Error(`${composition.id}: ${compiled.errors.join('; ')}`);
  const generated = createCompositionArtBrief(plan, showcase.parts, composition.assignments, {
    id: composition.species.id,
    name: composition.species.name,
    visualIdentity: composition.identityBrief,
  });
  if (generated.errors.length) throw new Error(`${composition.id}: ${generated.errors.join('; ')}`);
  const brief = generated.brief;
  lines.push(
    `## ${brief.name} (${brief.speciesId})`,
    '',
    `**Body plan:** ${plan.id}${plan.novel ? ' · novel data-only plan' : ''}`,
    '',
    `**Silhouette:** ${brief.silhouette}`,
    '',
    `**Identity:** ${brief.identity}`,
    '',
    '**Anatomy references:**',
  );
  for (const part of brief.anatomy) lines.push(`- **${part.slot}: ${part.part}** — ${part.appearance}`);
  lines.push(
    '',
    `**Derived abilities:** ${brief.derivedAbilities.length ? brief.derivedAbilities.join(', ') : 'none'}`,
    '',
    `**Art direction:** ${brief.artDirection}`,
    '',
  );
}
console.log(lines.join('\n'));
