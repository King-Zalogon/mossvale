import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {launch, selectIntegration, listenLocal, DEFAULT_LOCAL_PORTS, launcherError} from '../scripts/local-integration.mjs';
import {EventEmitter} from 'node:events';

const git = (cwd, ...args) => execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
function fixture(t, integration = true) {
  const root = mkdtempSync(join(tmpdir(), 'mossvale-launcher-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const repo = join(root, 'repo'),
    remote = join(root, 'remote.git');
  mkdirSync(repo);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.name', 'Test');
  git(repo, 'config', 'user.email', 'test@example.invalid');
  mkdirSync(join(repo, 'dist'));
  writeFileSync(join(repo, 'dist/index.html'), 'main game');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'main');
  git(root, 'init', '--bare', remote);
  git(repo, 'remote', 'add', 'origin', remote);
  git(repo, 'push', 'origin', 'main');
  if (integration) {
    git(repo, 'checkout', '-b', 'integration');
    writeFileSync(join(repo, 'dist/index.html'), 'integration game');
    git(repo, 'commit', '-am', 'integration');
    git(repo, 'push', 'origin', 'integration');
    git(repo, 'checkout', 'main');
  }
  return repo;
}

test('another branch serves fresh integration without changing branch or uncommitted files', t => {
  const repo = fixture(t);
  writeFileSync(join(repo, 'dist/index.html'), 'my unfinished main work');
  const target = selectIntegration(repo);
  assert.notEqual(target.directory, repo);
  assert.equal(git(repo, 'branch', '--show-current'), 'main');
  assert.match(git(repo, 'diff'), /my unfinished main work/);
  assert.equal(git(target.directory, 'show', 'HEAD:dist/index.html'), 'integration game');
  assert.equal(git(target.directory, 'branch', '--show-current'), '');
  // A newer remote commit is picked up on the next launch.
  git(repo, 'restore', 'dist/index.html');
  git(repo, 'checkout', 'integration');
  writeFileSync(join(repo, 'dist/index.html'), 'new integration game');
  git(repo, 'commit', '-am', 'new integration');
  git(repo, 'push', 'origin', 'integration');
  git(repo, 'checkout', 'main');
  assert.equal(selectIntegration(repo).directory, target.directory);
  assert.equal(git(target.directory, 'show', 'HEAD:dist/index.html'), 'new integration game');
});

test('current integration working copy is used without a fetch or losing edits', t => {
  const repo = fixture(t);
  git(repo, 'checkout', 'integration');
  git(repo, 'remote', 'remove', 'origin');
  writeFileSync(join(repo, 'dist/index.html'), 'local integration edit');
  assert.equal(selectIntegration(repo).directory, repo);
  assert.match(git(repo, 'diff'), /local integration edit/);
});

test('missing remote integration and dirty cached worktree stop without fallback', t => {
  const missing = fixture(t, false);
  assert.throws(() => selectIntegration(missing), /Cannot fetch origin\/integration/);
  assert.equal(git(missing, 'branch', '--show-current'), 'main');
  const repo = fixture(t);
  const target = selectIntegration(repo);
  writeFileSync(join(target.directory, 'dist/index.html'), 'cache edit');
  assert.throws(() => selectIntegration(repo), /local changes/);
  assert.equal(git(repo, 'branch', '--show-current'), 'main');
});

test('loopback server serves integration, rejects private paths and unsupported writes, and closes cleanly', async t => {
  const repo = fixture(t);
  const server = await launch({cwd: repo, port: 0, browser: false});
  t.after(() => new Promise(resolve => server.close(resolve)));
  assert.equal(server.address().address, '127.0.0.1');
  const url = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(url);
  assert.equal(await response.text(), 'integration game');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const versionResponse = await fetch(`${url}/version.json`);
  assert.equal(versionResponse.status, 200);
  assert.equal(versionResponse.headers.get('cache-control'), 'no-store');
  const version = await versionResponse.json();
  const integrationCommit = git(selectIntegration(repo).directory, 'rev-parse', 'HEAD');
  assert.deepEqual(
    {short: version.short, branch: version.branch, dirty: version.dirty},
    {short: integrationCommit.slice(0, 7), branch: 'integration', dirty: false},
  );
  assert.equal(version.commit, integrationCommit);
  assert.equal((await fetch(`${url}/version.json`, {method: 'HEAD'})).status, 200);
  for (const path of ['/.git/config', '/..%2f.env.local', '/%2e%2e%5c.env.local', '/%00']) assert.equal((await fetch(url + path)).status, 403);
  assert.equal((await fetch(url, {method: 'POST'})).status, 405);
  assert.equal((await fetch(url + '/absent.png')).status, 404);
  assert.equal(await (await fetch(url, {method: 'HEAD'})).text(), '');
  if (process.platform !== 'win32') {
    const target = selectIntegration(repo);
    writeFileSync(join(repo, 'private.json'), '{"private":true}');
    symlinkSync(join(repo, 'private.json'), join(target.directory, 'dist/private.json'));
    assert.equal((await fetch(url + '/private.json')).status, 403);
  }
});

test('occupied port is refused before updating cached files', async t => {
  const repo = fixture(t);
  const server = await launch({cwd: repo, port: 0, browser: false});
  t.after(() => new Promise(resolve => server.close(resolve)));
  git(repo, 'remote', 'remove', 'origin');
  await assert.rejects(launch({cwd: repo, port: server.address().port, browser: false}), {code: 'EADDRINUSE'});
});

test('a second port cannot update an integration snapshot while another launcher serves it', async t => {
  const repo = fixture(t);
  const server = await launch({cwd: repo, port: 0, browser: false});
  t.after(() => new Promise(resolve => server.close(resolve)));
  await assert.rejects(launch({cwd: repo, port: 0, browser: false}), /Another launcher owns/);
});

function simulatedBinding(codeForPort) {
  const server = new EventEmitter();
  server.attempts = [];
  server.listen = (port, address) => {
    server.attempts.push({port, address});
    queueMicrotask(() => {
      const code = codeForPort(port);
      if (code) server.emit('error', Object.assign(new Error(code), {code}));
      else {
        server.port = port;
        server.emit('listening');
      }
    });
  };
  server.address = () => ({port: server.port});
  return server;
}

test('default launcher skips permission-denied and occupied ports while remaining on loopback', async () => {
  const server = simulatedBinding(port => (port === 8080 ? 'EACCES' : port === 8081 ? 'EADDRINUSE' : null));
  assert.equal(await listenLocal(server), 5173);
  assert.deepEqual(
    server.attempts,
    [8080, 8081, 5173].map(port => ({port, address: '127.0.0.1'})),
  );
  assert.equal(server.listenerCount('error'), 0);
  assert.equal(server.listenerCount('listening'), 0);
});

test('explicit port denial stays on that port and gives an actionable message', async () => {
  const server = simulatedBinding(() => 'EACCES');
  await assert.rejects(listenLocal(server, 8080), {code: 'EACCES'});
  assert.deepEqual(
    server.attempts.map(a => a.port),
    [8080],
  );
  assert.match(launcherError({code: 'EACCES'}), /--port=5173/);
});

test('exhausted ports fail clearly and unexpected network errors are not retried', async () => {
  const denied = simulatedBinding(() => 'EACCES');
  await assert.rejects(listenLocal(denied), /No local test port is available/);
  assert.deepEqual(
    denied.attempts.map(a => a.port),
    DEFAULT_LOCAL_PORTS,
  );
  const broken = simulatedBinding(() => 'ENETDOWN');
  await assert.rejects(listenLocal(broken), {code: 'ENETDOWN'});
  assert.equal(broken.attempts.length, 1);
});
