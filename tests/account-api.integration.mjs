// Production Next routes against a local Supabase HTTP fixture, never a live project.
// Run after npm run build: npm run test:account-api
import {spawn} from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createHash, randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const userId = '00000000-0000-4000-8000-000000000001';
let hasAccess = true,
  isOwner = true;
const calls = [];
const mcpToken = `mv_mcp_v1_${'A'.repeat(43)}`;
const mcpTokenHash = createHash('sha256').update(mcpToken).digest('hex');
const mcpRows = [
  {
    id: '00000000-0000-4000-8000-000000000011',
    message: 'Improve the wetland path',
    pack_id: 'mossvale',
    map_id: 'reedfen-wetlands',
    build: 'fixture-build',
    created_at: '2026-10-01T00:00:00.000000+00:00',
    review_status: 'new',
  },
  {
    id: '00000000-0000-4000-8000-000000000012',
    message: 'Make mobile controls easier to reach',
    pack_id: 'mossvale',
    map_id: 'reedfen-wetlands',
    build: 'fixture-build',
    created_at: '2026-10-02T00:00:00.000000+00:00',
    review_status: 'new',
  },
];
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
    if (path === '/rest/v1/rpc/mossvale_mcp_create_token')
      return res.end(JSON.stringify({id: '00000000-0000-4000-8000-000000000021', label: body.p_label, createdAt: new Date().toISOString()}));
    if (path === '/rest/v1/rpc/mossvale_mcp_revoke_token') return res.end('true');
    if (path === '/rest/v1/rpc/mossvale_mcp_authorize') return res.end(JSON.stringify(isOwner && body.p_token_hash === mcpTokenHash));
    if (path === '/rest/v1/rpc/mossvale_mcp_feedback_queue') {
      const after = body.p_cursor_created_at ? Date.parse(body.p_cursor_created_at) : -Infinity;
      const afterId = body.p_cursor_id ?? '';
      const rows = mcpRows
        .filter(row => Date.parse(row.created_at) > after || (Date.parse(row.created_at) === after && row.id > afterId))
        .slice(0, body.p_limit);
      return res.end(JSON.stringify(rows));
    }
    if (path === '/rest/v1/rpc/mossvale_mcp_feedback_list') {
      const after = body.p_cursor_created_at ? Date.parse(body.p_cursor_created_at) : -Infinity;
      const afterId = body.p_cursor_id ?? '';
      const rows = mcpRows
        .filter(row => Date.parse(row.created_at) > after || (Date.parse(row.created_at) === after && row.id > afterId))
        .filter(row => !body.p_review_status || row.review_status === body.p_review_status)
        .filter(row => !body.p_map_id || row.map_id === body.p_map_id)
        .filter(row => !body.p_created_after || Date.parse(row.created_at) >= Date.parse(body.p_created_after))
        .filter(row => !body.p_created_before || Date.parse(row.created_at) <= Date.parse(body.p_created_before))
        .slice(0, body.p_limit);
      return res.end(JSON.stringify(rows));
    }
    if (path === '/rest/v1/rpc/mossvale_mcp_feedback_get') {
      const row = mcpRows.find(item => item.id === body.p_feedback_id);
      return res.end(
        JSON.stringify(
          row
            ? [
                {
                  ...row,
                  status_changed_at: row.review_status === 'new' ? null : '2026-10-05T20:00:00.000000+00:00',
                  status_changed_by: row.review_status === 'new' ? null : 'Codex',
                },
              ]
            : [],
        ),
      );
    }
    if (path === '/rest/v1/rpc/mossvale_mcp_feedback_set_status') {
      const row = mcpRows.find(item => item.id === body.p_feedback_id);
      if (!row) return res.end(JSON.stringify([]));
      row.review_status = body.p_review_status;
      return res.end(JSON.stringify([{id: row.id, review_status: row.review_status, changed_at: '2026-10-05T20:00:00.000000+00:00', changed_by: 'Codex'}]));
    }
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
const mcpCall = (message, token = mcpToken) =>
  fetch(origin + '/api/mcp', {
    method: 'POST',
    headers: {
      ...(token ? {Authorization: `Bearer ${token}`} : {}),
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
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

  const issued = await call('/api/mcp-tokens', {label: 'Codex'});
  assert.equal(issued.status, 200, 'owner can issue a per-client MCP token');
  const issuedToken = await issued.json();
  assert.match(issuedToken.token, /^mv_mcp_v1_[A-Za-z0-9_-]{43}$/u);
  const storedMcpToken = calls.findLast(c => c.url.includes('mossvale_mcp_create_token'));
  assert.equal(storedMcpToken.body.p_token_hash, createHash('sha256').update(issuedToken.token).digest('hex'));
  assert.equal(JSON.stringify(storedMcpToken.body).includes(issuedToken.token), false, 'plaintext MCP token is never sent to Supabase');

  isOwner = false;
  assert.equal((await call('/api/mcp-tokens', {label: 'Claude Code'})).status, 403, 'non-owners cannot issue MCP tokens');
  assert.equal(
    (
      await mcpCall({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {protocolVersion: '2025-03-26', capabilities: {}, clientInfo: {name: 'test', version: '1'}},
      })
    ).status,
    401,
    'non-owner tokens cannot connect to MCP',
  );
  isOwner = true;

  assert.equal(
    (
      await mcpCall(
        {jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-03-26', capabilities: {}, clientInfo: {name: 'test', version: '1'}}},
        null,
      )
    ).status,
    401,
    'anonymous MCP requests are rejected',
  );
  assert.equal(
    (
      await mcpCall(
        {jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-03-26', capabilities: {}, clientInfo: {name: 'test', version: '1'}}},
        'mv_mcp_v1_' + 'B'.repeat(43),
      )
    ).status,
    401,
    'unknown MCP tokens are rejected',
  );
  const initialize = await mcpCall({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {protocolVersion: '2025-03-26', capabilities: {}, clientInfo: {name: 'test-client', version: '1'}},
  });
  assert.equal(initialize.status, 200, 'authorized stateless MCP initialization succeeds');
  assert.equal((await initialize.json()).result.serverInfo.name, 'mossvale-feedback');
  const list = await mcpCall({jsonrpc: '2.0', id: 2, method: 'tools/list', params: {}});
  assert.equal(list.status, 200);
  const availableTools = (await list.json()).result.tools.map(tool => tool.name);
  assert.ok(availableTools.includes('list_pending_feedback'));
  assert.ok(availableTools.includes('list_feedback'));
  assert.ok(availableTools.includes('get_feedback'));
  assert.ok(availableTools.includes('update_feedback_status'));
  const firstPageResponse = await mcpCall({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {name: 'list_pending_feedback', arguments: {limit: 1}},
  });
  assert.equal(firstPageResponse.status, 200);
  const firstPage = JSON.parse((await firstPageResponse.json()).result.content[0].text);
  assert.equal(firstPage.feedback[0].message, mcpRows[0].message);
  assert.ok(firstPage.nextCursor, 'MCP result returns an opaque next-page cursor');
  assert.equal('userId' in firstPage.feedback[0], false);
  assert.equal('email' in firstPage.feedback[0], false);
  const secondPageResponse = await mcpCall({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {name: 'list_pending_feedback', arguments: {limit: 1, cursor: firstPage.nextCursor}},
  });
  const secondPage = JSON.parse((await secondPageResponse.json()).result.content[0].text);
  assert.equal(secondPage.feedback[0].message, mcpRows[1].message);
  assert.equal(secondPage.nextCursor, null);

  const filteredResponse = await mcpCall({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {name: 'list_feedback', arguments: {limit: 10, reviewStatus: 'new', mapId: 'reedfen-wetlands'}},
  });
  const filtered = JSON.parse((await filteredResponse.json()).result.content[0].text);
  assert.equal(filtered.feedback.length, 2, 'bounded list supports status/map filters');
  assert.equal(filtered.feedback[0].reviewStatus, 'new');
  assert.equal('userId' in filtered.feedback[0], false);
  const detailResponse = await mcpCall({
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: {name: 'get_feedback', arguments: {feedbackId: mcpRows[0].id}},
  });
  const detail = JSON.parse((await detailResponse.json()).result.content[0].text).feedback;
  assert.equal(detail.message, 'Improve the wetland path');
  assert.equal('userId' in detail, false);
  const beforeStatusChange = {...mcpRows[0]};
  const updateResponse = await mcpCall({
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: {name: 'update_feedback_status', arguments: {feedbackId: mcpRows[0].id, reviewStatus: 'accepted'}},
  });
  const updateResult = JSON.parse((await updateResponse.json()).result.content[0].text);
  assert.equal(updateResult.reviewStatus, 'accepted');
  assert.equal(updateResult.changedBy, 'Codex', 'status update identifies the verified client token label');
  assert.equal(mcpRows[0].message, beforeStatusChange.message, 'status tool preserves original feedback text');
  const updateCall = calls.findLast(c => c.url.includes('mossvale_mcp_feedback_set_status'));
  assert.deepEqual(Object.keys(updateCall.body).sort(), ['p_feedback_id', 'p_review_status', 'p_token_hash']);
  assert.equal(updateCall.body.p_review_status, 'accepted');
  const updatedDetail = await mcpCall({
    jsonrpc: '2.0',
    id: 8,
    method: 'tools/call',
    params: {name: 'get_feedback', arguments: {feedbackId: mcpRows[0].id}},
  });
  const auditDetail = JSON.parse((await updatedDetail.json()).result.content[0].text).feedback;
  assert.equal(auditDetail.statusChangedBy, 'Codex');
  assert.equal(auditDetail.statusChangedAt, '2026-10-05T20:00:00.000000+00:00');

  const mcpClient = new Client({name: 'mossvale-api-test', version: '1.0.0'}, {capabilities: {}});
  const mcpTransport = new StreamableHTTPClientTransport(new URL(`${origin}/api/mcp`), {
    requestInit: {headers: {Authorization: `Bearer ${mcpToken}`}},
  });
  await mcpClient.connect(mcpTransport);
  const clientTools = await mcpClient.listTools();
  assert.ok(
    clientTools.tools.some(tool => tool.name === 'list_feedback'),
    'standard MCP client discovers the feedback tool',
  );
  const clientPage = await mcpClient.callTool({name: 'list_feedback', arguments: {limit: 1, reviewStatus: 'accepted'}});
  assert.equal(JSON.parse(clientPage.content[0].text).feedback[0].id, mcpRows[0].id, 'standard MCP client reads through Streamable HTTP');
  await mcpClient.close();

  const revoke = await fetch(origin + '/api/mcp-tokens', {
    method: 'DELETE',
    headers: {Cookie: cookie, 'Content-Type': 'application/json', Origin: origin},
    body: JSON.stringify({id: issuedToken.id}),
  });
  assert.equal(revoke.status, 200, 'owner can revoke a client token');

  const checkpoint = {accountId: userId, packId: 'mossvale', revision: 0, backup: {kind: 'mossvale-save-backup', format: 1, save: {version: 4}}};
  assert.equal((await call('/api/account-save', checkpoint)).status, 200);
  assert.equal((await call('/api/account-save?pack=mossvale')).status, 200);
  assert.ok(
    calls.some(c => c.url.includes('mossvale_account_saves') && c.url.includes('user_id=eq.' + userId)),
    'server scopes checkpoint reads to verified user',
  );
  console.log(
    'ok production APIs: verified account/app grants, CSRF, feedback limits, owner review, token lifecycle, MCP auth/pagination and scoped checkpoint',
  );
} finally {
  next.kill('SIGTERM');
  mock.close();
}
