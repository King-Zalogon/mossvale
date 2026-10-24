import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  ENGINE_VERSION,
  SAVE_SCHEMA_VERSION,
  SUPPORT,
  READABLE_SAVE_SCHEMAS,
  assessPackRequirements,
  checkLevel,
  classifySaveSchema,
} from '../dist/src/compatibility.js';
import {validatePackMetadata} from '../dist/src/domain/pack.js';
import {PackCompatibilityError, fetchAdventure} from '../dist/src/services/maps.js';
import {VERSION} from '../dist/src/save.js';
import {codec} from './helpers.mjs';

const manifest = () => JSON.parse(readFileSync(new URL('../dist/maps/index.json', import.meta.url), 'utf8'));
const withRequires = requires => ({...manifest(), requires});

test('the support window is explicit integers anchored to the shipped levels', () => {
  assert.deepEqual(SUPPORT.engineVersion, {min: ENGINE_VERSION, max: ENGINE_VERSION});
  assert.deepEqual(SUPPORT.saveSchema, {min: SAVE_SCHEMA_VERSION, max: SAVE_SCHEMA_VERSION});
  assert.equal(SAVE_SCHEMA_VERSION, VERSION);
  assert.equal(READABLE_SAVE_SCHEMAS.max, VERSION);
  assert.ok(Object.isFrozen(SUPPORT) && Object.isFrozen(SUPPORT.saveSchema));
});

test('the shipped manifest is compatible', () => {
  const result = assessPackRequirements(manifest());
  assert.deepEqual(result, {status: 'compatible', issues: []});
});

test('a pack that needs a newer game says to update the game', () => {
  const result = assessPackRequirements(withRequires({engineVersion: ENGINE_VERSION + 1, saveSchema: SAVE_SCHEMA_VERSION}));
  assert.equal(result.status, 'requires-newer-game');
  assert.equal(result.issues[0].field, 'requires.engineVersion');
  assert.match(result.issues[0].message, /update the game/);
});

test('a pack older than the window says to port it, not to edit numbers', () => {
  const support = {saveSchema: {min: 6, max: 7}};
  const result = assessPackRequirements(withRequires({engineVersion: 1, saveSchema: 5}), support);
  assert.equal(result.status, 'pack-too-old');
  assert.match(result.issues[0].message, /no longer supported/);
  assert.match(result.issues[0].message, /supports 6 to 7/);
});

test('a widened window accepts every level inside it and rejects both neighbours', () => {
  const support = {saveSchema: {min: 5, max: 7}};
  const status = saveSchema => assessPackRequirements(withRequires({engineVersion: 1, saveSchema}), support).status;
  assert.deepEqual([4, 5, 6, 7, 8].map(status), ['pack-too-old', 'compatible', 'compatible', 'compatible', 'requires-newer-game']);
});

test('missing, non-integer or non-positive levels are invalid, never coerced', () => {
  for (const value of [undefined, null, '5', 5.5, 0, -1, NaN, [5]]) {
    assert.equal(checkLevel('saveSchema', value).status, 'invalid', String(value));
    assert.equal(assessPackRequirements(withRequires({engineVersion: 1, saveSchema: value})).status, 'invalid');
  }
  for (const requires of [undefined, null, [], 'x']) assert.equal(assessPackRequirements({...manifest(), requires}).status, 'invalid');
  assert.equal(assessPackRequirements({...manifest(), format: 2}).status, 'requires-newer-game');
  assert.equal(assessPackRequirements({...manifest(), format: 0}).status, 'invalid');
});

test('an unusable declaration outranks a newer one, which outranks an older one', () => {
  const support = {saveSchema: {min: 5, max: 5}, engineVersion: {min: 2, max: 2}};
  assert.equal(assessPackRequirements(withRequires({engineVersion: 1, saveSchema: 9}), support).status, 'requires-newer-game');
  assert.equal(assessPackRequirements(withRequires({engineVersion: 1, saveSchema: 5}), support).status, 'pack-too-old');
  assert.equal(assessPackRequirements(withRequires({engineVersion: 'x', saveSchema: 9}), support).status, 'invalid');
});

test('validatePackMetadata reports the same verdicts with a field and an action', () => {
  const messages = validatePackMetadata(withRequires({engineVersion: 99, saveSchema: 99}), {required: true});
  assert.deepEqual(
    messages.map(text => text.split(':')[0]),
    ['pack requires.engineVersion', 'pack requires.saveSchema'],
  );
  for (const text of messages) (assert.match(text, /supports 1|supports 5/), assert.match(text, /update the game/));
  assert.deepEqual(validatePackMetadata(manifest(), {required: true}), []);
  // The pinned single-level options still mean "exactly this level".
  assert.equal(validatePackMetadata(withRequires({engineVersion: 1, saveSchema: 4}), {required: true, saveSchema: 5}).length, 1);
});

test('save schema classification never treats a newer save as recoverable', () => {
  assert.deepEqual(
    [0, 1, 4, 5, 6, 99, 5.5, '5', null].map(version => classifySaveSchema(version)),
    ['invalid', 'migrate', 'migrate', 'current', 'future', 'future', 'invalid', 'invalid', 'invalid'],
  );
  assert.equal(classifySaveSchema(7, 7), 'current');
  assert.equal(classifySaveSchema(7, 8), 'migrate');
});

test('the codec agrees with the classification and leaves a future save untouched', () => {
  const store = new Map();
  const storage = {getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)), removeItem: key => store.delete(key)};
  const future = JSON.stringify({version: VERSION + 1, coins: 3});
  store.set(codec.keys.v3, future);
  const loaded = codec.load(storage);
  assert.equal(loaded.status, 'future');
  assert.equal(loaded.writable, false);
  assert.equal(store.get(codec.keys.v3), future);
  assert.equal(store.has(codec.keys.backup), false);
  assert.equal(store.has(codec.keys.quarantine), false);
});

test('the loader rejects each unsupported level with its own explanation after reading only the manifest', async () => {
  const originalFetch = globalThis.fetch;
  const cases = [
    [{engineVersion: ENGINE_VERSION + 1, saveSchema: SAVE_SCHEMA_VERSION}, /requires.engineVersion: requires 2.*update the game/],
    [{engineVersion: ENGINE_VERSION, saveSchema: SAVE_SCHEMA_VERSION + 1}, /requires.saveSchema: requires 6.*update the game/],
    [{engineVersion: ENGINE_VERSION, saveSchema: SAVE_SCHEMA_VERSION - 1}, /requires.saveSchema: requires 4.*no longer supported/],
    [{engineVersion: ENGINE_VERSION, saveSchema: '5'}, /requires.saveSchema: requires "5".*positive integer/],
  ];
  try {
    for (const [requires, expected] of cases) {
      const requests = [];
      globalThis.fetch = async url => {
        requests.push(String(url));
        return new Response(JSON.stringify(withRequires(requires)), {status: 200});
      };
      await assert.rejects(fetchAdventure('mock/'), expected);
      assert.deepEqual(requests, ['mock/index.json']);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('every checked-in pack manifest is compatible at the current level', () => {
  for (const dir of ['tests/fixtures/packs/hearth', 'tests/fixtures/packs/bakery', 'tests/fixtures/packs/lantern-crossing']) {
    const index = JSON.parse(readFileSync(new URL(`../${dir}/index.json`, import.meta.url), 'utf8'));
    assert.equal(assessPackRequirements(index).status, 'compatible', dir);
  }
});

test('the loader raises a typed error carrying the verdict so the game can say whose version has to change (#283)', async () => {
  const originalFetch = globalThis.fetch;
  const cases = [
    [{engineVersion: ENGINE_VERSION + 1, saveSchema: SAVE_SCHEMA_VERSION}, 'requires-newer-game'],
    [{engineVersion: ENGINE_VERSION, saveSchema: SAVE_SCHEMA_VERSION - 1}, 'pack-too-old'],
    [{engineVersion: ENGINE_VERSION, saveSchema: '5'}, 'invalid'],
  ];
  try {
    for (const [requires, status] of cases) {
      globalThis.fetch = async () => new Response(JSON.stringify(withRequires(requires)), {status: 200});
      await assert.rejects(
        fetchAdventure('mock/'),
        error => error instanceof PackCompatibilityError && error.status === status && /Update the game/.test(error.message),
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
