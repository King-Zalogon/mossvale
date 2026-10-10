import test from 'node:test';
import assert from 'node:assert/strict';
import {assets} from '../dist/src/data/assets.js';
import {species} from '../dist/src/data/species.js';
import {buildAdventure} from '../dist/src/domain/adventure.js';
import {guardianCombatSprite} from '../dist/src/render/battle-art.js';
import {content, mapsById, rawMaps, codec, newSave} from './helpers.mjs';
import {createBattle} from '../dist/src/domain/battle.js';

const forms = {
  meadow: 'mushmallow-thorn-mantle',
  'amber-ridge': 'pebblit-crystal-ridge',
  'frostveil-grove': 'frostowl-ice-mantle',
  'reedfen-wetlands': 'siltkip-tide-sail',
};
for (const [mapId, form] of Object.entries(forms)) {
  test(`${mapId}: only its configured guardian uses ${form}; battle rules/save remain unchanged`, () => {
    const map = mapsById[mapId];
    const guardian = map.objects.find(object => object.kind === 'shrine').guardian;
    const expected = assets.findIndex(asset => asset.name === `creature-${form}-combat`);
    assert.ok(expected >= 0);
    const battle = createBattle(newSave(), () => 0.5, {...guardian, boss: true});
    assert.equal(guardianCombatSprite(map, battle), expected);
    assert.equal(guardianCombatSprite(map, {...battle, boss: false}), undefined);
    assert.equal(guardianCombatSprite(map, {...battle, id: species.findIndex(entry => entry.id === 'fernling')}), undefined);
    assert.equal(guardianCombatSprite({objects: []}, battle), undefined);
    const raw = rawMaps();
    delete raw.find(m => m.id === mapId).landmarks.find(l => l.kind === 'shrine').guardian.combatSprite;
    const unconfigured = buildAdventure(raw, content);
    assert.deepEqual(unconfigured.errors, []);
    assert.equal(guardianCombatSprite(unconfigured.mapsById[mapId], battle), undefined);
    assert.deepEqual(
      createBattle(newSave(), () => 0.5, {...unconfigured.mapsById[mapId].objects.find(o => o.kind === 'shrine').guardian, boss: true}),
      battle,
    );
    const save = newSave();
    save.mapId = mapId;
    save.battle = battle;
    const payload = codec.serialize(save);
    const decoded = codec.load({getItem: key => (key === 'mossvale-v3' ? payload : null), setItem: () => {}}).save;
    assert.equal(guardianCombatSprite(map, decoded.battle), expected, 'reload derives current pack art without persisting manifest indices');
  });
}
test('override rejects missing, mismatched and static assets, while old packs need no override', () => {
  for (const name of ['missing-combat', 'creature-frostowl-ice-mantle-combat', 'creature-mushmallow']) {
    const raw = rawMaps();
    raw[0].landmarks.find(l => l.kind === 'shrine').guardian.combatSprite = name;
    assert.ok(
      buildAdventure(raw, content).errors.some(e => e.includes('guardian.combatSprite')),
      name,
    );
  }
  const modified = structuredClone(content);
  const asset = modified.assets.find(a => a.name === 'creature-mushmallow-thorn-mantle-combat');
  asset.frames.rows = 4;
  assert.ok(buildAdventure(rawMaps(), modified).errors.some(e => e.includes('4×5')));
  asset.frames.rows = 5;
  asset.frames.combatDisplayWidth = 200;
  assert.ok(buildAdventure(rawMaps(), modified).errors.some(e => e.includes('display dimensions')));
});
test('ambiguous same-species shrine configurations fail safely to ordinary art', () => {
  const map = mapsById.meadow;
  const shrine = map.objects.find(o => o.kind === 'shrine');
  assert.equal(guardianCombatSprite({objects: [shrine, shrine]}, {boss: true, ...shrine.guardian}), undefined);
});

test('all eighty delivered frames are transparent, contained, nonempty and grounded at the same pixel line', async () => {
  const {readFileSync} = await import('node:fs');
  const {createHash} = await import('node:crypto');
  const {decodePng} = await import('../scripts/lib/png.mjs');
  for (const form of Object.values(forms)) {
    const name = `creature-${form}-combat`;
    const image = decodePng(readFileSync(new URL(`../dist/assets/creatures/${name}.png`, import.meta.url)));
    assert.equal(image.transparent, true);
    assert.deepEqual([image.width, image.height], [1152, 1440]);
    const hashes = new Set();
    for (let row = 0; row < 5; row++)
      for (let column = 0; column < 4; column++) {
        const pixels = [];
        let left = 288,
          right = -1,
          top = 288,
          bottom = -1;
        for (let y = 0; y < 288; y++)
          for (let x = 0; x < 288; x++) {
            const offset = (row * 288 + y) * image.stride + (column * 288 + x) * 4;
            pixels.push(...image.data.subarray(offset, offset + 4));
            if (image.data[offset + 3] > 32) {
              left = Math.min(left, x);
              right = Math.max(right, x);
              top = Math.min(top, y);
              bottom = Math.max(bottom, y);
            }
          }
        assert.ok(left >= 12 && right <= 275 && top >= 20, `${name} ${row},${column} keeps full transparent margins`);
        assert.equal(bottom, 283, `${name} ${row},${column} stable ground line`);
        hashes.add(createHash('sha256').update(Buffer.from(pixels)).digest('hex'));
      }
    assert.ok(hashes.size >= 12, `${name} includes independently drawn action poses`);
  }
});
