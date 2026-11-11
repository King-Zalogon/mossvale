#!/usr/bin/env node
/* `npm run setup`: create .venv/ and install the pinned Python requirements, with no system changes (#441). */
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {pythonCandidates, venvPython} from './run-python.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = (command, args) => spawnSync(command, args, {stdio: 'inherit', cwd: root, windowsHide: true});

if (!venvPython()) {
  const created = pythonCandidates().some(([command, ...prefix]) => {
    const result = run(command, [...prefix, '-m', 'venv', '.venv']);
    return !result.error && result.status === 0;
  });
  if (!created) {
    console.error('Could not create .venv/: install Python 3.10+ (with the venv module) and run `npm run setup` again.');
    process.exit(1);
  }
}
const python = venvPython() ?? join(root, '.venv', 'bin', 'python');
const installed = run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', 'requirements.txt']);
process.exit(installed.status ?? 1);
