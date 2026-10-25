import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assets, spriteId} from '../dist/src/data/assets.js';
import {species} from '../dist/src/data/species.js';
import {validateRegistries, resolveRegistries} from '../dist/src/domain/registries.js';
import {buildAdventure} from '../dist/src/domain/adventure.js';
import {rawMaps, rawPack, rawObjectives, rawStory, rawInventoryRules} from './helpers.mjs';
import {decodePng} from '../scripts/lib/png.mjs';

const definition = JSON.parse(readFileSync(new URL('../dist/resources/creatures/coglet.json', import.meta.url)));
const registry = JSON.parse(readFileSync(new URL('../dist/maps/registries.json', import.meta.url)));

test('Coglet is importable pack data without altering active maps or persisted roster IDs', () => {
  assert.equal(definition.id, 'coglet');
  assert.equal(definition.type, 'Spark');
  assert.deepEqual(validateRegistries({...registry, species: [...registry.species, definition]}, {assetNames: new Set(assets.map(a => a.name))}), []);
  assert.equal(species.length, 21);
  assert.ok(!species.some(entry => entry.id === definition.id));
  assert.equal(definition.sprite, 'creature-coglet');
});

test('Coglet lenses stay on the forward shell and the sagittal gear presents its edge front/rear', () => {
  const image = decodePng(readFileSync(new URL('../dist/assets/creatures/creature-coglet-follower.png', import.meta.url)));
  const observations = [];
  for (let row = 0; row < 8; row++) {
    observations[row] = [];
    for (let col = 0; col < 5; col++) {
      const pixels = [];
      for (let y = 0; y < 200; y++)
        for (let x = 0; x < 200; x++) {
          const offset = ((row * 200 + y) * image.width + col * 200 + x) * 4;
          const [r, g, b, a] = image.data.slice(offset, offset + 4);
          if (a) pixels.push({x, y, r, g, b});
        }
      const top = Math.min(...pixels.map(p => p.y));
      const bottom = Math.max(...pixels.map(p => p.y));
      // Separate the dorsal bearing from the large lenses on the lower shell.
      const eyes = pixels.filter(p => p.y >= top + (bottom - top) * 0.48 && p.g > 100 && p.b > 100 && p.r < p.g * 0.7 && p.r < p.b * 0.7);
      const gear = pixels.filter(p => p.y < top + (bottom - top) * 0.3 && p.r > 100 && p.g > 45 && p.b < p.g * 0.65);
      assert.ok(gear.length > 20, `direction ${row}/${col}: intact dorsal gear`);
      const gearWidth = Math.max(...gear.map(p => p.x)) - Math.min(...gear.map(p => p.x)) + 1;
      observations[row].push(gearWidth);
      if ([0, 1, 7].includes(row)) assert.ok(eyes.length < 20, `rear ${row}/${col}: no large front lens on rear shell`);
      else assert.ok(eyes.length > 150, `front/profile ${row}/${col}: readable forward lens`);
      if ([2, 6].includes(row)) {
        const meanX = eyes.reduce((sum, p) => sum + p.x, 0) / eyes.length;
        assert.ok(row === 2 ? meanX > 130 : meanX < 70, `profile ${row}/${col}: lens stays at leading end`);
      }
    }
  }
  for (let col = 0; col < 5; col++) {
    const narrow = Math.max(observations[0][col], observations[4][col]);
    const broad = Math.min(observations[2][col], observations[6][col]);
    assert.ok(broad > narrow * 1.6, `phase ${col}: flank gear disc is broader than front/rear rim`);
  }
});

test('the documented future-map import compiles through the existing adventure builder', () => {
  const maps = rawMaps();
  const pack = rawPack();
  const content = resolveRegistries({...registry, species: [...registry.species, definition]}, assets);
  pack.species.push(definition.id);
  maps.find(map => map.id === 'meadow').zones[0].pool.push({species: definition.id, weight: 1});
  const built = buildAdventure(maps, {assets, ...content, packId: pack.id}, rawObjectives(), rawStory(), pack, rawInventoryRules());
  assert.deepEqual(built.errors, []);
  assert.ok(built.mapsById.meadow.zones[0].pool.includes(content.species.findIndex(s => s.id === definition.id)));
  assert.ok(
    !rawMaps().some(map => map.zones.some(zone => zone.pool.some(entry => (typeof entry === 'string' ? entry : entry.species) === definition.id))),
    'fixture import did not mutate shipped maps',
  );
});

test('all sixty Coglet atlas poses have visible ink, gutters, anchors and distinct direction/stride content', () => {
  for (const suffix of ['-combat', '-follower']) {
    const asset = assets[spriteId(definition.sprite + suffix)];
    assert.equal(asset.required, false);
    assert.equal(asset.anchor, 'bottom-center');
    const image = decodePng(readFileSync(new URL('../dist/' + asset.src, import.meta.url)));
    const {frameWidth: w, frameHeight: h, columns, rows} = asset.frames;
    const masks = [];
    for (let row = 0; row < rows; row++) {
      const frames = [];
      for (let col = 0; col < columns; col++) {
        const alpha = [];
        let ink = 0;
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const value = image.data[((row * h + y) * image.width + col * w + x) * 4 + 3];
            alpha.push(value);
            if (value) ink++;
            if (x < 4 || x >= w - 4 || y < 4 || y >= h - 4) assert.equal(value, 0, `${suffix} ${row}/${col} gutter ${x}/${y}`);
          }
        assert.ok(ink > 100);
        frames.push(Buffer.from(alpha).toString('base64'));
      }
      assert.ok(new Set(frames).size > 1, `${suffix} ${row} has actual pose changes`);
      masks.push(frames[0]);
    }
    if (suffix === '-follower') {
      assert.equal(new Set(masks).size, 8, 'all directions have authored silhouettes');
      assert.notEqual(masks[6], masks[7], 'west is not northwest');
      assert.deepEqual(asset.frames.rowOrder, ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']);
    }
  }
});
