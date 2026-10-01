/* Sprite sheet access and 2D drawing helpers shared by the world, HUD and menus. */
import {species} from '../data/species.js';

export const sprites = [];

export function drawSprite(c, id, x, y, w, options = {}) {
  const im = sprites[id];
  if (!im?.complete || !im.naturalWidth) return;
  const h = (w * im.height) / im.width;
  c.save();
  c.imageSmoothingEnabled = false;
  if (options.alpha !== undefined) c.globalAlpha = options.alpha;
  if (options.tint) c.filter = options.tint;
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
