// Production Next routes against a local Supabase HTTP fixture, never a live project.
// Run after npm run build: npm run test:account-api
import {spawn} from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';

const userId = '00000000-0000-4000-8000-000000000001';
let hasAccess = true,
  isOwner = true;
const calls = [];
const mock = http
  .createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw && JSON.parse(raw);
    calls.push({url: req.url, method: req.method, body});
    res.setHeader('Content-Type', 'application/json');
    const path = new URL(req.url, 'http://fixture').pathname;
    if (path === '/auth/v1/user')
      return res.end(
        JSON.stringify({id: userId, email: 'fixture@example.test', aud: 'authenticated', role: 'authenticated', created_at: new Date().toISOString()}),
      );
    if (path === '/rest/v1/applications') return res.end(JSON.stringify(hasAccess ? [{id: randomUUID()}] : []));
    if (path === '/rest/v1/portal_profiles') return res.end(JSON.stringify([{role: isOwner ? 'owner' : 'member'}]));
    if (path === '/rest/v1/rpc/mossvale_feedback_status') return res.end(JSON.stringify({remaining: 10, dailyLimit: 10, maxCharacters: 2000}));
    if (path === '/rest/v1/rpc/mossvale_submit_feedback') {
      if (body.p_message === 'quota') {
        res.statusCode = 400;
        return res.end(JSON.stringify({code: 'P0001', message: 'daily_limit'}));
      }
      return res.end(JSON.stringify({id: randomUUID(), createdAt: new Date().toISOString(), remaining: 9}));
    }
    if (path === '/rest/v1/mossvale_feedback') return res.end(JSON.stringify([]));
    if (path === '/rest/v1/mossvale_account_saves') return res.end(JSON.stringify([]));
    if (path === '/rest/v1/rpc/mossvale_store_save') return res.end(JSON.stringify({revision: 1, updatedAt: new Date().toISOString()}));
    res.writeHead(404).end('{}');
  })
  .listen(0, '127.0.0.1');
await once(mock, 'listening');
const reserve = http.createServer().listen(0, '127.0.0.1');
await once(reserve, 'listening');
const port = reserve.address().port;
await new Promise(resolve => reserve.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--port', String(port), '--hostname', '127.0.0.1'], {
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${mock.address().port}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-anon-key',
    MOSSVALE_GATE_SECRET: 'fixture-gate-secret-at-least-32-characters',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
// Don't print server payloads; failures are reported by assertions.
next.stdout.resume();
next.stderr.resume();
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${b64({alg: 'HS256', typ: 'JWT'})}.${b64({sub: userId, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated'})}.fixture-signature`;
const cookie =
  'sb-127-auth-token=base64-' +
  b64({
    access_token: token,
    refresh_token: 'fixture-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: 'bearer',
    user: {id: userId},
  });
const call = (path, body, headers = {}) =>
  fetch(origin + path, {
    headers: {Cookie: cookie, ...(body ? {'Content-Type': 'application/json', Origin: origin} : {}), ...headers},
    ...(body ? {method: 'POST', body: JSON.stringify(body)} : {}),
  });
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(origin + '/api/feedback');
      ready = true;
      break;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  assert.ok(ready, 'production server starts');
  assert.equal((await fetch(origin + '/api/feedback')).status, 401, 'anonymous requests rejected');
  const status = await call('/api/feedback');
  assert.equal(status.status, 200);
  assert.equal(status.headers.get('Cache-Control'), 'private, no-store');
  assert.equal((await status.json()).accountId, userId);
  const input = {
    accountId: userId,
    requestId: randomUUID(),
    message: 'Improve keyboard focus',
    packId: 'mossvale',
    mapId: 'meadow',
    userId: 'forged',
    createdAt: 'forged',
  };
  assert.equal((await call('/api/feedback', input, {Origin: 'https://other.example'})).status, 403);
  assert.equal((await call('/api/feedback', {...input, accountId: randomUUID()})).status, 401);
  assert.equal((await call('/api/feedback', {...input, message: 'a'.repeat(2001)})).status, 400);
  assert.equal((await call('/api/feedback', input)).status, 201);
  const submission = calls.findLast(c => c.url.includes('mossvale_submit_feedback'));
  assert.equal('userId' in submission.body, false);
  assert.equal('createdAt' in submission.body, false);
  assert.equal(submission.body.p_message, input.message);
  assert.equal((await call('/api/feedback', {...input, message: 'quota'})).status, 429);
  hasAccess = false;
  assert.equal((await call('/api/feedback')).status, 403);
  hasAccess = true;
  isOwner = false;
  assert.equal((await call('/api/feedback-review')).status, 403);
  isOwner = true;
  assert.equal((await call('/api/feedback-review')).status, 200);
  const checkpoint = {accountId: userId, packId: 'mossvale', revision: 0, backup: {kind: 'mossvale-save-backup', format: 1, save: {version: 4}}};
  assert.equal((await call('/api/account-save', checkpoint)).status, 200);
  assert.equal((await call('/api/account-save?pack=mossvale')).status, 200);
  assert.ok(
    calls.some(c => c.url.includes('mossvale_account_saves') && c.url.includes('user_id=eq.' + userId)),
    'server scopes checkpoint reads to verified user',
  );
  console.log('ok production APIs: verified account/app grants, CSRF, spoofed identity/time, limits, owner review and scoped checkpoint');
} finally {
  next.kill('SIGTERM');
  mock.close();
}
