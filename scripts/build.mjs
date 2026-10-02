// Packages dist/ into build/ with a version stamp, so a playable copy can always be traced to its commit
// and an earlier copy can be put back. No bundling: the game is static files.
//   node scripts/build.mjs            -> build/
//   BUILD_DIR=/tmp/x node scripts/build.mjs
import {cpSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {VERSION} from '../dist/src/save.js';

const out = new URL(process.env.BUILD_DIR ? `file://${process.env.BUILD_DIR.replace(/\/?$/, '/')}` : '../build/', import.meta.url);
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
mkdirSync(out, {recursive: true});
cpSync(new URL('../dist/', import.meta.url), out, {recursive: true});
writeFileSync(new URL('version.json', out), JSON.stringify(info, null, 2) + '\n');
console.log(`built ${info.short}${info.dirty ? ' (uncommitted changes)' : ''} on ${info.branch} -> ${out.pathname}`);
