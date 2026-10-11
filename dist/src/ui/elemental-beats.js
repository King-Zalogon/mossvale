/* Presentation only: reveal a resolved elemental hit when its projectile reaches the target. */
import {fxForEvent} from './battle-fx.js';

export function elementalBeats({event, type, side, previous, message, introduction, calm = false}) {
  const enemy = side === 'enemy';
  const duration = enemy ? [100, 300, 300] : [100, 280, 270];
  const effect = (stage, wait) => ({type, side, stage, duration: wait});
  const impact = {
    message,
    animation: enemy ? 'enemy-element' : 'element',
    after: event.after,
    sfx: enemy ? 'hurt' : 'element',
    fx: {...fxForEvent(event), elemental: effect('impact', calm ? 250 : duration[2])},
    wait: calm ? 250 : duration[2],
  };
  if (calm) return [impact];
  return [
    ...['prepare', 'travel'].map((stage, i) => ({
      message: introduction,
      animation: enemy ? 'enemy-element-windup' : 'element-windup',
      after: {...previous, focus: event.after.focus},
      fx: {pops: [], shake: 0, burst: null, elemental: effect(stage, duration[i])},
      wait: duration[i],
    })),
    impact,
  ];
}
