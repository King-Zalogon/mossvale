/* Sprite sheet access and 2D drawing helpers shared by the world, HUD and menus. */
import {species} from '../data/species.js';
import {assets} from '../data/assets.js';

export const sprites = [];

const tinted = new Map();

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
  c.clearRect(0, 0, c.canvas.width, c.canvas.height);
  drawSprite(c, species[speciesId].sprite, c.canvas.width / 2, c.canvas.height - 7, width);
}
