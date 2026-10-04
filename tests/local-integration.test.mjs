import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {launch, selectIntegration} from '../scripts/local-integration.mjs';

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
