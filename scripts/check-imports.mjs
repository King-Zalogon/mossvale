#!/usr/bin/env node
/* Repo-wide import check (#445): every module must resolve and every named import must exist. This is the class of
   mistake that once stopped every app startup (a named import from a module that did not export it) and that browsers
   only report at runtime. Other type errors outside the strictly typed layers are not reported here (see tsconfig.check.json). */
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const IMPORT_CODES = new Set(['TS2305', 'TS2307', 'TS2614', 'TS2724', 'TS2459', 'TS2460', 'TS1192', 'TS1259']);

export function importErrors(output) {
  return output.split('\n').filter(line => {
    const code = /error (TS\d+):/.exec(line)?.[1];
    return code !== undefined && IMPORT_CODES.has(code);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const tsc = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
  const project = process.argv[2] ?? 'tsconfig.imports.json';
  const result = spawnSync(process.execPath, [tsc, '-p', project], {cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  const errors = importErrors(`${result.stdout}${result.stderr}`);
  if (errors.length) {
    console.error(`${errors.length} unresolved import(s):\n${errors.join('\n')}`);
    process.exit(1);
  }
  console.log('imports OK');
}
