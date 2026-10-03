/* Sprite sheet access and 2D drawing helpers shared by the world, HUD and menus. */
import {species} from '../data/species.js';

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
  const im = options.tint && options.tint !== 'none' ? tintedSprite(id, options.tint) : source;
  const h = (w * source.height) / source.width;
  c.save();
  c.imageSmoothingEnabled = false;
  if (options.alpha !== undefined) c.globalAlpha = options.alpha;
  if (options.flip) {
    c.translate(Math.round(x), Math.round(y));
    c.scale(-1, 1);
    c.drawImage(im, Math.round(-w / 2), Math.round(-h), Math.round(w), Math.round(h));
  } else c.drawImage(im, Math.round(x - w / 2), Math.round(y - h), Math.round(w), Math.round(h));
  c.restore();
}

/** Draws a species portrait centered at the bottom of a canvas element. */
export function drawCreature(canvasEl, speciesId, width = 105) {
  const c = canvasEl?.getContext('2d');
  if (!c) return;
  c.clearRect(0, 0, c.canvas.width, c.canvas.height);
  drawSprite(c, species[speciesId].sprite, c.canvas.width / 2, c.canvas.height - 7, width);
}
