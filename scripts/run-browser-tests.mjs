#!/usr/bin/env node
/* Pooled, isolated runner for tests/*.browser.mjs (#442).
   node scripts/run-browser-tests.mjs              -> every browser test
   node scripts/run-browser-tests.mjs battle hints -> files whose name contains a filter
   BROWSER_JOBS=4 (default 2)   parallel files; each file starts its own server on an ephemeral port
   BROWSER_TIMEOUT_MS=240000    per-file limit; a timed-out file is killed with its process tree
   Failures never stop the run. A failed file is re-run once, serially, after the pool drains (parallel load causes in-page timeouts);
   if it then passes it is reported as flaky, not hidden. The exit code is non-zero if any file still fails. */
import {spawn, spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const testsDir = fileURLToPath(new URL('../tests/', import.meta.url));

export function browserTestFiles(filters = []) {
  return readdirSync(testsDir)
    .filter(name => name.endsWith('.browser.mjs'))
    .filter(name => !filters.length || filters.some(filter => name.includes(filter)))
    .sort()
    .map(name => `tests/${name}`);
}

function killTree(child) {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {stdio: 'ignore'});
  else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
}

function runOnce(file, timeoutMs) {
  return new Promise(resolve => {
    const started = Date.now();
    const child = spawn(process.execPath, [file], {detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true});
    let output = '';
    let timedOut = false;
    const collect = chunk => {
      output += chunk;
      if (output.length > 200000) output = output.slice(-100000);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeoutMs);
    child.on('close', code => {
      clearTimeout(timer);
      killTree(child); // reap anything the test left behind
      resolve({file, ok: code === 0 && !timedOut, timedOut, output, ms: Date.now() - started});
    });
  });
}

export async function runBrowserTests({filters = [], jobs = 2, timeoutMs = 240000, log = console.log} = {}) {
  const files = browserTestFiles(filters);
  const queue = [...files];
  const results = [];
  const worker = async () => {
    for (let file = queue.shift(); file; file = queue.shift()) {
      const result = await runOnce(file, timeoutMs);
      results.push(result);
      log(`${result.ok ? 'PASS' : 'FAIL'} ${file} (${(result.ms / 1000).toFixed(1)}s)`);
      if (!result.ok) log(result.output.split('\n').slice(-30).join('\n'));
    }
  };
  await Promise.all(Array.from({length: Math.max(1, Math.min(jobs, files.length || 1))}, worker));
  for (const first of results.filter(result => !result.ok)) {
    log(`RETRY ${first.file} (serial, unloaded)`);
    const second = await runOnce(first.file, timeoutMs);
    results.splice(results.indexOf(first), 1, {...second, retried: true});
    log(`${second.ok ? 'PASS' : 'FAIL'} ${first.file} (${(second.ms / 1000).toFixed(1)}s, retry)`);
    if (!second.ok) log(second.output.split('\n').slice(-30).join('\n'));
  }
  return {files, results};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const filters = process.argv.slice(2);
  const jobs = Number(process.env.BROWSER_JOBS) || 2;
  const timeoutMs = Number(process.env.BROWSER_TIMEOUT_MS) || 240000;
  const {files, results} = await runBrowserTests({filters, jobs, timeoutMs});
  if (!files.length) {
    console.error('No browser test files match.');
    process.exit(1);
  }
  const failed = results.filter(result => !result.ok);
  const flaky = results.filter(result => result.ok && result.retried);
  console.log(`\n${results.length - failed.length}/${results.length} browser test files passed (jobs=${jobs}).`);
  if (flaky.length) console.log(`Flaky (failed under parallel load, passed on serial retry): ${flaky.map(result => result.file).join(', ')}`);
  if (failed.length) console.log(`Failed:\n${failed.map(result => `  ${result.file}${result.timedOut ? ' (timeout)' : ''}`).join('\n')}`);
  process.exit(failed.length ? 1 : 0);
}
