// Guards the one measured rendering bottleneck (#37): a Canvas `filter` applied while drawing every frame is
// re-rasterised each time (2-4 fps on Amber Ridge / Frostveil in software rendering). Tints are baked once instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildWorld, isWalkable, nearestInteractive, objectsInBounds, tilesInBounds} from '../dist/src/domain/world.js';
import {walkableAt} from '../dist/src/domain/mapdata.js';

const read = f => readFileSync(new URL('../dist/src/' + f, import.meta.url), 'utf8');

test('no per-frame canvas filters: tints are baked into cached sprite copies', () => {
  const sprites = read('render/sprites.js');
  assert.equal((sprites.match(/\.filter\s*=/g) ?? []).length, 1, 'only the one-time bake sets a filter');
  assert.ok(sprites.indexOf('.filter =') > sprites.indexOf('function tintedSprite'), 'and it is inside tintedSprite');
  assert.ok(sprites.includes('tinted.set('), 'tinted copies are cached');
  assert.equal(/\.filter\s*=/.test(read('render/world.js')), false);
});

test('large-map render and interaction queries visit only nearby indexed cells', () => {
  const tiles = Array.from({length: 120 * 80}, (_, i) => ({x: i % 120, y: Math.floor(i / 120)}));
  const objects = Array.from({length: 900}, (_, i) => ({id: `prop-${i}`, kind: 'grass', x: i % 120, y: Math.floor(i / 120)}));
  objects.push({id: 'near-sign', kind: 'sign', x: 55, y: 35});
  objects.push({id: 'tree', kind: 'scenery', x: 21, y: 20, solid: 1});
  const map = {size: {w: 120, h: 80}, tiles, objects, terrainAt: () => 'ground'};
  const world = buildWorld(map);
  const bounds = {minX: 50, maxX: 60, minY: 30, maxY: 40};
  const visibleTiles = tilesInBounds(world, bounds);
  const visibleObjects = objectsInBounds(world, bounds);

  assert.equal(visibleTiles.length, 121);
  assert.ok(visibleTiles.length < tiles.length / 4);
  assert.ok(visibleObjects.length < objects.length / 4);
  assert.equal(nearestInteractive(world, {x: 54, y: 35})?.id, 'near-sign');
  assert.equal(nearestInteractive(world, {x: 20, y: 20}), null);
  assert.equal(isWalkable(world, 21, 20), false);
  assert.equal(isWalkable(world, 23, 20), walkableAt(map, 23, 20), 'indexed collision checks preserve the full-map rule');
});

test('the world renderer culls before sorting and preserves explicit depth order', () => {
  const renderer = read('render/world.js');
  assert.ok(renderer.includes('tilesInBounds(world'));
  assert.ok(renderer.includes('objectsInBounds(world'));
  assert.ok(renderer.includes('visibleObjects, follow'));
  assert.equal(
    renderer.slice(renderer.indexOf('function drawWorld'), renderer.indexOf('function drawMinimap')).includes('for (const t of world.tiles)'),
    false,
  );
  assert.match(renderer, /\.sort\(\s*\(a, b\) => a\.x \+ a\.y - b\.x - b\.y/);
  assert.match(renderer, /occludesPlayer\s*=\s*\(o, s\)/, 'foreground sprite occlusion remains active after culling');
});

test('a queued animation timestamp before setup stays at frame zero with safe element geometry', async () => {
  const {assets} = await import('../dist/src/data/assets.js');
  const {species} = await import('../dist/src/data/species.js');
  const {drawCreatureAnimated, sprites} = await import('../dist/src/render/sprites.js');
  const assetId = assets.findIndex(asset => asset.name === `creature-${species[0].id}-combat`);
  const previousSprite = sprites[assetId];
  const previousRAF = globalThis.requestAnimationFrame;
  const callbacks = [];
  globalThis.requestAnimationFrame = callback => callbacks.push(callback);
  sprites[assetId] = {complete: true, naturalWidth: assets[assetId].w, naturalHeight: assets[assetId].h};
  try {
    for (const state of ['idle', 'element']) {
      const radii = [];
      const context = {
        canvas: {width: 160, height: 145},
        save() {},
        restore() {},
        clearRect() {},
        drawImage() {},
        beginPath() {},
        arc(x, y, radius) {
          radii.push(radius);
        },
        stroke() {},
        fill() {},
      };
      const canvas = {isConnected: true, dataset: {}, classList: {add() {}, remove() {}}, getContext: () => context};
      drawCreatureAnimated(canvas, 0, 105, state);
      const tick = callbacks.shift();
      tick(performance.now() - 500);
      assert.equal(canvas.dataset.combatFrame, '0');
      assert.ok(radii.every(radius => radius >= 0));
      canvas.isConnected = false;
      callbacks.length = 0;
    }
  } finally {
    sprites[assetId] = previousSprite;
    globalThis.requestAnimationFrame = previousRAF;
  }
});
