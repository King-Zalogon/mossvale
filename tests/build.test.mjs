import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {VERSION} from '../dist/src/save.js';
import {describeBuild} from '../dist/src/services/version.js';

test('the build copies the game and stamps the commit and save schema', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mossvale-build-'));
  try {
    execFileSync('node', ['scripts/build.mjs'], {
      env: {...process.env, BUILD_DIR: dir, GITHUB_SHA: 'abcdef0123456789abcdef0123456789abcdef01', GITHUB_REF_NAME: 'main'},
      stdio: 'pipe',
    });
    const info = JSON.parse(readFileSync(join(dir, 'version.json'), 'utf8'));
    assert.deepEqual([info.short, info.branch, info.saveSchema], ['abcdef0', 'main', VERSION]);
    assert.match(info.builtAt, /^\d{4}-\d\d-\d\dT/);
    for (const f of ['index.html', 'style.css', 'src/main.js', 'maps/index.json', 'sprite0.png']) assert.equal(existsSync(join(dir, f)), true, f);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test('the version label handles a missing stamp', () => {
  assert.equal(describeBuild(null), 'development build');
  assert.match(describeBuild({short: 'abcdef0', builtAt: '2026-10-01T10:00:00Z'}), /^build abcdef0 · 2026-10-01$/);
  assert.match(describeBuild({short: 'abcdef0', dirty: true, builtAt: '2026-10-01T10:00:00Z'}), /abcdef0\+/);
});
