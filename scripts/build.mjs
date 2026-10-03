// Packages dist/ into build/ with a version stamp, so a playable copy can always be traced to its commit
// and an earlier copy can be put back. No bundling: the game is static files.
//   node scripts/build.mjs            -> build/
//   BUILD_DIR=/tmp/x node scripts/build.mjs
import {createHash} from 'node:crypto';
import {cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {VERSION} from '../dist/src/save.js';
import {ENGINE_VERSION, SAVE_SCHEMA_VERSION} from '../dist/src/compatibility.js';
import {packFileEntries} from '../dist/src/domain/pack.js';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const dist = join(repoRoot, 'dist');
const out = process.env.BUILD_DIR ? resolve(process.env.BUILD_DIR) : join(repoRoot, 'build');
const argIndex = process.argv.indexOf('--pack');
const selectedPack = argIndex >= 0 ? resolve(process.argv[argIndex + 1] ?? '') : process.env.BUILD_PACK ? resolve(process.env.BUILD_PACK) : null;
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
if (selectedPack) {
  execFileSync(process.execPath, [join(repoRoot, 'scripts/validate-assets.mjs')], {stdio: 'inherit'});
  execFileSync(process.execPath, [join(repoRoot, 'scripts/pack.mjs'), 'validate-pack', selectedPack], {stdio: 'inherit'});
  pack = JSON.parse(readFileSync(join(selectedPack, 'index.json'), 'utf8'));
  if (pack.mapDirectory !== undefined && !/^[a-z0-9-]+\/$/.test(pack.mapDirectory))
    throw new Error('pack mapDirectory: must be a relative folder ending with /');
} else {
  execFileSync(process.execPath, [join(repoRoot, 'scripts/validate-assets.mjs')], {stdio: 'inherit'});
  execFileSync(process.execPath, [join(repoRoot, 'scripts/validate-maps.mjs')], {stdio: 'inherit'});
}
const info = {
  commit,
  short: commit.slice(0, 7),
  branch: process.env.GITHUB_REF_NAME || git('rev-parse', '--abbrev-ref', 'HEAD') || 'unknown',
  dirty: git('status', '--porcelain') !== '',
  builtAt: new Date().toISOString(),
  saveSchema: VERSION,
  engineVersion: ENGINE_VERSION,
  pack: {
    id: pack?.id ?? 'mossvale',
    contentVersion: Number.isInteger(pack?.contentVersion) && pack.contentVersion > 0 ? pack.contentVersion : 1,
    format: pack?.format ?? 1,
    requires: {engineVersion: ENGINE_VERSION, saveSchema: SAVE_SCHEMA_VERSION},
  },
};

rmSync(out, {recursive: true, force: true});
copyDirectory(dist, out);
if (selectedPack) {
  const maps = join(out, 'maps');
  rmSync(maps, {recursive: true, force: true});
  mkdirSync(maps, {recursive: true});
  const copyPackFile = (name, destination = name) => {
    mkdirSync(dirname(join(maps, destination)), {recursive: true});
    cpSync(join(selectedPack, name), join(maps, destination));
  };
  copyPackFile('index.json');
  copyPackFile(pack.registries ?? 'registries.json', pack.registries ?? 'registries.json');
  for (const name of ['objectives', 'story']) if (pack[name]) copyPackFile(pack[name]);
  const mapDir = pack.mapDirectory ?? '';
  for (const id of pack.maps) copyPackFile(join(mapDir, id + '.json'), join(mapDir, id + '.json'));
}
const outputIndexPath = join(out, 'maps', 'index.json');
const outputPack = JSON.parse(readFileSync(outputIndexPath, 'utf8'));
outputPack.contentVersion = Number.isInteger(outputPack.contentVersion) && outputPack.contentVersion > 0 ? outputPack.contentVersion : 1;
outputPack.requires = {engineVersion: ENGINE_VERSION, saveSchema: SAVE_SCHEMA_VERSION};
outputPack.integrity = packFileEntries(outputPack).map(({id, path}) => {
  const bytes = readFileSync(join(out, 'maps', path));
  return {id, path, sha256: createHash('sha256').update(bytes).digest('hex')};
});
writeFileSync(outputIndexPath, JSON.stringify(outputPack, null, 2) + '\n');
info.pack = {...info.pack, id: outputPack.id, contentVersion: outputPack.contentVersion, format: outputPack.format, integrity: outputPack.integrity};
writeFileSync(join(out, 'version.json'), JSON.stringify(info, null, 2) + '\n');
console.log(`built ${info.short}${info.dirty ? ' (uncommitted changes)' : ''} on ${info.branch} (${info.pack.id}) -> ${out}`);
