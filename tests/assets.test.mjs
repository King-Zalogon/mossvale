import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync, crc32} from 'node:zlib';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {assets, spriteId} from '../dist/src/data/assets.js';
import {species} from '../dist/src/data/species.js';
import {checkAssets} from '../scripts/lib/assets-check.mjs';
import {decodePng, opaqueBounds} from '../scripts/lib/png.mjs';
import {readFileSync} from 'node:fs';

/** A tiny PNG writer for fixtures. `pixel(x, y)` returns [r, g, b, a] (type 6) or [r, g, b] (type 2). */
function makePng(w, h, pixel, colorType = 6) {
  const ch = colorType === 6 ? 4 : 3;
  const raw = Buffer.alloc((w * ch + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) pixel(x, y).forEach((v, i) => (raw[y * (w * ch + 1) + 1 + x * ch + i] = v));
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const solid = () => [10, 200, 30, 255];
const entry = (name, kind, extra = {}) => ({
  name,
  kind,
  src: `assets/${{prop: 'props', creature: 'creatures', person: 'people', item: 'items'}[kind]}/${name}.png`,
  w: 20,
  h: 20,
  anchor: 'bottom-center',
  required: true,
  ...extra,
});

function withDist(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'mossvale-assets-'));
  try {
    for (const [path, buf] of Object.entries(files)) {
      mkdirSync(join(dir, path, '..'), {recursive: true});
      writeFileSync(join(dir, path), buf);
    }
    return fn(dir);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
}
const has = (errors, text) =>
  assert.ok(
    errors.some(e => e.includes(text)),
    `expected "${text}" in:\n${errors.join('\n')}`,
  );

test('the shipped manifest, names and PNGs pass the checks', () => {
  const dist = new URL('../dist/', import.meta.url).pathname;
  const {errors} = checkAssets(assets, dist);
  assert.deepEqual(errors, []);
});

test('content refers to art by name: species, directions and the manifest agree', () => {
  assert.equal(new Set(assets.map(a => a.name)).size, assets.length);
  for (const s of species) assert.equal(assets[s.sprite].kind, 'creature', s.id);
  for (const d of ['south', 'north', 'west', 'east']) assert.equal(assets[spriteId(`person-red-cap-${d}`)].kind, 'person');
  assert.throws(() => spriteId('no-such-sprite'), /unknown asset/);
});

test('a well-formed sprite passes; the decoder reports padding', () => {
  const png = makePng(20, 20, (x, y) => (x >= 2 && x < 18 && y >= 3 && y < 19 ? [1, 2, 3, 255] : [0, 0, 0, 0]));
  assert.deepEqual(opaqueBounds(decodePng(png)), {left: 2, top: 3, right: 2, bottom: 1});
  withDist({'assets/props/tree-fir.png': png}, dir => assert.deepEqual(checkAssets([entry('tree-fir', 'prop')], dir), {errors: [], warnings: []}));
});

test('problems are reported with the asset name', () => {
  const good = makePng(20, 20, solid);
  const run = (list, files) => withDist(files, dir => checkAssets(list, dir).errors);
  has(run([entry('tree-fir', 'prop', {w: 21})], {'assets/props/tree-fir.png': good}), 'is 20x20, manifest says 21x20');
  has(run([entry('tree-fir', 'prop')], {}), 'file assets/props/tree-fir.png is missing');
  has(run([entry('tree-fir', 'prop')], {'assets/props/tree-fir.png': makePng(20, 20, () => [1, 2, 3], 2)}), 'RGBA');
  has(run([entry('tree-fir', 'prop')], {'assets/props/tree-fir.png': makePng(20, 20, () => [0, 0, 0, 0])}), 'fully transparent');
  has(
    run([entry('tree-fir', 'prop')], {'assets/props/tree-fir.png': makePng(20, 20, (x, y) => (y < 8 ? [1, 2, 3, 255] : [0, 0, 0, 0]))}),
    'empty space under the feet',
  );
  has(run([entry('tree-fir', 'prop')], {'assets/props/tree-fir.png': makePng(20, 20, x => (x > 12 ? [1, 2, 3, 255] : [0, 0, 0, 0]))}), 'side padding');
  has(run([entry('tree-fir', 'prop'), entry('tree-fir', 'prop')], {'assets/props/tree-fir.png': good}), 'duplicate name');
  has(run([entry('Tree_Fir', 'prop', {src: 'assets/props/Tree_Fir.png'})], {'assets/props/Tree_Fir.png': good}), 'kebab-case');
  has(run([entry('ranger-iris', 'prop')], {'assets/props/ranger-iris.png': good}), 'story role');
  has(run([entry('tree-fir', 'prop', {src: 'sprites/tree-fir.png'})], {'sprites/tree-fir.png': good}), 'src must be assets/props/tree-fir.png');
  has(run([entry('fox', 'creature')], {'assets/creatures/fox.png': good}), 'creature names start with "creature-"');
  has(run([entry('creature-tree', 'prop')], {'assets/props/creature-tree.png': good}), 'only creature/person/item');
  has(run([entry('tree-fir', 'prop', {kind: 'tree'})], {'assets/props/tree-fir.png': good}), 'kind must be one of');
  has(run([entry('tree-fir', 'prop', {anchor: 'center'})], {'assets/props/tree-fir.png': good}), 'anchor');
  has(run([entry('tree-fir', 'prop')], {'assets/props/tree-fir.png': good, 'assets/props/stray.png': good}), 'stray.png: not in the manifest');
});

test('unused required assets are flagged as warnings, optional ones are not', () => {
  const good = makePng(20, 20, solid);
  withDist({'assets/props/tree-fir.png': good, 'assets/items/item-orb.png': good}, dir => {
    const list = [entry('tree-fir', 'prop'), entry('item-orb', 'item', {required: false})];
    const {warnings} = checkAssets(list, dir, {referenceText: ''});
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /tree-fir: required but not referenced/);
    assert.deepEqual(checkAssets(list, dir, {referenceText: `"tree-fir"`}).warnings, []);
  });
});

test('the real sprites decode as tightly cropped RGBA', () => {
  const dist = new URL('../dist/', import.meta.url);
  for (const a of assets) {
    const im = decodePng(readFileSync(new URL(a.src, dist)));
    assert.equal(im.color, 6, a.name);
    assert.ok(opaqueBounds(im).bottom <= 3, `${a.name} stands on the bottom edge`);
  }
});
