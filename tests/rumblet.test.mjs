import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assets, spriteId} from '../dist/src/data/assets.js';
import {species} from '../dist/src/data/species.js';
import {validateRegistries, resolveRegistries} from '../dist/src/domain/registries.js';
import {buildAdventure} from '../dist/src/domain/adventure.js';
import {rawMaps, rawPack, rawObjectives, rawStory, rawInventoryRules} from './helpers.mjs';
import {decodePng} from '../scripts/lib/png.mjs';

const definition = JSON.parse(readFileSync(new URL('../dist/resources/creatures/rumblet.json', import.meta.url)));
const registry = JSON.parse(readFileSync(new URL('../dist/maps/registries.json', import.meta.url)));

test('Rumblet is importable pack data without altering active maps or persisted roster IDs', () => {
  assert.equal(definition.id, 'rumblet');
  assert.equal(definition.type, 'Stone');
  assert.deepEqual(validateRegistries({...registry, species: [...registry.species, definition]}, {assetNames: new Set(assets.map(a => a.name))}), []);
  assert.equal(species.length, 21);
  assert.ok(!species.some(entry => entry.id === definition.id));
  assert.equal(definition.sprite, 'creature-rumblet');
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

test('all sixty Rumblet atlas poses have visible ink, gutters, anchors and distinct direction/stride content', () => {
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
