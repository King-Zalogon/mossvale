import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {installLauncher, installDirectory} from '../scripts/install-local-launcher.mjs';

const git = (cwd, ...args) => execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
function setup(t) {
  const root = mkdtempSync(join(tmpdir(), 'mossvale-persistent-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const repository = join(root, 'repo with spaces'),
    directory = join(root, 'installed with spaces');
  mkdirSync(repository);
  git(repository, 'init', '-b', 'main');
  git(repository, 'config', 'user.name', 'Test');
  git(repository, 'config', 'user.email', 'test@example.invalid');
  mkdirSync(join(repository, 'dist'));
  writeFileSync(join(repository, 'dist/index.html'), 'main');
  git(repository, 'add', '.');
  git(repository, 'commit', '-m', 'main');
  git(root, 'init', '--bare', join(root, 'remote.git'));
  git(repository, 'remote', 'add', 'origin', join(root, 'remote.git'));
  git(repository, 'checkout', '-b', 'integration');
  writeFileSync(join(repository, 'dist/index.html'), 'persistent integration');
  writeFileSync(join(repository, 'Test Integration.cmd'), 'branch-local launcher');
  git(repository, 'add', '.');
  git(repository, 'commit', '-m', 'integration');
  git(repository, 'push', 'origin', 'integration');
  return {repository, directory};
}

test('default installation folder is outside the checkout in per-user application data', () => {
  assert.equal(installDirectory('win32', {LOCALAPPDATA: '/local-app-data'}, '/home'), join('/local-app-data', 'Mossvale', 'LocalTesting'));
  assert.equal(installDirectory('darwin', {}, '/home'), join('/home', 'Library', 'Application Support', 'Mossvale', 'LocalTesting'));
  assert.equal(installDirectory('linux', {XDG_DATA_HOME: '/xdg'}, '/home'), join('/xdg', 'mossvale', 'local-testing'));
});

test('installed command includes all dependencies and repository configuration, and can be reinstalled', t => {
  const fixture = setup(t);
  const result = installLauncher(fixture);
  assert.equal(result.directory, fixture.directory);
  const config = JSON.parse(readFileSync(join(fixture.directory, 'launcher-config.json')));
  assert.equal(config.repository, fixture.repository);
  for (const name of ['local-integration.mjs', 'run-persistent-launcher.mjs', 'Test Integration.cmd', 'test-integration.sh'])
    assert.ok(existsSync(join(fixture.directory, name)));
  assert.match(readFileSync(join(fixture.directory, 'Test Integration.cmd'), 'utf8'), /%~dp0run-persistent-launcher\.mjs/);
  installLauncher(fixture);
});

test('refuses branch-local installation and unrelated existing files without modifying them', t => {
  const fixture = setup(t);
  assert.throws(() => installLauncher({...fixture, directory: join(fixture.repository, 'persistent')}), /outside the Git checkout/);
  assert.equal(existsSync(join(fixture.repository, 'persistent')), false);
  mkdirSync(fixture.directory);
  writeFileSync(join(fixture.directory, 'personal.txt'), 'keep');
  assert.throws(() => installLauncher(fixture), /unrelated files/);
  assert.equal(readFileSync(join(fixture.directory, 'personal.txt'), 'utf8'), 'keep');
});

test('installed runner serves remote integration after switching to a branch without launcher files', async t => {
  const fixture = setup(t);
  installLauncher(fixture);
  git(fixture.repository, 'checkout', 'main');
  assert.equal(existsSync(join(fixture.repository, 'Test Integration.cmd')), false);
  writeFileSync(join(fixture.repository, 'uncommitted.txt'), 'keep my work');
  const reservation = createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, [join(fixture.directory, 'run-persistent-launcher.mjs'), '--no-open', `--port=${port}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = new Promise(resolve => child.once('exit', resolve));
      child.kill('SIGTERM');
      await closed;
    }
  });
  let output = '';
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Persistent launcher did not start: ' + output)), 15000);
    child.stdout.on('data', data => {
      output += data;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+\//);
      if (match) {
        clearTimeout(timeout);
        resolve(match[0]);
      }
    });
    child.stderr.on('data', data => {
      output += data;
    });
    child.once('error', error => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Runner exited ${code}: ${output}`));
    });
  });
  assert.equal(await (await fetch(url)).text(), 'persistent integration');
  assert.equal(git(fixture.repository, 'branch', '--show-current'), 'main');
  assert.equal(readFileSync(join(fixture.repository, 'uncommitted.txt'), 'utf8'), 'keep my work');
});
