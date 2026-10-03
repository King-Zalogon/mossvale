// Guards the one measured rendering bottleneck (#37): a Canvas `filter` applied while drawing every frame is
// re-rasterised each time (2-4 fps on Amber Ridge / Frostveil in software rendering). Tints are baked once instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = f => readFileSync(new URL('../dist/src/' + f, import.meta.url), 'utf8');

test('no per-frame canvas filters: tints are baked into cached sprite copies', () => {
  const sprites = read('render/sprites.js');
  assert.equal((sprites.match(/\.filter\s*=/g) ?? []).length, 1, 'only the one-time bake sets a filter');
  assert.ok(sprites.indexOf('.filter =') > sprites.indexOf('function tintedSprite'), 'and it is inside tintedSprite');
  assert.ok(sprites.includes('tinted.set('), 'tinted copies are cached');
  assert.equal(/\.filter\s*=/.test(read('render/world.js')), false);
});
