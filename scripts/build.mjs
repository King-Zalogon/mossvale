// Packages dist/ into build/ with a version stamp, so a playable copy can always be traced to its commit
// and an earlier copy can be put back. No bundling: the game is static files.
//   node scripts/build.mjs            -> build/
//   BUILD_DIR=/tmp/x node scripts/build.mjs
import {cpSync, mkdirSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {VERSION} from '../dist/src/save.js';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const dist = join(repoRoot, 'dist');
const out = process.env.BUILD_DIR ? resolve(process.env.BUILD_DIR) : join(repoRoot, 'build');
function copyDirectory(source, destination) {
  mkdirSync(destination, {recursive: true});
  for (const entry of readdirSync(source, {withFileTypes: true})) {
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isDirectory()) copyDirectory(from, to);
    else cpSync(from, to);
  }
}
const git = (...args) => {
  try {
    return execFileSync('git', args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  } catch {
    return '';
  }
};

const commit = process.env.GITHUB_SHA || git('rev-parse', 'HEAD') || 'unknown';
const info = {
  commit,
  short: commit.slice(0, 7),
  branch: process.env.GITHUB_REF_NAME || git('rev-parse', '--abbrev-ref', 'HEAD') || 'unknown',
  dirty: git('status', '--porcelain') !== '',
  builtAt: new Date().toISOString(),
  saveSchema: VERSION,
};

rmSync(out, {recursive: true, force: true});
copyDirectory(dist, out);
writeFileSync(join(out, 'version.json'), JSON.stringify(info, null, 2) + '\n');
console.log(`built ${info.short}${info.dirty ? ' (uncommitted changes)' : ''} on ${info.branch} -> ${out}`);
