/* Sprite sheet access and 2D drawing helpers shared by the world, HUD and menus. */
import {species} from '../data/species.js';
import {assets} from '../data/assets.js';

export const sprites = [];

const tinted = new Map();
const animationRuns = new WeakMap();

/** A copy of sprite `id` with the canvas `filter` baked in once. Applying `ctx.filter` per draw is re-rasterised every frame. */
function tintedSprite(id, tint) {
  const key = id + '|' + tint;
  let copy = tinted.get(key);
  if (!copy) {
    const im = sprites[id];
    copy = document.createElement('canvas');
    copy.width = im.naturalWidth;
    copy.height = im.naturalHeight;
    const c = copy.getContext('2d');
    c.filter = tint;
    c.drawImage(im, 0, 0);
    tinted.set(key, copy);
  }
  return copy;
}

export function drawSprite(c, id, x, y, w, options = {}) {
  const source = sprites[id];
  if (!source?.complete || !source.naturalWidth) return;
  const im = options.tint && options.tint !== 'none' ? tintedSprite(id, options.tint) : source; // same pixel size as `source`
  const meta = assets[id];
  const frame = options.frame || meta?.frames?.defaultFrame || {column: 0, row: 0};
  const columns = meta?.frames?.columns || 1;
  const rows = meta?.frames?.rows || 1;
  const sourceWidth = source.naturalWidth / columns;
  const sourceHeight = source.naturalHeight / rows;
  const frameWidth = meta?.frames?.frameWidth || sourceWidth;
  const frameHeight = meta?.frames?.frameHeight || sourceHeight;
  const h = (w * frameHeight) / frameWidth;
  c.save();
  c.imageSmoothingEnabled = false;
  if (options.alpha !== undefined) c.globalAlpha = options.alpha;
  if (options.flip) {
    c.translate(Math.round(x), Math.round(y));
    c.scale(-1, 1);
    c.drawImage(
      im,
      frame.column * sourceWidth,
      frame.row * sourceHeight,
      sourceWidth,
      sourceHeight,
      Math.round(-w / 2),
      Math.round(-h),
      Math.round(w),
      Math.round(h),
    );
  } else
    c.drawImage(
      im,
      frame.column * sourceWidth,
      frame.row * sourceHeight,
      sourceWidth,
      sourceHeight,
      Math.round(x - w / 2),
      Math.round(y - h),
      Math.round(w),
      Math.round(h),
    );
  c.restore();
}

/** Draws one fixed-size atlas cell at the same bottom-centre anchor used by a single-image sprite. */
export function drawSpriteFrame(c, id, column, row, x, y, w, options = {}) {
  drawSprite(c, id, x, y, w, {...options, frame: {column, row}});
}

/** Draws a species portrait centered at the bottom of a canvas element. */
export function drawCreature(canvasEl, speciesId, width = 105) {
  const c = canvasEl?.getContext('2d');
  if (!c) return;
  canvasEl.classList.add('creature-sprite', 'creature-idle');
  c.clearRect(0, 0, c.canvas.width, c.canvas.height);
  drawSprite(c, species[speciesId].sprite, c.canvas.width / 2, c.canvas.height - 7, width);
}

/** Paints a creature combat state from its optional multi-frame sheet; other species keep the static portrait. */
export function drawCreatureAnimated(canvasEl, speciesId, width = 105, state = 'idle', reducedMotion = false) {
  const name = `creature-${species[speciesId].id}-combat`;
  const sheetId = assets.findIndex(asset => asset.name === name);
  const frames = assets[sheetId]?.frames;
  const c = canvasEl?.getContext('2d');
  if (!c || !frames) return drawCreature(canvasEl, speciesId, width);

  const rows = {idle: 0, attack: 1, hit: 2, faint: 3, capture: 4};
  const row = rows[state] ?? 0;
  const run = {};
  animationRuns.set(canvasEl, run);
  canvasEl.classList.add('creature-sprite');
  if (state === 'idle') canvasEl.classList.add('creature-idle');
  else canvasEl.classList.remove('creature-idle');
  canvasEl.dataset.combatState = state;

  const paint = column => {
    if (!canvasEl.isConnected || animationRuns.get(canvasEl) !== run) return;
    canvasEl.dataset.combatFrame = String(column);
    c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    drawSprite(c, sheetId, c.canvas.width / 2, c.canvas.height - 7, width, {frame: {column, row}});
  };
  paint(state === 'idle' || reducedMotion ? (state === 'idle' ? 0 : 3) : 0);
  if (reducedMotion) return;

  const start = performance.now();
  const delay = state === 'idle' ? 220 : state === 'attack' ? 105 : state === 'hit' ? 80 : state === 'faint' ? 160 : 130;
  const tick = now => {
    if (!canvasEl.isConnected || animationRuns.get(canvasEl) !== run) return;
    const elapsed = now - start;
    const column = state === 'idle' ? Math.floor(elapsed / delay) % frames.columns : Math.min(frames.columns - 1, Math.floor(elapsed / delay));
    paint(column);
    if (state === 'idle' || elapsed < frames.columns * delay) requestAnimationFrame(tick);
    else drawCreatureAnimated(canvasEl, speciesId, width, 'idle', false);
  };
  requestAnimationFrame(tick);
}
