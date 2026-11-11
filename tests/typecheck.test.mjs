import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {importErrors} from '../scripts/check-imports.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const tsc = join(root, 'node_modules/typescript/bin/tsc');

test('importErrors keeps only import-resolution diagnostics', () => {
  const output = [
    "dist/src/a.js(1,10): error TS2305: Module './b.js' has no exported member 'x'.",
    "dist/src/a.js(2,1): error TS2339: Property 'y' does not exist on type 'Z'.",
    "dist/src/a.js(3,1): error TS2307: Cannot find module './c.js'.",
  ].join('\n');
  assert.deepEqual(
    importErrors(output).map(line => /TS\d+/.exec(line)[0]),
    ['TS2305', 'TS2307'],
  );
});

test('a named import that the module does not export is caught (the startup-break regression)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mossvale-types-'));
  try {
    const rng = join(root, 'dist/src/domain/rng.js').replaceAll('\\', '/');
    writeFileSync(join(dir, 'bad.js'), `import {doesNotExist} from '${rng}';\ndoesNotExist();\n`);
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({extends: join(root, 'tsconfig.check.json'), compilerOptions: {baseUrl: root}, include: [join(dir, 'bad.js')]}),
    );
    const result = spawnSync(process.execPath, [tsc, '-p', join(dir, 'tsconfig.json')], {encoding: 'utf8'});
    assert.notEqual(result.status, 0);
    assert.equal(importErrors(result.stdout).length, 1, result.stdout);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test('the strictly typed layers have no type errors', () => {
  const result = spawnSync(process.execPath, [tsc, '-p', join(root, 'tsconfig.check.json')], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stdout);
});

test('there is no root tsconfig.json: `next build` would rewrite it, install @types/react and create next-env.d.ts', async () => {
  const {existsSync} = await import('node:fs');
  assert.equal(existsSync(join(root, 'tsconfig.json')), false, 'keep the type-check config named tsconfig.check.json');
});
