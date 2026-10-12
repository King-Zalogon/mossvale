/* Authoring readiness is separate from format validity and owner taste. No runtime changes. */
export function assessSceneBrief(script) {
  const errors = [];
  const brief = script?.sceneBrief;
  if (!brief) return {status: 'incomplete', errors: ['sceneBrief is missing; legacy format remains valid, quality acceptance does not.']};
  for (const field of ['playerPurpose', 'tone', 'setup', 'action', 'payoff', 'continuityState'])
    if (typeof brief[field] !== 'string' || !brief[field].trim()) errors.push(`sceneBrief.${field} needs a meaningful statement`);
  const beats = new Set((script.beats ?? []).map(beat => beat.id));
  if (!brief.consequence?.description?.trim() || !brief.consequence?.beatIds?.length)
    errors.push('sceneBrief.consequence needs a description and supporting beatIds');
  for (const id of brief.consequence?.beatIds ?? []) if (!beats.has(id)) errors.push(`sceneBrief.consequence references missing beat ${id}`);
  const selected = new Set([
    ...(script.uses ?? []).map(use => use.resourceId),
    ...(script.participants ?? []).map(actor => actor.resourceId),
    script.setting?.biomeId,
    script.setting?.mapId,
  ]);
  if (!brief.requiredResources?.length) errors.push('sceneBrief.requiredResources must name selected assets/capabilities');
  for (const id of brief.requiredResources ?? [])
    if (!selected.has(id)) errors.push(`sceneBrief.requiredResources selects ${id} outside the scene uses/participants/setting`);
  for (const gap of script.requirements ?? []) if (gap.priority === 'required') errors.push(`required gap ${gap.id} prevents playable readiness`);
  return {status: errors.length ? 'incomplete' : 'specified', errors};
}

/** Layout checks concern important actors and UI, not intentional scenery overlap. */
export function checkSceneLayout(frame) {
  const errors = [];
  const overlap = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
  const inside = (a, b) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
  for (const [name, rect] of Object.entries(frame.required ?? {})) {
    if (!rect || ![rect.left, rect.right, rect.top, rect.bottom].every(Number.isFinite) || rect.right <= rect.left || rect.bottom <= rect.top) {
      errors.push(`${name}: missing or invalid rendered bounds`);
      continue;
    }
    if (!inside(rect, frame.viewport)) errors.push(`${name}: clipped outside the visible viewport`);
    if (['speaker', 'player', 'companion', 'landmark'].includes(name) && frame.actorViewport && !inside(rect, frame.actorViewport))
      errors.push(`${name}: clipped outside the game canvas`);
    if (frame.panel && !['advance', 'text'].includes(name) && overlap(rect, frame.panel)) errors.push(`${name}: obscured by dialogue panel`);
  }
  if (frame.panel && !inside(frame.panel, frame.viewport)) errors.push('dialogue panel is clipped');
  if (frame.required?.advance && frame.panel && !inside(frame.required.advance, frame.panel)) errors.push('advance control is outside the dialogue panel');
  if (frame.required?.text && frame.panel && !inside(frame.required.text, frame.panel)) errors.push('dialogue text is clipped outside the panel');
  if (frame.required?.advance && (frame.textFragments ?? []).some(fragment => overlap(fragment, frame.required.advance)))
    errors.push('advance control obscures dialogue text');
  return errors;
}

export function sceneProofReport(script, validation, evidence, review) {
  const brief = assessSceneBrief(script);
  const verified = evidence?.verified === true;
  const passed = status => status === 'pass';
  const categories = {
    schemaData: {status: validation.errors.length ? 'fail' : 'pass', findings: validation.errors},
    playableBehavior: {
      status: verified && evidence.realControls === true && evidence.reloadOnceReward === true ? 'pass' : 'incomplete',
      findings: evidence?.findings ?? [],
    },
    visualComposition: {
      status: verified && evidence.layoutPassed === true && passed(review?.visual?.status) && review.visual.rationale?.trim() ? 'pass' : 'incomplete',
      review: review?.visual ?? null,
    },
    narrativePurpose: {
      status: verified && brief.status === 'specified' && passed(review?.narrative?.status) && review.narrative.rationale?.trim() ? 'pass' : 'incomplete',
      findings: brief.errors,
      review: review?.narrative ?? null,
    },
  };
  const ownerTaste = review?.ownerTaste ?? {status: 'deferred', reason: 'Owner has not assessed the scene.'};
  const readyForOwnerPlaytest = Object.values(categories).every(category => category.status === 'pass');
  return {
    format: 1,
    sceneId: script.id,
    categories,
    screenshots: evidence?.screenshots ?? [],
    readyForOwnerPlaytest,
    ownerTaste,
    sceneApproved: readyForOwnerPlaytest && ownerTaste.status === 'approved',
    note: 'Rendered geometry and authored intent do not establish enjoyable writing or art. Visual/content review and owner taste remain explicit, independent decisions.',
  };
}
