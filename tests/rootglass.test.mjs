import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {content, mapsById, rawMaps, rawPack} from './helpers.mjs';
import {companionCanUseRoute} from '../dist/src/domain/companion-routes.js';

const maps = new Map(rawMaps().map(map => [map.id, map]));

test('Rootglass generated map pair stays current, connected, safe, and art-described', () => {
  execFileSync('python3', ['scripts/gen-rootglass.py', '--check']);
  const pass = maps.get('frostveil-pass');
  const canopy = maps.get('rootglass-canopy');
  const hollow = maps.get('rootglass-hollow');
  assert.ok(pass && canopy && hollow);
  assert.equal(rawPack().contentVersion, 7);
  assert.equal(pass.exits.find(exit => exit.to.map === canopy.id).requires, undefined);
  assert.ok(canopy.exits.find(exit => exit.id === 'hollow-stair'));
  assert.ok(hollow.exits.some(exit => exit.to.map === canopy.id));
  assert.equal(
    companionCanUseRoute(
      canopy.exits.find(exit => exit.route)?.route,
      content.species.find(creature => creature.id === 'brooklet'),
    ),
    true,
  );
  assert.equal(
    companionCanUseRoute(
      canopy.exits.find(exit => exit.route)?.route,
      content.species.find(creature => creature.id === 'fernling'),
    ),
    false,
  );
  assert.equal(
    mapsById[canopy.id].preview,
    content.assets.findIndex(asset => asset.name === 'prop-rootglass-sentinel'),
  );

  const art = JSON.parse(readFileSync(new URL('../art/assets/source/landmarks/manifest.json', import.meta.url)));
  const newAssets = art.assets.filter(asset => asset.name.startsWith('prop-rootglass-'));
  assert.deepEqual(
    newAssets.map(asset => asset.name),
    ['prop-rootglass-hollow', 'prop-rootglass-sentinel'],
  );
  assert.equal(newAssets[0].creationMethod, 'hand-authored-vector');
  assert.ok(newAssets[0].sourceSvg.endsWith('.svg'));
  assert.match(newAssets[0].promptSummary, /hand-authored pixel-art/);
  assert.equal(newAssets[1].creationMethod, undefined);
  assert.equal(newAssets[1].sourceSvg, undefined);
  assert.match(newAssets[1].promptSummary, /Generated transparent pixel-art/);
});
