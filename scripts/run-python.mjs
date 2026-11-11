#!/usr/bin/env node
/* Run a repository Python check through the first available platform launcher. */
import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

/* The project virtual environment created by `npm run setup`, preferred over any system Python. */
export function venvPython(platform = process.platform, root = repoRoot) {
  const path = platform === 'win32' ? join(root, '.venv', 'Scripts', 'python.exe') : join(root, '.venv', 'bin', 'python');
  return existsSync(path) ? path : null;
}

export function pinnedPillow(root = repoRoot) {
  const match = /^Pillow==(\S+)/m.exec(readFileSync(join(root, 'requirements.txt'), 'utf8'));
  return match?.[1] ?? null;
}

export function pythonCandidates(platform = process.platform) {
  return platform === 'win32' ? [['python'], ['py', '-3'], ['python3']] : [['python3'], ['python']];
}

/* One-line diagnosis for a failing check: wrong or missing Pillow is the usual cause of byte-level art mismatches. */
export function environmentHint(command, prefix = []) {
  const wanted = pinnedPillow();
  const probe = spawnSync(command, [...prefix, '-c', 'import PIL; print(PIL.__version__)'], {encoding: 'utf8', windowsHide: true});
  const found = probe.status === 0 ? probe.stdout.trim() : null;
  if (found === wanted) return null;
  return `Python environment mismatch: Pillow ${found ?? 'is not installed'}, requirements.txt pins ${wanted}. Run \`npm run setup\` to provision .venv/.`;
}

export function runPython(args, platform = process.platform) {
  const venv = venvPython(platform);
  const candidates = venv ? [[venv], ...pythonCandidates(platform)] : pythonCandidates(platform);
  for (const [command, ...prefix] of candidates) {
    const result = spawnSync(command, [...prefix, ...args], {stdio: 'inherit', windowsHide: true});
    if (result.error?.code === 'ENOENT') continue;
    if (result.error) throw result.error;
    if (result.status !== null) {
      if (result.status !== 0) {
        const hint = environmentHint(command, prefix);
        if (hint) console.error(hint);
      }
      return result.status;
    }
  }
  throw new Error(`No supported Python launcher found. Tried: ${candidates.map(([command, ...prefix]) => [command, ...prefix].join(' ')).join(', ')}`);
}

if (process.argv[1]?.endsWith('run-python.mjs')) {
  try {
    process.exitCode = runPython(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
