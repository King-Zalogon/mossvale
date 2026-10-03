import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {packFileEntries, validatePackMetadata} from '../dist/src/domain/pack.js';
import {fetchAdventure} from '../dist/src/services/maps.js';

const mapsDir = fileURLToPath(new URL('../dist/maps/', import.meta.url));
const read = path => readFileSync(join(mapsDir, path));
const rawPack = JSON.parse(read('index.json'));

test('the shipped pack declares one canonical SHA-256 for every selected data file', () => {
  const entries = packFileEntries(rawPack);
  assert.deepEqual(
    entries.map(entry => entry.id),
    [
      'registry:main',
      'map:meadow',
      'map:amber-ridge',
      'map:frostveil-grove',
      'map:frostveil-pass',
      'map:reedfen-wetlands',
      'map:orchard-ruins',
      'map:stilt-isles',
      'map:stone-basin',
      'objectives:main',
      'story:main',
    ],
  );
  assert.deepEqual(validatePackMetadata(rawPack, {required: true}), []);
  for (const {id, path} of entries) assert.equal(rawPack.integrity.find(file => file.id === id).path, path);
});

test('the browser loader rejects unsupported requirements before requesting save-dependent content', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async url => {
    requests.push(String(url));
    const index = {...rawPack, requires: {...rawPack.requires, engineVersion: 999}};
    return new Response(JSON.stringify(index), {status: 200});
  };
  try {
    await assert.rejects(fetchAdventure('mock/'), /supports 1/);
    assert.deepEqual(requests, ['mock/index.json']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('the browser loader verifies the exact response bytes before returning the pack', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const path = String(url).slice('mock/'.length);
    let bytes = read(path);
    if (path === 'meadow.json') bytes = Buffer.concat([bytes, Buffer.from(' ')]);
    return new Response(bytes, {status: 200});
  };
  try {
    await assert.rejects(fetchAdventure('mock/'), /map:meadow.*SHA-256 integrity check/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a missing pack file reports its canonical identity and supports a fresh retry', async () => {
  const originalFetch = globalThis.fetch;
  let missing = true;
  globalThis.fetch = async url => {
    const path = String(url).slice('mock/'.length);
    if (path === 'meadow.json' && missing) return new Response('', {status: 404});
    return new Response(read(path), {status: 200});
  };
  try {
    await assert.rejects(fetchAdventure('mock/'), /map:meadow .*HTTP 404/);
    missing = false;
    const loaded = await fetchAdventure('mock/');
    assert.equal(loaded.maps.length, rawPack.maps.length);
    assert.equal(loaded.pack.id, rawPack.id);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
