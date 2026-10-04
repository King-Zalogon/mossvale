// Real PostgreSQL transactions/RLS/concurrency, against an explicitly selected disposable container.
// TEST_POSTGRES_CONTAINER=mossvale-feedback-postgres npm run test:account-db
import {execFile, execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';

const container = process.env.TEST_POSTGRES_CONTAINER;
if (!container) throw new Error('Set TEST_POSTGRES_CONTAINER to a disposable PostgreSQL container; this test recreates its mossvale_account_test database.');
const docker = ['--host=unix:///var/run/docker.sock', 'exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'];
const raw = sql => execFileSync('docker', [...docker, '-At'], {input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']});
raw('drop database if exists mossvale_account_test; create database mossvale_account_test;');
const args = [...docker, '-d', 'mossvale_account_test', '-At'];
const sql = statement => execFileSync('docker', args, {input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']}).trim();
const value = statement =>
  sql(statement)
    .split('\n')
    .filter(line => !['BEGIN', 'SET', 'COMMIT'].includes(line))
    .at(-1);
const user = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const as = (n, statement, role = 'authenticated') => `begin; set local role ${role}; set local "request.jwt.claim.sub" = '${user(n)}'; ${statement}; commit;`;
const rejected = (statement, match) =>
  assert.throws(
    () => sql(statement),
    e => match.test(String(e.stderr)),
  );
sql(readFileSync(new URL('./fixtures/account/portal.sql', import.meta.url), 'utf8'));
const migration = readFileSync(new URL('../supabase/migrations/20261003_account_feedback.sql', import.meta.url), 'utf8');
sql(migration);
sql(migration); // safe reapplication
const mcpMigration = readFileSync(new URL('../supabase/migrations/20261004_feedback_mcp.sql', import.meta.url), 'utf8');
sql(mcpMigration);
sql(mcpMigration); // safe reapplication
sql(`update public.portal_profiles set role = 'owner' where user_id = '${user(1)}'`);
const submit = (id, message = 'Improve trails') => `select public.mossvale_submit_feedback('${id}', '${message}', 'mossvale', 'meadow', 'test')`;
const id = randomUUID();
sql(as(1, submit(id)));
sql(as(1, submit(id)));
assert.equal(sql('select count(*) from public.mossvale_feedback'), '1', 'same request retry does not duplicate');

const mcpHash = 'a'.repeat(64);
const createdTokenOutput = sql(as(1, `select public.mossvale_mcp_create_token('${mcpHash}', 'Codex')`));
const createdMcpToken = JSON.parse(createdTokenOutput.split('\n').find(line => line.startsWith('{')));
assert.match(createdMcpToken.id, /^[0-9a-f-]{36}$/i);
assert.equal(value(`set role anon; select public.mossvale_mcp_authorize('${mcpHash}')`), 't', 'active owner token authorizes MCP access');
assert.equal(value(`set role anon; select count(*) from public.mossvale_mcp_feedback_queue('${mcpHash}', 51, null, null)`), '1');
assert.equal(value(as(1, 'select count(*) from public.mossvale_mcp_list_tokens()')), '1');
assert.equal(sql(`select token_hash from public.mossvale_mcp_tokens where id = '${createdMcpToken.id}'`), mcpHash, 'database stores the token digest only');
rejected(as(2, `select public.mossvale_mcp_create_token('${'b'.repeat(64)}', 'Member')`), /owner_required/);
rejected(`set role anon; select * from public.mossvale_mcp_feedback_queue('${'c'.repeat(64)}', 51, null, null)`, /mcp_unauthorized/);
rejected(`set role anon; select count(*) from public.mossvale_mcp_tokens`, /permission denied/);
assert.equal(value(as(1, `select public.mossvale_mcp_revoke_token('${createdMcpToken.id}')`)), 't');
assert.equal(value(`set role anon; select public.mossvale_mcp_authorize('${mcpHash}')`), 'f', 'revoked tokens stop authorizing MCP access');
rejected(`set role anon; select * from public.mossvale_mcp_feedback_queue('${mcpHash}', 51, null, null)`, /mcp_unauthorized/);

rejected(as(1, submit(id, 'Changed message')), /request_conflict/);
assert.equal(sql(as(2, 'select count(*) from public.mossvale_feedback')).split('\n').includes('0'), true, 'other user cannot read the first message');
rejected(as(3, submit(randomUUID())), /access_denied/);
rejected(`set role anon; ${submit(randomUUID())}`, /permission denied/);
rejected(
  as(1, "insert into public.mossvale_feedback(user_id,request_id,message,pack_id) values ('" + user(2) + "',gen_random_uuid(),'forged','mossvale')"),
  /permission denied/,
);
rejected(as(1, `select public.mossvale_submit_feedback('${randomUUID()}',repeat('a',2001),'mossvale')`), /invalid_feedback/);
// The counter is database-authoritative even with simultaneous calls from several devices.
const exec = promisify(execFile);
const attempts = await Promise.all(
  Array.from({length: 14}, async () => {
    try {
      await exec('docker', [...args, '-c', as(1, submit(randomUUID()))]);
      return true;
    } catch (error) {
      assert.match(error.stderr, /daily_limit/);
      return false;
    }
  }),
);
assert.equal(attempts.filter(Boolean).length, 9);
assert.equal(sql(`select count(*) from public.mossvale_feedback where user_id = '${user(1)}'`), '10');
assert.equal(sql(as(1, "select public.mossvale_feedback_status()->>'remaining'")).split('\n').includes('0'), true);
sql(as(2, submit(randomUUID())));
// Timestamp belongs to the database and yesterday's messages do not consume today's quota.
sql(`update public.mossvale_feedback set created_at = now() - interval '2 days' where user_id = '${user(1)}'`);
sql(as(1, submit(randomUUID())));
const backup = JSON.stringify({kind: 'mossvale-save-backup', format: 1, save: {version: 4, coins: 2}});
const store = (revision, pack = 'mossvale') => `select public.mossvale_store_save('${pack}','${backup}'::jsonb,${revision})`;
sql(as(1, store(0)));
sql(as(1, store(1)));
rejected(as(1, store(1)), /save_conflict/);
rejected(as(1, store(0, 'other-pack')), /invalid_save/);
assert.equal(sql(as(2, 'select count(*) from public.mossvale_account_saves')).split('\n').includes('0'), true);
rejected(as(2, 'update public.mossvale_account_saves set revision = 100'), /permission denied/);
sql(as(2, store(0)));
assert.equal(sql('select count(*) from public.mossvale_account_saves'), '2');
const lease1 = randomUUID(),
  lease2 = randomUUID();
assert.equal(sql(`set role service_role; select public.mossvale_review_lock('${lease1}')`).split('\n').at(-1), 't');
assert.equal(sql(`set role service_role; select public.mossvale_review_lock('${lease2}')`).split('\n').at(-1), 'f');
rejected(as(1, `select public.mossvale_review_lock('${lease2}')`), /permission denied/);
assert.equal(sql(`set role service_role; select public.mossvale_review_lock('${lease1}',true)`).split('\n').at(-1), 't');
assert.equal(sql(`set role service_role; select public.mossvale_review_lock('${lease2}')`).split('\n').at(-1), 't');
console.log('ok PostgreSQL identity/RLS, quotas, account saves, owner-bound MCP tokens/queue/revocation and review leases');
