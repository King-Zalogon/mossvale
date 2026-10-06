#!/usr/bin/env node
/* Run a repository Python check through the first available platform launcher. */
import {spawnSync} from 'node:child_process';

export function pythonCandidates(platform = process.platform) {
  return platform === 'win32' ? [['python'], ['py', '-3'], ['python3']] : [['python3'], ['python']];
}

export function runPython(args, platform = process.platform) {
  for (const [command, ...prefix] of pythonCandidates(platform)) {
    const result = spawnSync(command, [...prefix, ...args], {stdio: 'inherit', windowsHide: true});
    if (result.error?.code === 'ENOENT') continue;
    if (result.error) throw result.error;
    if (result.status !== null) return result.status;
  }
  throw new Error(
    `No supported Python launcher found. Tried: ${pythonCandidates(platform)
      .map(([command, ...prefix]) => [command, ...prefix].join(' '))
      .join(', ')}`,
  );
}

if (process.argv[1]?.endsWith('run-python.mjs')) {
  try {
    process.exitCode = runPython(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
