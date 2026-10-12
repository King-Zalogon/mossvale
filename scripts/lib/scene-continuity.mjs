/* Structural narrative history, not literary inference or gameplay execution. */
import {isDeepStrictEqual} from 'node:util';

const fields = {
  obligation: 'obligations',
  decision: 'decisionRecords',
  relationship: 'relationships',
  role: 'actorRoles',
  fact: 'canonicalFacts',
  unknown: 'intentionalUnknowns',
};
const array = value => (Array.isArray(value) ? value : []);
const keyed = values => new Map(array(values).map(value => [value.id, value]));
const closed = value => ['resolved', 'superseded'].includes(value?.status);
const same = (a, b) => isDeepStrictEqual(a, b);

export function validateNarrativeContinuity(script, catalogue, {required = false} = {}) {
  const errors = [];
  const warnings = [];
  const input = script.continuityIn ?? {};
  const output = script.continuityOut ?? {};
  const changes = array(script.continuityChanges);
  const beats = keyed(script.beats);
  const resources = new Map(array(catalogue?.entries).map(entry => [entry.id, entry]));
  const identities = new Set([...array(input.characters), ...array(output.characters)].map(actor => actor.id));
  for (const participant of array(script.participants)) identities.add(participant.binding?.identityId ?? participant.id);
  const checkOwner = (binding, path) => {
    if (binding.owner === 'player' && binding.identityId !== 'player') errors.push(`${path}: player binding must identify player`);
    if (binding.owner === 'companion' && !binding.identityId?.startsWith('companion-')) errors.push(`${path}: companion identity must use companion-*`);
    if (binding.owner !== 'player' && binding.identityId === 'player') errors.push(`${path}: cannot assign player identity to another owner`);
    if (binding.ownerIdentityId && (binding.owner !== 'npc' || !identities.has(binding.ownerIdentityId) || binding.ownerIdentityId === binding.identityId))
      errors.push(`${path}: impossible ownerIdentityId`);
  };
  const checkAppearance = (id, binding, path) => {
    const entry = resources.get(id);
    if (!entry || !['available', 'experimental'].includes(entry.status)) {
      errors.push(`${path}: unsupported resource ${id}`);
      return;
    }
    const definition = entry.configuration?.find(value => value.name === 'definition')?.default;
    if (
      (binding.owner === 'companion' || binding.ownerIdentityId) &&
      !(id.startsWith('species:') || (id.startsWith('visual:') && definition?.kind === 'creature'))
    )
      errors.push(`${path}: a player companion requires a creature/species appearance`);
    if (binding.owner === 'player' && !(id.startsWith('visual:') && definition?.kind === 'person'))
      errors.push(`${path}: a player requires a person appearance`);
  };
  for (const participant of array(script.participants)) {
    const binding = participant.binding;
    if (!binding) continue;
    checkOwner(binding, `participant ${participant.id}`);
    checkAppearance(participant.resourceId, binding, `participant ${participant.id}`);
    if (binding.fallbackResourceId) checkAppearance(binding.fallbackResourceId, binding, `fallback ${participant.id}`);
    const traitIds = new Set();
    for (const trait of array(participant.traits)) {
      if (traitIds.has(trait.id)) errors.push(`participant ${participant.id}: contradictory duplicate trait ${trait.id}`);
      traitIds.add(trait.id);
    }
  }
  for (const [kind, field] of Object.entries(fields)) {
    const incoming = keyed(input[field]);
    const outgoing = keyed(output[field]);
    for (const side of [input, output]) {
      const seen = new Set();
      for (const record of array(side[field])) {
        if (seen.has(record.id)) errors.push(`${field}: duplicate ${record.id}`);
        seen.add(record.id);
        if (kind === 'role') {
          checkOwner(record, `role ${record.id}`);
          checkAppearance(record.resourceId, record, `role ${record.id}`);
        }
      }
    }
    for (const [id, before] of incoming) {
      const after = outgoing.get(id);
      if (!after) {
        if (kind === 'unknown' && changes.some(c => c.kind === kind && c.id === id && c.action === 'resolve')) continue;
        if (kind === 'unknown' && !required) {
          warnings.push(`legacy intentional unknown ${id} was dropped without a resolution record`);
          continue;
        }
        errors.push(`${field}: incoming ${id} must be retained or explicitly resolved`);
        continue;
      }
      if (before.sourceSceneId && before.sourceSceneId !== after.sourceSceneId) errors.push(`${field}/${id}: source scene must remain ${before.sourceSceneId}`);
      if (closed(before) && !closed(after)) errors.push(`${field}/${id}: cannot reopen resolved history`);
      if (kind === 'decision' && before.choice !== after.choice)
        errors.push(`${field}/${id}: cannot overwrite an established choice; supersede it and introduce a new ID`);
      if (kind === 'relationship' && (before.from !== after.from || before.to !== after.to))
        errors.push(`${field}/${id}: relationship endpoints cannot be substituted`);
    }
    for (const [id, after] of outgoing) {
      if (kind === 'decision' && !incoming.has(id) && after.sourceSceneId !== script.id)
        errors.push(`${field}/${id}: new decision must originate in ${script.id}`);
      if (kind === 'decision' && closed(after) && !after.resolution?.trim()) errors.push(`${field}/${id}: resolution is required`);
      const before = incoming.get(id);
      const change = changes.find(c => c.kind === kind && c.id === id);
      if (!same(before, after) && (required || kind === 'role' || kind === 'decision') && !change)
        errors.push(`${field}/${id}: changed state needs a beat-linked continuityChanges record`);
      if (
        kind === 'role' &&
        before &&
        !same(before, after) &&
        change &&
        (change.action !== 'rebind' || !change.dialogueBeatIds?.length || !change.staging?.trim())
      )
        errors.push(`${field}/${id}: rebinding must update dialogueBeatIds and staging as well as continuity`);
    }
  }
  const roles = keyed(output.actorRoles);
  for (const side of [input, output]) {
    const owners = new Map(
      array(side.actorRoles)
        .filter(role => role.ownerIdentityId)
        .map(role => [role.identityId, role.ownerIdentityId]),
    );
    for (const identity of owners.keys()) {
      const seen = new Set();
      let cursor = identity;
      while (owners.has(cursor)) {
        if (seen.has(cursor)) {
          errors.push(`actorRoles: cyclic ownership at ${identity}`);
          break;
        }
        seen.add(cursor);
        cursor = owners.get(cursor);
      }
    }
  }
  const roleIds = new Set();
  for (const participant of array(script.participants)) {
    const binding = participant.binding;
    if (!binding?.roleId) continue;
    if (roleIds.has(binding.roleId)) errors.push(`role ${binding.roleId}: assigned to multiple participants`);
    roleIds.add(binding.roleId);
    const role = roles.get(binding.roleId);
    if (
      !role ||
      role.identityId !== binding.identityId ||
      role.owner !== binding.owner ||
      role.ownerIdentityId !== binding.ownerIdentityId ||
      role.resourceId !== participant.resourceId
    )
      errors.push(`participant ${participant.id}: binding contradicts outgoing role ${binding.roleId}`);
    const declared = keyed(participant.traits);
    const durable = keyed(role?.traits);
    for (const trait of [...array(participant.traits), ...array(role?.traits)].filter(trait => trait.required))
      if (!declared.get(trait.id)?.required || !durable.get(trait.id)?.required || declared.get(trait.id)?.value !== durable.get(trait.id)?.value)
        errors.push(`participant ${participant.id}: required trait ${trait.id} must agree with its durable role`);
  }
  const seenChanges = new Set();
  for (const change of changes) {
    const key = change.kind + ':' + change.id;
    if (seenChanges.has(key)) errors.push(`continuityChanges: duplicate ${key}`);
    seenChanges.add(key);
    const field = fields[change.kind];
    const before = keyed(input[field]).get(change.id);
    const after = keyed(output[field]).get(change.id);
    if (!before && !after) errors.push(`continuityChanges: unknown state ${key}`);
    if (same(before, after)) errors.push(`continuityChanges: ${key} claims a consequence without a state change`);
    if (change.action === 'introduce' && before) errors.push(`continuityChanges: ${key} cannot be reintroduced`);
    if (change.action === 'rebind' && change.kind !== 'role') errors.push(`continuityChanges: rebinding is only valid for a role`);
    if (change.kind === 'obligation' && ['advance', 'complicate'].includes(change.action) && (!before || !after || closed(after)))
      errors.push(`continuityChanges: ${key} advancement contradicts outgoing obligation status`);
    if (['resolve', 'supersede'].includes(change.action) && after && !closed(after) && change.kind !== 'unknown')
      errors.push(`continuityChanges: ${key} resolution contradicts outgoing status`);
    for (const id of array(change.beatIds)) if (!beats.has(id)) errors.push(`continuityChanges: missing consequence beat ${id}`);
    for (const id of array(change.dialogueBeatIds)) if (beats.get(id)?.type !== 'dialogue') errors.push(`continuityChanges: ${id} is not a dialogue beat`);
  }
  if (required) {
    const outputCharacters = new Set(array(output.characters).map(character => character.id));
    for (const character of array(input.characters))
      if (!outputCharacters.has(character.id))
        errors.push(`character ${character.id}: preserve identity and record departure in location rather than erase history`);
    for (const side of ['continuityIn', 'continuityOut'])
      for (const field of ['obligations', 'relationships', 'intentionalUnknowns', 'actorRoles', 'decisionRecords'])
        if (!Array.isArray(script[side]?.[field])) errors.push(`${side}.${field} must be explicit for durable handoffs`);
    if (!output.dramaticDirection?.trim()) errors.push('continuityOut.dramaticDirection must state the next dramatic direction');
    if (!changes.some(change => change.kind === 'obligation'))
      errors.push('each durable scene must introduce, advance, complicate or resolve an obligation with a consequence');
  } else if (!Array.isArray(output.actorRoles) || !Array.isArray(output.decisionRecords))
    warnings.push('legacy handoff: actor roles and stable player decisions are not explicit; strict continuity requires migration');
  return {errors, warnings};
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, canonical(value[key])]),
    );
  return value;
}

export function validateSceneLink(previous, next) {
  const errors = [];
  if (next.previousScene?.id !== previous.id) errors.push(`previousScene must reference ${previous.id}`);
  if (previous.catalogueSourceRevision !== next.catalogueSourceRevision) errors.push('linked scenes must use the same catalogue revision');
  if (!same(canonical(previous.continuityOut), canonical(next.continuityIn)))
    errors.push('continuityIn must preserve the previous complete continuityOut, including resolved history; recap is not canonical state');
  return errors;
}
