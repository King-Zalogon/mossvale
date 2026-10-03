import test from 'node:test';
import assert from 'node:assert/strict';
import {ApiError, apiFailure, databaseError, readJson, requireSameOrigin} from '../lib/account/http.js';
import {feedbackInput, saveInput} from '../lib/account/validation.js';
import {createAccountClient} from '../dist/src/services/account.js';

const valid = {
  message: ' More exploration, please. ',
  requestId: 'c68ac9ac-5906-4b08-8e31-79531a372f02',
  packId: 'mossvale',
  mapId: 'orchard-ruins',
  userId: 'forged-user',
  createdAt: 'forged-time',
};

test('feedback accepts Unicode and drops supplied identity/time', () => {
  const input = feedbackInput(valid);
  assert.equal(input.p_message, 'More exploration, please.');
  assert.equal(input.p_pack_id, 'mossvale');
  assert.equal('userId' in input, false);
  assert.equal('createdAt' in input, false);
  assert.equal(feedbackInput({...valid, message: '🌱'.repeat(2000)}).p_message.length, 4000);
  for (const message of ['', '  ', 'a'.repeat(2001), '🌱'.repeat(2001)]) assert.throws(() => feedbackInput({...valid, message}), ApiError);
  for (const patch of [{packId: '../x'}, {requestId: 'fake'}, {mapId: '<script>'}, {build: {secret: 'no'}}])
    assert.throws(() => feedbackInput({...valid, ...patch}), ApiError);
});

test('account saves keep legacy pack compatibility and require an explicit revision', () => {
  const backup = {kind: 'mossvale-save-backup', format: 1, save: {version: 4}};
  assert.equal(saveInput({packId: 'mossvale', backup, revision: 0}).p_revision, 0);
  assert.throws(() => saveInput({packId: 'other', backup, revision: 0}), ApiError);
  assert.throws(() => saveInput({packId: 'mossvale', backup, revision: -1}), ApiError);
  assert.throws(() => saveInput({packId: 'mossvale', backup, revision: '1'}), ApiError);
  assert.throws(() => saveInput({packId: 'mossvale', backup: {...backup, extra: 'x'.repeat(1000001)}, revision: 0}), ApiError);
});

test('cookie writes require same-origin and request JSON has a streaming size bound', async () => {
  const request = body =>
    new Request('https://game.example/api/feedback', {method: 'POST', headers: {Origin: 'https://game.example', 'Content-Type': 'application/json'}, body});
  requireSameOrigin(request('{}'));
  requireSameOrigin(
    new Request('http://internal:3000/api/feedback', {
      headers: {Origin: 'https://game.example', 'x-forwarded-host': 'game.example', 'x-forwarded-proto': 'https'},
    }),
  );
  assert.throws(
    () =>
      requireSameOrigin(
        new Request('http://internal/api/feedback', {
          headers: {Origin: 'https://other.example', 'x-forwarded-host': 'game.example', 'x-forwarded-proto': 'https'},
        }),
      ),
    ApiError,
  );
  assert.throws(() => requireSameOrigin(new Request('https://game.example/api/feedback', {headers: {Origin: 'https://other.example'}})), ApiError);
  assert.throws(() => requireSameOrigin(new Request('https://game.example/api/feedback')), ApiError);
  assert.deepEqual(await readJson(request('{"message":"hello"}'), 100), {message: 'hello'});
  await assert.rejects(readJson(request('x'.repeat(101)), 100), e => e.status === 413);
  await assert.rejects(readJson(request('{oops'), 100), e => e.status === 400);
  const failure = apiFailure(new Error('secret details'));
  assert.equal(failure.status, 503);
  assert.equal(failure.headers.get('Cache-Control'), 'private, no-store');
  assert.doesNotMatch(await failure.text(), /secret details/);
});

test('quota, revision and backend failures produce actionable errors without SQL leakage', () => {
  for (const code of ['PGRST202', 'PGRST205', '42P01', '42883']) {
    assert.throws(
      () => databaseError({code, message: 'internal secret'}),
      e => e.status === 503 && e.message.includes('database setup') && !e.message.includes('secret'),
    );
  }
  assert.throws(
    () => databaseError({message: 'daily_limit'}),
    e => e.status === 429,
  );
  assert.throws(
    () => databaseError({message: 'save_conflict'}),
    e => e.status === 409,
  );
  assert.throws(
    () => databaseError({message: 'database host password=secret'}),
    e => e.status === 503 && !e.message.includes('secret'),
  );
});

test('browser account client never supplies identity through credentials and preserves network failures', async () => {
  let options;
  const client = createAccountClient(async (_url, opts) => {
    options = opts;
    return Response.json({error: 'daily limit'}, {status: 429});
  });
  assert.deepEqual(await client.sendFeedback(valid), {ok: false, status: 429, error: 'daily limit'});
  assert.equal(options.credentials, 'same-origin');
  assert.equal(options.cache, 'no-store');
  const offline = createAccountClient(async () => {
    throw new Error('offline');
  });
  assert.equal((await offline.feedbackStatus()).ok, false);
});
