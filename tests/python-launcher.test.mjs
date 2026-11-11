import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {pythonCandidates} from '../scripts/run-python.mjs';

test('python launcher prefers the native command on each platform', () => {
  assert.deepEqual(pythonCandidates('win32'), [['python'], ['py', '-3'], ['python3']]);
  assert.deepEqual(pythonCandidates('linux'), [['python3'], ['python']]);
});

test('python launcher forwards a small script and its exit status', () => {
  const script = fileURLToPath(new URL('../scripts/run-python.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, '-c', 'print("launcher-ok")'], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /launcher-ok/);
});

test('python environment is pinned and diagnosed', async () => {
  const {environmentHint, pinnedPillow, venvPython} = await import('../scripts/run-python.mjs');
  assert.match(pinnedPillow(), /^\d+\.\d+\.\d+$/);
  assert.equal(venvPython('linux', '/nonexistent-root'), null);
  const hint = environmentHint('python3', ['-c', 'raise SystemExit(1)', '--']); // a command that cannot import PIL
  assert.match(hint ?? '', /npm run setup/);
});

test('a chunked art source can be unpacked with one command and matches its recorded SHA-256', async () => {
  const {createHash} = await import('node:crypto');
  const {mkdtempSync, readFileSync, rmSync} = await import('node:fs');
  const {tmpdir} = await import('node:os');
  const {join} = await import('node:path');
  const archive = JSON.parse(readFileSync(new URL('../art/characters/source-archive.json', import.meta.url), 'utf8'));
  const [source, record] = Object.entries(archive.sources).find(([, item]) => item.parts.length >= 1);
  const dir = mkdtempSync(join(tmpdir(), 'mossvale-unpack-'));
  try {
    const out = join(dir, 'source.png');
    const script = fileURLToPath(new URL('../scripts/run-python.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [script, 'art/characters/unpack-source.py', source, '--out', out], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    assert.equal(createHash('sha256').update(readFileSync(out)).digest('hex'), record.sha256);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});
