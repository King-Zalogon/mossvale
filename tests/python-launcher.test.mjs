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
