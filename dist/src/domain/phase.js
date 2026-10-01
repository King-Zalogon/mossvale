/* Explicit game phases. Controller code asks `transition` before changing screens, so impossible jumps
   (e.g. starting a battle from a result screen, or acting after a battle ended) are refused in one place. */
export const PHASES = ['explore', 'battle', 'result'];
const NEXT = {explore: ['battle', 'result'], battle: ['explore', 'result'], result: ['explore']};

/** Moves `game.phase` to `to` when allowed. Returns whether the game is now in `to`. */
export function transition(game, to) {
  if (game.phase === to) return true;
  if (!NEXT[game.phase]?.includes(to)) return false;
  game.phase = to;
  return true;
}
