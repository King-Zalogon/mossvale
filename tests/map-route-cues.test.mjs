import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assets} from '../dist/src/data/assets.js';
import {buildAdventure} from '../dist/src/domain/adventure.js';
import {buildWorld} from '../dist/src/domain/world.js';
import {resolveRegistries} from '../dist/src/domain/registries.js';
import {analyzeMapDesign} from '../scripts/lib/map-design-report.mjs';

const read = file => JSON.parse(readFileSync(new URL(`../dist/maps/${file}`, import.meta.url), 'utf8'));
const index = read('index.json');
const maps = index.maps.map(id => read(`${id}.json`));
const registries = read(index.registries ?? 'registries.json');
const content = resolveRegistries(registries, assets);
const {mapsById} = buildAdventure(maps, {assets, ...content, packId: index.id}, read(index.objectives), read(index.story), index, read(index.inventory));
const rawById = new Map(maps.map(map => [map.id, map]));
const reports = new Map(index.maps.map(id => [id, analyzeMapDesign(buildWorld(mapsById[id]), rawById.get(id), rawById)]));

test('every shipped exit has a nearby readable route cue', () => {
  for (const [id, report] of reports) {
    const distant = report.wayfindingCues.filter(cue => cue.signDistance === null || cue.signDistance > 12);
    assert.deepEqual(distant, [], `${id} has exits without a nearby sign: ${distant.map(item => item.id).join(', ')}`);
    assert.ok(!report.warnings.some(item => item.code === 'missing-wayfinding-cue'), `${id} has a missing cue warning`);
  }
});

test('orchard encounter habitats are reachable after first-match zone precedence', () => {
  const warnings = reports.get('orchard-ruins').warnings.filter(item => item.code === 'unavailable-encounter-zone');
  assert.deepEqual(warnings, []);
});

test('public Reedfen wayfinding does not disclose the companion-gated shallow cut', () => {
  const raw = rawById.get('reedfen-wetlands');
  const publicSigns = raw.landmarks.filter(item => item.kind === 'sign' && !item.routeHint);
  const text = publicSigns
    .map(item => `${item.mapLabel ?? ''} ${item.text ?? ''}`)
    .join(' ')
    .toLowerCase();
  assert.doesNotMatch(text, /shallow.water cut|lantern islet|brooklet/);
  assert.match(raw.landmarks.find(item => item.id === 'shallow-cut-guide').text, /Brooklet/);
});
