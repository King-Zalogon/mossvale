import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {describeBuild} from '../dist/src/services/version.js';
import {localBuildInfo} from '../scripts/local-integration.mjs';
import {serveLocalGame} from '../scripts/local-game.mjs';

const git = (cwd, ...args) => execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();

test('menu build label identifies the short commit and dirty source without rendering unchecked metadata', () => {
  assert.equal(describeBuild(null), 'development build');
  assert.equal(describeBuild({short: 'abcdef0', builtAt: '2026-10-01T10:00:00Z'}), 'Build #abcdef0 · 2026-10-01');
  assert.equal(describeBuild({short: 'abcdef0', dirty: true, builtAt: 'invalid'}), 'Build #abcdef0+');
  assert.equal(describeBuild({short: '<img src=x onerror=alert(1)>', builtAt: '2026-10-01T10:00:00Z'}), 'development build');
});

test('ordinary local server exposes the running checkout commit and dirty state', async t => {
  const root = mkdtempSync(join(tmpdir(), 'mossvale-local-build-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  git(root, 'init', '-b', 'work');
  git(root, 'config', 'user.name', 'Build test');
  git(root, 'config', 'user.email', 'build@example.invalid');
  mkdirSync(join(root, 'dist'));
  writeFileSync(join(root, 'dist/index.html'), 'local');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'local source');
  const expected = git(root, 'rev-parse', 'HEAD');
  const {server} = await serveLocalGame({cwd: root, port: 0});
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const info = await (await fetch(`${url}/version.json`)).json();
  assert.equal(info.commit, expected);
  assert.equal(info.short, expected.slice(0, 7));
  assert.equal(info.branch, 'work');
  assert.equal(info.dirty, false);
  writeFileSync(join(root, 'dist/index.html'), 'edited');
  const updated = await (await fetch(`${url}/version.json`)).json();
  assert.equal(updated.commit, expected);
  assert.equal(updated.dirty, true);
  assert.equal(await (await fetch(url)).text(), 'edited');
});

test('source archives without Git metadata safely use the development label', async t => {
  const root = mkdtempSync(join(tmpdir(), 'mossvale-archive-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  mkdirSync(join(root, 'dist'));
  writeFileSync(join(root, 'dist/index.html'), 'archive');
  assert.equal(localBuildInfo(root), null);
  const {server} = await serveLocalGame({cwd: root, port: 0});
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/version.json`);
  assert.equal(response.status, 404);
});
