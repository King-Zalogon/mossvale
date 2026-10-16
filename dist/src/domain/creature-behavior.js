/* Pack-configured field behavior. The profile is deliberately small and bounded so
 * authored creatures can feel different without introducing a second actor engine. */

export const FIELD_BEHAVIORS = Object.freeze({
  wary: Object.freeze({
    state: 'watch',
    trigger: 'noticed your movement',
    cue: 'It watches from the edge of the grass, ready to retreat.',
    duration: 2.5,
    radius: 3,
    recovery: 'retreat-and-retry',
  }),
  territorial: Object.freeze({
    state: 'defend',
    trigger: 'entered its patch',
    cue: 'It stamps the ground and holds its ground for a heavy charge.',
    duration: 3,
    radius: 2,
    recovery: 'return-to-patch',
  }),
  curious: Object.freeze({
    state: 'approach',
    trigger: 'caught your scent',
    cue: 'It steps closer to investigate, leaving an opening to approach.',
    duration: 1.5,
    radius: 4,
    recovery: 'circle-and-retry',
  }),
});

const clamp = (value, min, max, fallback) => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback);

/** Returns a safe runtime profile for a map pool entry. */
export function fieldBehavior(behavior = 'curious', authored = undefined) {
  const key = Object.hasOwn(FIELD_BEHAVIORS, behavior) ? behavior : 'curious';
  const base = FIELD_BEHAVIORS[key];
  return {
    behavior: key,
    state: base.state,
    trigger: base.trigger,
    cue: base.cue,
    duration: clamp(authored?.duration, 0.5, 5, base.duration),
    radius: clamp(authored?.radius, 1, 6, base.radius),
    recovery: ['retreat-and-retry', 'return-to-patch', 'circle-and-retry'].includes(authored?.recovery) ? authored.recovery : base.recovery,
  };
}

/** A deterministic bounded transition used by field observations and reloads. */
export function fieldObservation(profile, elapsed = 0) {
  const field = fieldBehavior(profile?.behavior, profile);
  const t = clamp(elapsed, 0, field.duration, 0);
  return {
    ...field,
    elapsed: t,
    active: t < field.duration,
    nextState: t < field.duration ? field.state : 'recovering',
    recovery: field.recovery,
  };
}
