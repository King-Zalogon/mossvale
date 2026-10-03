/* Sound palette (#38): every sound the game makes, as data. Nothing here is required to play: each cue has a visual
   or text equivalent (toasts, battle log, result cards).
   SFX cue  = list of notes {f: Hz, d: seconds, t: start offset, g: loudness, type: wave, to: end Hz for a glide}.
   AMBIENCE = a quiet loop per region id: held drone notes plus filtered noise (wind, water) with a slow swell. */
export const VOLUMES = {low: 0.35, medium: 0.7, high: 1};

export const SFX = {
  tap: [{f: 480, d: 0.12}],
  confirm: [{f: 600, d: 0.14}],
  welcome: [
    {f: 520, d: 0.14},
    {f: 780, d: 0.22, t: 0.12},
  ],
  ready: [{f: 560, d: 0.16}],
  rest: [
    {f: 520, d: 0.14},
    {f: 640, d: 0.14, t: 0.12},
    {f: 780, d: 0.24, t: 0.24},
  ],
  buy: [{f: 520, d: 0.12}],
  encounter: [
    {f: 560, d: 0.12},
    {f: 800, d: 0.2, t: 0.1},
  ],
  guardian: [
    {f: 230, d: 0.3, type: 'sawtooth', g: 0.035},
    {f: 170, d: 0.45, t: 0.22, type: 'sawtooth', g: 0.035},
  ],
  strike: [{f: 330, d: 0.14, to: 220}],
  element: [{f: 490, d: 0.22, to: 760}],
  throw: [{f: 760, d: 0.3, to: 520}],
  guard: [{f: 400, d: 0.2, to: 520}],
  broke: [{f: 400, d: 0.3, to: 240}],
  heal: [
    {f: 610, d: 0.14},
    {f: 810, d: 0.2, t: 0.12},
  ],
  join: [{f: 560, d: 0.16}],
  hurt: [{f: 210, d: 0.22, to: 150, type: 'square', g: 0.03}],
  win: [
    {f: 640, d: 0.14},
    {f: 800, d: 0.14, t: 0.13},
    {f: 960, d: 0.34, t: 0.26},
  ],
  caught: [
    {f: 880, d: 0.12},
    {f: 1100, d: 0.12, t: 0.12},
    {f: 1320, d: 0.34, t: 0.24},
  ],
  seal: [
    {f: 523, d: 0.16},
    {f: 659, d: 0.16, t: 0.15},
    {f: 784, d: 0.16, t: 0.3},
    {f: 1047, d: 0.5, t: 0.45},
  ],
  chest: [
    {f: 988, d: 0.1, g: 0.04},
    {f: 1319, d: 0.3, t: 0.09, g: 0.04},
  ],
};

export const AMBIENCE = {
  meadow: {drone: [196, 294], noise: {f: 700, q: 0.7, g: 0.05}, swell: 0.12},
  'amber-ridge': {drone: [110, 165], noise: {f: 1100, q: 0.5, g: 0.06}, swell: 0.08},
  'frostveil-grove': {drone: [262, 392], noise: {f: 2200, q: 1.1, g: 0.045}, swell: 0.1},
  'reedfen-wetlands': {drone: [174, 220], noise: {f: 420, q: 1.2, g: 0.055}, swell: 0.14},
};
