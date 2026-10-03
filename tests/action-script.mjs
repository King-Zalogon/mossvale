/* Shared, player-shaped actions consumed by the domain and browser adapters. Coordinates are ordinary walk targets. */
export const rangerToShrineScript = [
  {type: 'walk-to', label: 'ranger-approach', target: {x: 12, y: 11.4}},
  {type: 'interact', target: 'ranger'},
  {type: 'finish-dialogue'},
  {type: 'advance-clock', milliseconds: 251},
  {type: 'walk-to', label: 'cottage-pass', target: {x: 11.1, y: 10}},
  {type: 'walk-to', label: 'shrine-approach', target: {x: 11.1, y: 6.2}},
  {type: 'interact', target: 'shrine'},
  {type: 'challenge'},
  {type: 'battle-action', action: 'guard'},
  {type: 'interrupt-reload'},
];

/** Invert world-coordinate movement into the eight screen-space keyboard directions. */
export function inputForWorldTarget(player, target) {
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const sx = Math.sign(dx - dy);
  const sy = Math.sign(dx + dy);
  const keys = [];
  if (sy < 0) keys.push('w');
  if (sy > 0) keys.push('s');
  if (sx < 0) keys.push('a');
  if (sx > 0) keys.push('d');
  return {sx, sy, keys};
}
