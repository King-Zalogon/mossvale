/* Procedural terrain painter: textured tiles baked once per zoom, plus soft transitions where two terrains meet
   (shorelines, path edges, grass fringes). No image assets; the colors come from the region palette. */
import {TILE_H, TILE_W} from '../config.js';
import {rnd} from '../domain/world.js';

const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const toHex = ([r, g, b]) =>
  '#' +
  [r, g, b]
    .map(v =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
export const mix = (a, b, t) => {
  const x = hex(a);
  const y = hex(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
};

const dist = (a, b) => Math.hypot(...hex(a).map((v, i) => (v - hex(b)[i]) / 255));

/** Moves `color` toward `target` until it is at least `min` away from every land color. */
function separate(color, lands, target, min) {
  let out = color;
  for (let i = 0; i < 8 && lands.some(land => dist(out, land) < min); i++) out = mix(out, target, 0.15);
  return out;
}

/** Derives every terrain color from a region palette so water always separates from land, whatever the biome. */
export function terrainColors(palette) {
  const water = palette[4];
  const lands = [palette[0], palette[1], palette[2], palette[3]];
  return {
    ground: [palette[0], palette[1]],
    grass: palette[2],
    path: palette[3],
    shallow: separate(mix(water, '#8fdad0', 0.28), lands, '#1f78a0', 0.24),
    deep: separate(mix(water, '#0f3550', 0.42), lands, '#0a2a44', 0.3),
    foam: '#f1fbf4',
    shore: mix(palette[3], '#fff3c4', 0.3),
    pathEdge: mix(palette[3], '#5a4a28', 0.4),
  };
}

const NEIGHBORS = [
  [1, 0, 'R', 'B'],
  [0, 1, 'B', 'L'],
  [-1, 0, 'L', 'T'],
  [0, -1, 'T', 'R'],
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) % 100000) / 100000;
  };
}

/** Smooth value noise in [0, 1): slow patches of lighter and darker ground instead of a per-tile checkerboard. */
export function patchNoise(x, y, region) {
  const gx = Math.floor(x / 4);
  const gy = Math.floor(y / 4);
  const fx = (x / 4 - gx) ** 2 * (3 - 2 * (x / 4 - gx));
  const fy = (y / 4 - gy) ** 2 * (3 - 2 * (y / 4 - gy));
  const a = rnd(gx, gy, region + 11);
  const b = rnd(gx + 1, gy, region + 11);
  const c = rnd(gx, gy + 1, region + 11);
  const d = rnd(gx + 1, gy + 1, region + 11);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

export function createTerrainPainter() {
  const cache = new Map();

  function bake(kind, variant, zoom, color) {
    const w = (TILE_W / 2) * zoom;
    const h = (TILE_H / 2) * zoom;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(w * 2) + 4;
    canvas.height = Math.ceil(h * 2) + 4;
    const c = canvas.getContext('2d');
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    c.imageSmoothingEnabled = false;
    c.beginPath();
    c.moveTo(cx, cy - h - 0.5);
    c.lineTo(cx + w + 0.5, cy);
    c.lineTo(cx, cy + h + 0.5);
    c.lineTo(cx - w - 0.5, cy);
    c.closePath();
    c.clip();
    c.fillStyle = color;
    c.fillRect(0, 0, canvas.width, canvas.height);
    const rand = mulberry32(variant * 7919 + kind.length * 104729 + 17);
    const px = Math.max(1, Math.round(zoom));
    const speck = (fill, n, wide = 1, tall = 1) => {
      c.fillStyle = fill;
      for (let i = 0; i < n; i++) {
        const u = (rand() * 2 - 1) * 0.88;
        const v = (rand() * 2 - 1) * (0.88 - Math.abs(u) * 0.88);
        c.fillRect(Math.round(cx + u * w), Math.round(cy + v * h), px * wide, px * tall);
      }
    };
    if (kind === 'ground') {
      speck(mix(color, '#ffffff', 0.12), 12);
      speck(mix(color, '#1b2a10', 0.16), 14);
      speck(mix(color, '#ffffff', 0.06), 5, 2);
      if (variant === 3) speck('#f3e7a6', 1);
    } else if (kind === 'grass') {
      const dark = mix(color, '#12310f', 0.34);
      const light = mix(color, '#d8f2a0', 0.28);
      for (let i = 0; i < 11; i++) {
        const u = (rand() * 2 - 1) * 0.82;
        const v = (rand() * 2 - 1) * (0.82 - Math.abs(u) * 0.82);
        const x = Math.round(cx + u * w);
        const y = Math.round(cy + v * h);
        c.fillStyle = i % 3 === 0 ? light : dark;
        c.fillRect(x, y - 2 * px, px, 3 * px);
        c.fillStyle = dark;
        c.fillRect(x + px, y - px, px, 2 * px);
      }
    } else if (kind === 'path') {
      speck(mix(color, '#7a6538', 0.35), 6, 2);
      speck(mix(color, '#ffffff', 0.25), 6);
      speck(mix(color, '#4a3a1c', 0.3), 4, 1, 1);
    } else if (kind === 'shallow' || kind === 'deep') {
      speck(mix(color, '#d6f3f0', kind === 'deep' ? 0.1 : 0.22), 5, 3);
      speck(mix(color, '#06202f', 0.22), 6, 2);
    }
    return canvas;
  }

  function sprite(kind, variant, zoom, color) {
    const key = `${kind}|${variant}|${zoom}|${color}`;
    let image = cache.get(key);
    if (!image) {
      image = bake(kind, variant, zoom, color);
      if (cache.size > 160) cache.clear();
      cache.set(key, image);
    }
    return image;
  }

  /** A band of `color` along the tile edge shared with a neighbor, `f` of the way toward the tile centre. */
  function band(ctx, s, w, h, from, to, f, color, alpha) {
    const P = {T: [s.x, s.y - h], R: [s.x + w, s.y], B: [s.x, s.y + h], L: [s.x - w, s.y]};
    const [ax, ay] = P[from];
    const [bx, by] = P[to];
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx + (s.x - bx) * f, by + (s.y - by) * f);
    ctx.lineTo(ax + (s.x - ax) * f, ay + (s.y - ay) * f);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  const kindOf = name => (name === 'water' ? 'water' : name === 'path' ? 'path' : name === 'tallgrass' ? 'grass' : name === 'void' ? 'void' : 'ground');

  /** Paints one terrain tile centred on screen point `s`. */
  function drawTile(ctx, world, t, s, zoom, now, region, colors) {
    const at = (dx, dy) => world.map.terrainAt(t.x + dx, t.y + dy);
    const kind = t.water ? 'water' : t.path ? 'path' : t.grass ? 'grass' : 'ground';
    const variant = Math.floor(rnd(t.x, t.y, region) * 4);
    let base;
    let bakedKind = kind;
    if (kind === 'water') {
      let deep = true;
      for (let dy = -1; dy <= 1 && deep; dy++) for (let dx = -1; dx <= 1; dx++) if (at(dx, dy) !== 'water') deep = false;
      bakedKind = deep ? 'deep' : 'shallow';
      base = deep ? colors.deep : colors.shallow;
    } else if (kind === 'ground') base = mix(colors.ground[0], colors.ground[1], Math.round(patchNoise(t.x, t.y, region) * 4) / 4);
    else base = kind === 'grass' ? colors.grass : colors.path;
    const image = sprite(bakedKind, variant, zoom, base);
    ctx.drawImage(image, Math.round(s.x - image.width / 2), Math.round(s.y - image.height / 2));
    const w = (TILE_W / 2) * zoom;
    const h = (TILE_H / 2) * zoom;
    for (const [dx, dy, from, to] of NEIGHBORS) {
      const n = kindOf(at(dx, dy));
      if (n === 'void' || n === kind) continue;
      if (kind === 'water') {
        band(ctx, s, w, h, from, to, 0.36, colors.shallow, 0.5);
        band(ctx, s, w, h, from, to, 0.1, colors.foam, 0.4 + 0.2 * Math.sin(now / 700 + t.x * 1.3 + t.y));
      } else if (n === 'water') {
        band(ctx, s, w, h, from, to, 0.3, colors.shore, 0.6);
        band(ctx, s, w, h, from, to, 0.08, colors.pathEdge, 0.28);
      } else if (kind === 'ground' && n === 'grass') band(ctx, s, w, h, from, to, 0.22, colors.grass, 0.5);
      else if ((kind === 'ground' || kind === 'grass') && n === 'path') band(ctx, s, w, h, from, to, 0.2, colors.path, 0.5);
      else if (kind === 'path') band(ctx, s, w, h, from, to, 0.12, colors.pathEdge, 0.32);
    }
    if (kind === 'water') {
      ctx.fillStyle = '#d9f5f0aa';
      ctx.fillRect(
        Math.round(s.x - 13 * zoom + Math.sin(now / 1300 + t.x + t.y * 0.7) * 3 * zoom),
        Math.round(s.y + (variant - 1.5) * zoom),
        Math.round(10 * zoom),
        Math.max(1, Math.round(zoom)),
      );
    }
  }

  return {drawTile};
}
