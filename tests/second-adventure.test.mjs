import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {create, keysFor} from '../dist/src/save.js';
import {species} from '../dist/src/data/species.js';
import {regions} from '../dist/src/data/regions.js';
import {validateSceneSequence} from '../scripts/scene-script.mjs';

const readJson = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const fixture = name => readJson(`tests/fixtures/packs/${name}/${name === 'lantern-crossing' ? 'index' : 'index'}.json`);
const store = (init = {}) => {
  const values = new Map(Object.entries(init));
  return {values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value))};
};

test('the second adventure reuses the scene contracts with its own premise and props', () => {
  const pack = fixture('lantern-crossing');
  const story = readJson('tests/fixtures/packs/lantern-crossing/story.json');
  const map = readJson('tests/fixtures/packs/lantern-crossing/maps/start.json');
  assert.equal(pack.id, 'lantern-crossing');
  assert.match(story.premise.title, /Lantern Crossing/);
  assert.match(story.premise.paragraphs.join(' '), /Mira/);
  const chest = map.landmarks.find(landmark => landmark.kind === 'chest');
  assert.ok(chest, 'the second adventure has a distinct, reachable prop');
  assert.match(chest.label, /lantern/i);
  const catalogue = readJson('content/catalogue/catalogue.json');
  const scenes = ['one', 'two', 'three'].map(id => readJson(`content/scene-scripts/examples/continuity/lantern/lantern-${id}.json`));
  assert.deepEqual(validateSceneSequence(scenes, catalogue, {requireContinuity: true}).errors, []);
  const final = scenes.at(-1);
  assert.equal(final.continuityOut.obligations.find(item => item.id === 'light-path').status, 'resolved');
  assert.equal(final.continuityOut.actorRoles.find(item => item.id === 'pathfinder').owner, 'player');
  assert.equal(final.continuityOut.actorRoles.find(item => item.id === 'crossing-host').owner, 'npc');
  assert.equal(final.continuityOut.actorRoles.find(item => item.id === 'crossing-witness').owner, 'companion');
});

test('the second adventure keeps save ownership isolated when switching and reloading', () => {
  const mossvale = create({species, regions, size: 64, pack: 'mossvale'});
  const lantern = create({species, regions, size: 64, pack: 'lantern-crossing'});
  const storage = store();
  const mine = {...mossvale.fresh(), coins: 11};
  const crossing = {...lantern.fresh(), coins: 22};
  storage.setItem(mossvale.keys.v3, mossvale.serialize(mine));
  storage.setItem(lantern.keys.v3, lantern.serialize(crossing));
  assert.equal(mossvale.load(storage).save.coins, 11);
  assert.equal(lantern.load(storage).save.coins, 22);
  assert.notEqual(keysFor('mossvale').v3, keysFor('lantern-crossing').v3);
});
