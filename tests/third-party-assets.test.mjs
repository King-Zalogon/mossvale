import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assets} from '../dist/src/data/assets.js';

const registry = JSON.parse(readFileSync('art/assets/third-party/registry.json', 'utf8'));
const catalogue = JSON.parse(readFileSync('content/catalogue/catalogue.json', 'utf8'));
const map = JSON.parse(readFileSync('dist/maps/meadow.json', 'utf8'));

test('third-party package records its source, CC0 permissions, and limits', () => {
  const [pack] = registry.packages;
  assert.equal(pack.id, 'reactorcore-nature-surface');
  assert.equal(pack.license, 'CC0 1.0 Universal');
  assert.equal(pack.permissions.personalGameUse, 'permitted');
  assert.equal(pack.permissions.publicRepositoryRedistribution, 'permitted');
  assert.equal(pack.permissions.modifyAndAdapt, 'permitted');
  assert.equal(pack.permissions.attributionRequired, false);
  assert.ok(pack.limits.some(limit => /visual assets only/i.test(limit)));
  assert.equal(pack.assets.length, 27);
  for (const source of pack.assets) {
    assert.match(source.sourceSha256, /^[a-f0-9]{64}$/);
    const runtime = assets.find(asset => asset.name === source.name);
    assert.ok(runtime, `${source.name} is registered for runtime/catalogue use`);
    const fiche = catalogue.entries.find(entry => entry.id === `visual:${source.name}`);
    assert.ok(fiche, `${source.name} has a writer-catalogue fiche`);
    assert.match(fiche.details.style, /CC0 1\.0 Universal/);
    assert.match(fiche.details.compatibleUses, /not define|does not create/i);
  }
});

test('curated third-party nature props are present in the meadow map', () => {
  const placed = new Set(map.props.flatMap(group => group.at.map(() => group.sprite)));
  for (const name of ['tree-oak-round', 'tree-fir-slim', 'bush-woodland-low', 'plant-fern-frond']) {
    assert.ok(placed.has(name), `${name} is visibly used in the shipped map`);
    assert.equal(assets.find(asset => asset.name === name).required, true);
  }
});
