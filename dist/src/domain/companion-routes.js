/* Optional locomotion/habitat route checks. Callers choose when a route is offered; no global physics changes. */
const has = (values, value) => Array.isArray(values) && values.includes(value);

export function companionCanUseRoute(route, companion) {
  const requires = route?.requires;
  if (!requires) return true;
  const ability = has(companion?.abilities, requires.ability);
  const habitat = !requires.habitat || has(companion?.habitats, requires.habitat);
  return ability && habitat;
}

/** Reject a data set if any starter loses its guaranteed recovery route. */
export function validateCompanionRoutes(routes, starterCompanions) {
  const errors = [];
  if (!Array.isArray(routes) || !Array.isArray(starterCompanions) || !starterCompanions.length) return ['routes and starterCompanions must be lists'];
  for (const [i, route] of routes.entries()) {
    if (route?.recovery !== true) continue;
    for (const [j, companion] of starterCompanions.entries()) {
      if (!companionCanUseRoute(route, companion))
        errors.push(`routes[${i}] recovery path is unavailable to starterCompanions[${j}] (${companion?.id ?? 'unknown'})`);
    }
  }
  return errors;
}
