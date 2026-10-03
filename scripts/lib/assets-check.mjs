// Checks the asset manifest against the PNGs behind it (conventions: docs/ASSETS.md).
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join, relative, sep} from 'node:path';
import {decodePng, opaqueBounds} from './png.mjs';

export const KINDS = {prop: 'props', creature: 'creatures', person: 'people', item: 'items'};
const PREFIXED = ['creature', 'person', 'item']; // these kinds put their kind in the name: creature-fernling
const STORY_WORDS = /(^|-)(iris|ranger|hero|player|boss|guardian|npc|quest|villain|mentor)(-|$)/;
const MAX_PAD = {side: 8, top: 8, bottom: 6}; // sprites are cropped tight; feet sit on the bottom edge (anchor: bottom-center)

const walk = dir => readdirSync(dir).flatMap(f => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));

/**
 * @param {object[]} assets manifest entries
 * @param {string} distDir absolute path of the folder the `src` paths are relative to
 * @param {{referenceText?: string}} options text of everything that may refer to asset names (maps, code)
 * @returns {{errors: string[], warnings: string[]}}
 */
export function checkAssets(assets, distDir, {referenceText = null} = {}) {
  const errors = [];
  const warnings = [];
  const names = new Set();
  for (const a of assets) {
    const where = a.name;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.name)) errors.push(`${where}: name must be lowercase kebab-case`);
    if (names.has(a.name)) errors.push(`${where}: duplicate name`);
    names.add(a.name);
    if (STORY_WORDS.test(a.name)) errors.push(`${where}: name describes a story role; name assets by what they look like`);
    if (!(a.kind in KINDS)) errors.push(`${where}: kind must be one of ${Object.keys(KINDS).join(', ')}`);
    else {
      if (a.src !== `assets/${KINDS[a.kind]}/${a.name}.png`) errors.push(`${where}: src must be assets/${KINDS[a.kind]}/${a.name}.png, got ${a.src}`);
      if (PREFIXED.includes(a.kind) && !a.name.startsWith(a.kind + '-')) errors.push(`${where}: ${a.kind} names start with "${a.kind}-"`);
      if (!PREFIXED.includes(a.kind) && PREFIXED.some(k => a.name.startsWith(k + '-')))
        errors.push(`${where}: only creature/person/item assets use those name prefixes`);
    }
    if (a.anchor !== 'bottom-center') errors.push(`${where}: anchor must be bottom-center`);
    let buf;
    try {
      buf = readFileSync(join(distDir, a.src));
    } catch {
      errors.push(`${where}: file ${a.src} is missing`);
      continue;
    }
    let im;
    try {
      im = decodePng(buf);
    } catch (e) {
      errors.push(`${where}: ${e.message}`);
      continue;
    }
    if (im.width !== a.w || im.height !== a.h) errors.push(`${where}: is ${im.width}x${im.height}, manifest says ${a.w}x${a.h}`);
    if (im.color !== 6) {
      errors.push(`${where}: must be 8-bit RGBA (colour type 6) so it has real transparency, got type ${im.color}`);
      continue;
    }
    if (a.frames) {
      const {columns, rows, frameWidth, frameHeight} = a.frames;
      if (![columns, rows, frameWidth, frameHeight].every(Number.isInteger) || [columns, rows, frameWidth, frameHeight].some(value => value <= 0)) {
        errors.push(`${where}: frames must have positive integer columns, rows, frameWidth and frameHeight`);
        continue;
      }
      if (im.width !== columns * frameWidth || im.height !== rows * frameHeight)
        errors.push(`${where}: frame grid ${columns}x${rows} at ${frameWidth}x${frameHeight} does not match image ${im.width}x${im.height}`);
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const bounds = frameBounds(im, column * frameWidth, row * frameHeight, frameWidth, frameHeight);
          const label = `${where} frame ${row},${column}`;
          if (!bounds) errors.push(`${label}: frame is fully transparent`);
          else if (bounds.bottom > MAX_PAD.bottom)
            errors.push(`${label}: ${bounds.bottom}px of empty space under the feet; the anchor is bottom-centre (max ${MAX_PAD.bottom})`);
        }
      }
    } else {
      const pad = opaqueBounds(im);
      if (!pad) errors.push(`${where}: image is fully transparent`);
      else {
        if (pad.left > MAX_PAD.side || pad.right > MAX_PAD.side)
          errors.push(`${where}: side padding ${pad.left}/${pad.right}px; crop tighter (max ${MAX_PAD.side})`);
        if (pad.top > MAX_PAD.top) errors.push(`${where}: top padding ${pad.top}px; crop tighter (max ${MAX_PAD.top})`);
        if (pad.bottom > MAX_PAD.bottom)
          errors.push(`${where}: ${pad.bottom}px of empty space under the feet; the anchor is bottom-centre (max ${MAX_PAD.bottom})`);
      }
    }
  }
  // Every PNG under assets/ must be in the manifest.
  const listed = new Set(assets.map(a => a.src));
  try {
    for (const file of walk(join(distDir, 'assets'))) {
      const rel = relative(distDir, file).split(sep).join('/');
      if (file.endsWith('.png') && !listed.has(rel)) errors.push(`${rel}: not in the manifest`);
    }
  } catch {
    /* no assets folder: every entry already reported as missing */
  }
  // Names nothing refers to (maps, species, code) are reported, not fatal: they may be reserved for upcoming work.
  if (referenceText !== null) {
    for (const a of assets)
      if (a.required !== false && !referenceText.includes(`'${a.name}'`) && !referenceText.includes(`"${a.name}"`))
        warnings.push(`${a.name}: required but not referenced by any map or code; mark it required:false or remove it`);
  }
  return {errors, warnings};
}

function frameBounds(im, x0, y0, width, height) {
  if (im.color !== 6) return null;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (im.data[(y0 + y) * im.stride + (x0 + x) * 4 + 3] > 8) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < 0) return null;
  return {left: minX, top: minY, right: width - 1 - maxX, bottom: height - 1 - maxY};
}
