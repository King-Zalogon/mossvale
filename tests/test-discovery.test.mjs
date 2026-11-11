// Guards against hand-maintained test lists silently skipping files (#438).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {browserTestFiles} from '../scripts/run-browser-tests.mjs';
import {unitTestFiles} from '../scripts/run-tests.mjs';

const tests = readdirSync(new URL('./', import.meta.url));
const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts;

test('every unit and browser test file is picked up by its runner', () => {
  assert.deepEqual(
    unitTestFiles(),
    tests
      .filter(name => name.endsWith('.test.mjs'))
      .sort()
      .map(name => `tests/${name}`),
  );
  assert.deepEqual(
    browserTestFiles(),
    tests
      .filter(name => name.endsWith('.browser.mjs'))
      .sort()
      .map(name => `tests/${name}`),
  );
  assert.ok(unitTestFiles().includes('tests/discovery.test.mjs'), 'previously orphaned files now run');
});

test('npm test and test:browser use the discovering runners, not file lists', () => {
  assert.equal(scripts.test, 'node scripts/run-tests.mjs');
  assert.equal(scripts['test:browser'], 'node scripts/run-browser-tests.mjs');
});

test('every Python test and standalone integration script is reachable from a package script', () => {
  const all = Object.values(scripts).join('\n');
  const standalone = tests.filter(name => /^test_.*\.py$/.test(name) || /\.integration\.mjs$/.test(name) || name === 'account-database.mjs');
  assert.ok(standalone.length > 10);
  for (const name of standalone) assert.ok(all.includes(`tests/${name}`), `tests/${name} is not run by any npm script`);
});
