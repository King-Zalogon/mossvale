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
    .map((p, i) => `<span class="dmg-pop tone-${p.tone}" style="--i:${i}" aria-hidden="true">${p.text}</span>`)
    .join('');
}

/** Small radial spark burst in the attacker's colour. Omitted for calm motion by the caller. */
export function burstMarkup(color) {
  return `<span class="burst" aria-hidden="true">${ANGLES.map(a => `<i style="--a:${a}deg;background:${color}"></i>`).join('')}</span>`;
}

/** Floating reward numbers shown over your friend when a fight is won or a capture succeeds (coins and XP the rules already granted). */
export function rewardPops(e) {
  const pops = [];
  const xp = e.xp ?? 0;
  const coins = e.type === 'win' ? (e.reward ?? 0) : (e.coins ?? 0);
  if (xp > 0) pops.push({side: 'ally', text: `+${xp} XP`, tone: 'xp'});
  if (coins > 0) pops.push({side: 'ally', text: `+${coins}`, tone: 'coin'});
  return pops;
}

/**
 * The beats of one orb throw, derived from the already-resolved result. A failed throw wobbles once more the closer
 * it was (so a near miss reads as "almost"), a success always wobbles three times. Calm motion collapses to one wobble.
 */
export function captureBeats({chance, caught, calm = false}) {
  const wobbles = calm ? 1 : caught ? 3 : Math.max(1, Math.min(3, 1 + Math.floor(Math.max(0, Math.min(1, Number.isFinite(chance) ? chance : 0)) * 3)));
  const beats = [{kind: 'throw'}];
  for (let i = 0; i < wobbles; i++) beats.push({kind: 'wobble', index: i + 1, of: wobbles});
  beats.push({kind: caught ? 'caught' : 'break'});
  return beats;
}

/** Markup for the orb that holds the creature during a throw. */
export function orbMarkup(state) {
  return `<img class="orb-ball orb-${state}" src="assets/items/item-capture-orb.png" alt="" aria-hidden="true">`;
}
