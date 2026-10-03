/* Sprite sheet access and 2D drawing helpers shared by the world, HUD and menus. */
import {species} from '../data/species.js';
import {assets} from '../data/assets.js';

export const sprites = [];

export function drawSprite(c, id, x, y, w, options = {}) {
  const im = sprites[id];
  if (!im?.complete || !im.naturalWidth) return;
  const meta = assets[id];
  const frame = options.frame || meta?.frames?.defaultFrame || {column: 0, row: 0};
  const columns = meta?.frames?.columns || 1;
  const rows = meta?.frames?.rows || 1;
  const sourceWidth = im.naturalWidth / columns;
  const sourceHeight = im.naturalHeight / rows;
  const frameWidth = meta?.frames?.frameWidth || sourceWidth;
  const frameHeight = meta?.frames?.frameHeight || sourceHeight;
  const h = (w * frameHeight) / frameWidth;
  c.save();
  c.imageSmoothingEnabled = false;
  if (options.alpha !== undefined) c.globalAlpha = options.alpha;
  if (options.tint) c.filter = options.tint;
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
