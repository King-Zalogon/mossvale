#!/usr/bin/env node
/* Run every Node unit test under tests/ without a hand-maintained list (#438).
   node scripts/run-tests.mjs              -> all tests/*.test.mjs
   node scripts/run-tests.mjs battle save  -> only files whose name contains a filter */
import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const testsDir = fileURLToPath(new URL('../tests/', import.meta.url));

export function unitTestFiles(filters = []) {
  return readdirSync(testsDir)
    .filter(name => name.endsWith('.test.mjs'))
    .filter(name => !filters.length || filters.some(filter => name.includes(filter)))
    .sort()
    .map(name => `tests/${name}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const files = unitTestFiles(process.argv.slice(2));
  if (!files.length) {
    console.error('No unit test files match.');
    process.exit(1);
  }
  const result = spawnSync(process.execPath, ['--test', ...files], {stdio: 'inherit'});
  process.exit(result.status ?? 1);
}
