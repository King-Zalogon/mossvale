import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const script = fileURLToPath(new URL('../scripts/pack.mjs', import.meta.url));
const run = (...args) => execFileSync(process.execPath, [script, ...args], {encoding: 'utf8'});

test('pack CLI scaffolds, extends, validates and previews a data-only pack in paths with spaces and Unicode', () => {
  const root = mkdtempSync(join(tmpdir(), 'moss pack café '));
  const pack = join(root, 'tiny adventure');
  try {
    assert.match(run('create-pack', pack, '--id', 'tiny-adventure', '--name', 'Tiny Adventure'), /Created tiny-adventure/);
    assert.match(run('validate-pack', pack), /1 map\(s\), 2 species/);
    assert.match(run('preview-pack', pack, 'start'), /Tiny Adventure \(start\)[\s\S]*@/);
    assert.match(run('add-map', pack, 'orchard'), /Added orchard and linked it to start/);
    assert.match(run('validate-pack', pack), /2 map\(s\), 2 species/);
    const index = JSON.parse(readFileSync(join(pack, 'index.json'), 'utf8'));
    assert.deepEqual(index.maps, ['start', 'orchard']);
    assert.match(run('preview-pack', pack, 'orchard'), /Orchard \(orchard\)/);

    const refused = spawnSync(process.execPath, [script, 'create-pack', pack, '--id', 'tiny-adventure', '--name', 'Changed'], {encoding: 'utf8'});
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /refusing to overwrite/);

    const mapPath = join(pack, 'maps', 'orchard.json');
    const map = JSON.parse(readFileSync(mapPath, 'utf8'));
    map.zones[0].pool = ['missing-species'];
    writeFileSync(mapPath, JSON.stringify(map));
    const invalid = spawnSync(process.execPath, [script, 'validate-pack', pack], {encoding: 'utf8'});
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /unknown species "missing-species"/);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});
