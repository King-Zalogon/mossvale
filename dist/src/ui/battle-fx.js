/* Battle presentation helpers. Pure: they read resolved turn events and never change game state. */

const percent = (hp, max) => (max > 0 ? Math.max(0, Math.min(100, Math.round((hp / max) * 100))) : 0);

/** Width (0-100) of an HP bar; a creature with any HP left always shows at least a sliver. */
export function hpPercent(hp, max) {
  return hp > 0 && max > 0 ? Math.max(3, percent(hp, max)) : 0;
}

/** Floating numbers, camera shake (0-2) and an element burst for one resolved event. `side` is where each number appears. */
export function fxForEvent(e) {
  const fx = {pops: [], shake: 0, burst: null};
  if (e.type === 'strike' && e.damage > 0) {
    const tone = e.eff > 1 ? 'super' : e.eff < 1 ? 'weak' : 'hit';
    fx.pops.push({side: 'enemy', text: `-${e.damage}`, tone});
    fx.shake = e.kind === 'element' || e.eff > 1 ? 2 : 1;
    if (e.kind === 'element') fx.burst = 'enemy';
  } else if (e.type === 'enemy' && e.damage > 0) {
    fx.pops.push({side: 'ally', text: `-${e.damage}`, tone: e.action === 'heavy' ? 'heavy' : 'hit'});
    fx.shake = e.action === 'heavy' ? 2 : 1;
    if (e.counter > 0) fx.pops.push({side: 'enemy', text: `-${e.counter}`, tone: 'hit'});
  } else if ((e.type === 'potion' || e.type === 'item') && e.healed > 0) fx.pops.push({side: 'ally', text: `+${e.healed}`, tone: 'heal'});
  else if (e.type === 'enemy' && e.action === 'charge' && e.recovered > 0) fx.pops.push({side: 'enemy', text: `+${e.recovered}`, tone: 'heal'});
  return fx;
}

const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

/** Markup for the floating numbers that belong to one side. */
export function popMarkup(fx, side) {
  return (fx?.pops ?? [])
    .filter(p => p.side === side)
    .map(p => `<span class="dmg-pop tone-${p.tone}" aria-hidden="true">${p.text}</span>`)
    .join('');
}

/** Small radial spark burst in the attacker's colour. Omitted for calm motion by the caller. */
export function burstMarkup(color) {
  return `<span class="burst" aria-hidden="true">${ANGLES.map(a => `<i style="--a:${a}deg;background:${color}"></i>`).join('')}</span>`;
}
