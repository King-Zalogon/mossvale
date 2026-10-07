// Terrain painter contracts (#252): readable water in every biome and smooth ground patches instead of a checkerboard.
import test from 'node:test';
import assert from 'node:assert/strict';
import {regions} from '../dist/src/data/regions.js';
import {mix, patchNoise, terrainColors} from '../dist/src/render/terrain.js';

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
const distance = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
const luminance = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

test('mix blends two hex colors and clamps its ends', () => {
  assert.equal(mix('#000000', '#ffffff', 0), '#000000');
  assert.equal(mix('#000000', '#ffffff', 1), '#ffffff');
  assert.equal(mix('#102030', '#305070', 0.5), '#203850');
});

test('water is separable from land in every region palette', () => {
  for (const region of regions) {
    const colors = terrainColors(region.palette);
    const land = [...colors.ground, colors.grass, colors.path];
    for (const water of [colors.shallow, colors.deep])
      for (const ground of land) assert.ok(distance(water, ground) > 0.23, `${region.id}: ${water} vs ${ground}`);
    assert.ok(luminance(colors.deep) < luminance(colors.shallow), `${region.id}: deep water is darker than shallow water`);
    assert.ok(luminance(colors.shore) > luminance(colors.path) - 0.02, `${region.id}: the shore band is as light as the path`);
    for (const value of Object.values(colors).flat()) assert.match(value, /^#[0-9a-f]{6}$/);
  }
});

test('ground shading changes slowly between neighbouring tiles: no checkerboard', () => {
  let largest = 0;
  for (let region = 0; region < regions.length; region++)
    for (let y = 0; y < 40; y++)
      for (let x = 0; x < 40; x++) {
        const here = patchNoise(x, y, region);
        assert.ok(here >= -0.001 && here <= 1.001);
        largest = Math.max(largest, Math.abs(here - patchNoise(x + 1, y, region)), Math.abs(here - patchNoise(x, y + 1, region)));
      }
  assert.ok(largest < 0.45, `neighbouring tiles differ by at most ${largest.toFixed(2)} of the ground range`);
  // and the field is not flat: patches exist at the scale of a few tiles
  const values = Array.from({length: 24}, (_, i) => patchNoise(i * 4, 3, 0));
  assert.ok(Math.max(...values) - Math.min(...values) > 0.25);
});
