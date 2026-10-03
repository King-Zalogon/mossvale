// Packages dist/ into build/ with a version stamp, so a playable copy can always be traced to its commit
// and an earlier copy can be put back. No bundling: the game is static files.
//   node scripts/build.mjs            -> build/
//   BUILD_DIR=/tmp/x node scripts/build.mjs
//   node scripts/build.mjs --pack ./content/x        -> a build whose main adventure is the pack in ./content/x
//   node scripts/build.mjs --include ./content/x     -> also offer ./content/x in the adventure chooser (repeatable)
import {cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {VERSION} from '../dist/src/save.js';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const dist = join(repoRoot, 'dist');
const out = process.env.BUILD_DIR ? resolve(process.env.BUILD_DIR) : join(repoRoot, 'build');
const argIndex = process.argv.indexOf('--pack');
const selectedPack = argIndex >= 0 ? resolve(process.argv[argIndex + 1] ?? '') : process.env.BUILD_PACK ? resolve(process.env.BUILD_PACK) : null;
const includes = process.argv.flatMap((arg, i) => (arg === '--include' ? [resolve(process.argv[i + 1] ?? '')] : []));
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
let pack;
if (selectedPack || includes.length) execFileSync(process.execPath, [join(repoRoot, 'scripts/validate-assets.mjs')], {stdio: 'inherit'});
if (selectedPack) {
  pack = validatePackFolder(selectedPack);
}
const info = {
  commit,
  short: commit.slice(0, 7),
  branch: process.env.GITHUB_REF_NAME || git('rev-parse', '--abbrev-ref', 'HEAD') || 'unknown',
  dirty: git('status', '--porcelain') !== '',
  builtAt: new Date().toISOString(),
  saveSchema: VERSION,
  engineVersion: 1,
  pack: {
    id: pack?.id ?? 'mossvale',
    contentVersion: Number.isInteger(pack?.contentVersion) && pack.contentVersion > 0 ? pack.contentVersion : 1,
    format: pack?.format ?? 1,
  },
};

rmSync(out, {recursive: true, force: true});
copyDirectory(dist, out);
/** Copies a validated pack's own files (manifest, registries, objectives, story, maps) into `destination`. */
function copyPack(root, index, destination) {
  rmSync(destination, {recursive: true, force: true});
  mkdirSync(destination, {recursive: true});
  const copyPackFile = name => {
    mkdirSync(dirname(join(destination, name)), {recursive: true});
    cpSync(join(root, name), join(destination, name));
  };
  copyPackFile('index.json');
  copyPackFile(index.registries ?? 'registries.json');
  for (const name of ['objectives', 'story']) if (index[name]) copyPackFile(index[name]);
  const mapDir = index.mapDirectory ?? '';
  for (const id of index.maps) copyPackFile(join(mapDir, id + '.json'));
}
function validatePackFolder(root) {
  execFileSync(process.execPath, [join(repoRoot, 'scripts/pack.mjs'), 'validate-pack', root], {stdio: 'inherit'});
  const index = JSON.parse(readFileSync(join(root, 'index.json'), 'utf8'));
  if (index.mapDirectory !== undefined && !/^[a-z0-9-]+\/$/.test(index.mapDirectory))
    throw new Error('pack mapDirectory: must be a relative folder ending with /');
  return index;
}
const main = pack ?? JSON.parse(readFileSync(join(dist, 'maps/index.json'), 'utf8'));
if (selectedPack) copyPack(selectedPack, pack, join(out, 'maps'));
// The adventure chooser's catalog: the main adventure in maps/, then every --include under adventures/<id>/.
const catalog = {format: 1, adventures: [{id: main.id, name: main.name, brief: main.brief, path: 'maps/'}]};
for (const root of includes) {
  const index = validatePackFolder(root);
  if (catalog.adventures.some(a => a.id === index.id)) throw new Error(`adventure "${index.id}" is listed twice (--pack/--include)`);
  copyPack(root, index, join(out, 'adventures', index.id));
  catalog.adventures.push({id: index.id, name: index.name, brief: index.brief, path: `adventures/${index.id}/`});
}
if (selectedPack || includes.length) writeFileSync(join(out, 'adventures.json'), JSON.stringify(catalog, null, 2) + '\n');
writeFileSync(join(out, 'version.json'), JSON.stringify(info, null, 2) + '\n');
console.log(`built ${info.short}${info.dirty ? ' (uncommitted changes)' : ''} on ${info.branch} (${info.pack.id}) -> ${out}`);
