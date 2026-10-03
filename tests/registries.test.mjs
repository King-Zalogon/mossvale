import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import defaultRegistries from '../dist/maps/registries.json' with {type: 'json'};
import {assets} from '../dist/src/data/assets.js';
import {species} from '../dist/src/data/species.js';
import {regions} from '../dist/src/data/regions.js';
import {CAPS, SHOP} from '../dist/src/data/economy.js';
import {PACK_ID} from '../dist/src/data/pack.js';
import {configureRegistry} from '../dist/src/data/registry.js';
import {validateRegistries} from '../dist/src/domain/registries.js';
import {elementPower, maxHP} from '../dist/src/domain/rules.js';
import {create} from '../dist/src/save.js';
import {XP_PER_LEVEL} from '../dist/src/config.js';

const read = name => JSON.parse(readFileSync(new URL(`./fixtures/packs/${name}/registries.json`, import.meta.url), 'utf8'));
const check = registry => validateRegistries(registry, {assetNames: new Set(assets.map(asset => asset.name))});

test('pack registries are versioned, field-checked and bound to shared asset IDs', () => {
  assert.deepEqual(check(defaultRegistries), []);
  const invalid = structuredClone(defaultRegistries);
  invalid.species[0].sprite = 'missing-art';
  invalid.progression.partySize = 8;
  invalid.tactics.defaultPattern = ['teleport'];
  const errors = check(invalid).join('\n');
  assert.match(errors, /unknown shared asset/);
  assert.match(errors, /partySize/);
  assert.match(errors, /supported actions/);
});

test('two packs install different species, region, economy and battle rules through the same engine modules', () => {
  const speciesRef = species;
  const regionsRef = regions;
  const capsRef = CAPS;
  const shopRef = SHOP;
  try {
    for (const [folder, packId, regionName, xpPerLevel, power] of [
      ['hearth', 'hearth-hamlet', 'Hearth Hamlet', 40, 16],
      ['bakery', 'bakery-lane', 'Bakery Lane', 55, 11],
    ]) {
      const registry = read(folder);
      if (folder === 'bakery') registry.moves.elemental.power = power;
      assert.deepEqual(check(registry), []);
      assert.deepEqual(configureRegistry({registries: registry, packId}), []);
      assert.equal(species, speciesRef, 'engine imports retain their live collection reference');
      assert.equal(regions, regionsRef);
      assert.equal(CAPS, capsRef);
      assert.equal(SHOP, shopRef);
      assert.equal(regions[0].name, regionName);
      assert.equal(XP_PER_LEVEL, xpPerLevel);
      assert.equal(elementPower({team: {0: {xp: xpPerLevel}}}, 0), power);
      assert.equal(maxHP({team: {0: {xp: xpPerLevel}}}, 0), species[0].hp + 4);

      const codec = create({species, regions, size: 64, pack: packId});
      const stored = JSON.parse(codec.serialize(codec.fresh()));
      assert.equal(stored.caught[0], species[0].id, 'persisted identity stays a string even when pack order differs');
      assert.equal(stored.region, regions[0].id);
    }
  } finally {
    assert.deepEqual(configureRegistry({registries: defaultRegistries, packId: 'mossvale'}), []);
  }
  assert.equal(PACK_ID, 'mossvale');
});
