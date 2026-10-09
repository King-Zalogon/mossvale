/* Presentation-only selection from the current adventure's configured shrine. No saved art IDs. */
export function guardianCombatSprite(map, battle) {
  if (!battle?.boss) return undefined;
  const guardians = (map?.objects ?? []).filter(object => object.kind === 'shrine' &&
    object.guardian?.id === battle.id && object.guardian.tactic === battle.tactic);
  // Ambiguous authored encounters retain normal art rather than borrowing another shrine's form.
  return guardians.length === 1 ? guardians[0].guardian.combatSprite : undefined;
}
