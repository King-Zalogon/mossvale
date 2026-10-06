import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assets} from '../dist/src/data/assets.js';
import {buildAdventure} from '../dist/src/domain/adventure.js';
import {validatePack} from '../dist/src/domain/pack.js';
import {resolveRegistries} from '../dist/src/domain/registries.js';
import {validateSceneScript} from '../scripts/scene-script.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => JSON.parse(readFileSync(join(root, path), 'utf8'));

test('hearth yard proof maps a supported scene script to a validated playable fixture', () => {
  const script = read('content/scene-scripts/examples/hearth-yard-proof.json');
  const catalogue = read('content/catalogue/catalogue.json');
  assert.deepEqual(validateSceneScript(script, catalogue).errors, []);

  const pack = read('tests/fixtures/packs/hearth/index.json');
  const map = read('tests/fixtures/packs/hearth/hearth-yard.json');
  const registries = read('tests/fixtures/packs/hearth/registries.json');
  assert.deepEqual(validatePack(pack, {speciesIds: new Set(pack.species), mapIds: new Set(pack.maps)}), []);
  const content = resolveRegistries(registries, assets);
  const built = buildAdventure([map], {assets, ...content, packId: pack.id}, undefined, undefined, pack);
  assert.deepEqual(built.errors, []);
  assert.equal(map.spawns.camp.join(','), '3,5');
  assert.deepEqual(map.landmarks.filter(item => ['building', 'villager', 'box'].includes(item.id)).map(item => item.id), ['building', 'villager', 'box']);
  assert.equal(map.landmarks.find(item => item.id === 'box').flag, 'hearth-yard.chest');
  assert.equal(pack.milestones[0], 'hearth-yard.chest');
});

test('hearth proof continuity keeps its next scene proposal explicit', () => {
  const handoff = read('content/scene-scripts/handoffs/hearth-yard-proof.json');
  assert.equal(handoff.sceneId, 'hearth-yard-proof');
  assert.deepEqual(handoff.nextSceneProposal.carryForward, ['wren-welcomes-travelers', 'healer-wren', 'yard-villager']);
  assert.deepEqual(handoff.nextSceneProposal.gaps, []);
});
