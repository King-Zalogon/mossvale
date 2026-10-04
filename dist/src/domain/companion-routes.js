/* Optional locomotion/habitat route checks. Callers choose when a route is offered; no global physics changes. */
const has = (values, value) => Array.isArray(values) && values.includes(value);

export function companionCanUseRoute(route, companion) {
  const requires = route?.requires;
  if (!requires) return true;
  const ability = has(companion?.abilities, requires.ability);
  const habitat = !requires.habitat || has(companion?.habitats, requires.habitat);
  return ability && habitat;
}

export function availableCompanionRoutes(routes, companion) {
  return (routes ?? []).filter(route => companionCanUseRoute(route, companion));
}

/** Reject a data set if any starter loses its guaranteed recovery route. */
export function validateCompanionRoutes(routes, starterCompanions) {
  const errors = [];
  if (!Array.isArray(routes) || !Array.isArray(starterCompanions) || !starterCompanions.length) return ['routes and starterCompanions must be lists'];
  const ids = new Set();
  for (const [i, route] of routes.entries()) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(route?.id ?? '') || ids.has(route.id)) errors.push(`routes[${i}].id must be unique lowercase kebab-case`);
    ids.add(route?.id);
    if (route?.requires !== undefined && (!route.requires || typeof route.requires !== 'object' || Array.isArray(route.requires)))
      errors.push(`routes[${i}].requires must be an object`);
    else if (route?.requires?.ability !== undefined && (typeof route.requires.ability !== 'string' || !route.requires.ability))
      errors.push(`routes[${i}].requires.ability must be a non-empty string`);
    else if (route?.requires?.habitat !== undefined && (typeof route.requires.habitat !== 'string' || !route.requires.habitat))
      errors.push(`routes[${i}].requires.habitat must be a non-empty string`);
  }
  for (const [j, companion] of starterCompanions.entries()) {
    if (!routes.some(route => route?.recovery === true && companionCanUseRoute(route, companion)))
      errors.push(`starterCompanions[${j}] (${companion?.id ?? 'unknown'}) has no accessible recovery route`);
  }
  return errors;
}
