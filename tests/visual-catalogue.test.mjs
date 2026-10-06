import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, readdirSync, rmSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createVisualIndex, renderCataloguePage, writePortableContext} from '../scripts/lib/catalogue-visuals.mjs';
import {ROOT, safePath} from '../scripts/lib/catalogue.mjs';

const catalogue = JSON.parse(readFileSync('content/catalogue/catalogue.json', 'utf8'));
const facts = JSON.parse(readFileSync('content/catalogue/facts.json', 'utf8'));
const appScript = readFileSync('scripts/catalogue-browser/app.js', 'utf8');
const stylesheet = readFileSync('scripts/catalogue-browser/styles.css', 'utf8');

test('visual index relates artwork to registered element data and exposes cropped frame metadata', () => {
  const visuals = createVisualIndex(catalogue, facts);
  assert.equal(visuals.length, catalogue.entries.filter(entry => entry.kind === 'visual').length);
  const emberkin = visuals.find(entry => entry.id === 'visual:creature-emberkin');
  assert.deepEqual(emberkin.elements, ['Fire']);
  assert.ok(emberkin.tags.includes('bright curled flame tail'));
  assert.equal(emberkin.artIdentityReviewed, true);
  const follower = visuals.find(entry => entry.id === 'visual:creature-emberkin-follower');
  assert.deepEqual(follower.elements, ['Fire']);
  assert.equal(follower.referencePreviews[0].path, 'art/characters/reviews/creature-follower-contact-sheet.png');
  assert.deepEqual(follower.frame, {
    columns: 5,
    rows: 8,
    frameWidth: 200,
    frameHeight: 200,
    column: 0,
    row: 0,
    columnLabel: 'idle',
    rowLabel: 'south',
  });
  assert.ok(visuals.some(entry => entry.id === 'visual:tree-oak' && entry.preview));
});

test('portable selected context is deterministic and only copies requested safe previews', t => {
  const root = mkdtempSync(join(tmpdir(), 'mossvale-catalogue-test-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const first = join(root, 'first');
  const second = join(root, 'second');
  const options = {root: ROOT, catalogue, facts, ids: ['visual:tree-oak', 'visual:creature-emberkin-follower'], appScript, stylesheet};
  const result = writePortableContext({...options, output: first});
  writePortableContext({...options, output: second});
  assert.equal(result.previewCount, 3);
  assert.equal(result.selectedCount, 2);
  const tree = (directory, prefix = '') =>
    readdirSync(directory, {withFileTypes: true})
      .flatMap(entry => {
        const path = join(prefix, entry.name);
        return entry.isDirectory() ? tree(join(directory, entry.name), path) : [path.replaceAll('\\', '/')];
      })
      .sort();
  assert.deepEqual(tree(first), tree(second));
  for (const path of tree(first)) assert.deepEqual(readFileSync(join(first, path)), readFileSync(join(second, path)), path);
  const manifest = JSON.parse(readFileSync(join(first, 'manifest.json'), 'utf8'));
  assert.equal(manifest.sourceRevision, catalogue.sourceRevision);
  assert.equal(manifest.files.length, 8);
  assert.ok(manifest.files.every(file => /^[a-f0-9]{64}$/.test(file.sha256)));
  const exported = JSON.parse(readFileSync(join(first, 'catalogue.json'), 'utf8'));
  assert.equal(exported.entries.length, catalogue.entries.length);
  assert.deepEqual(
    exported.entries.find(entry => entry.id === 'visual:tree-oak').previews.map(preview => preview.path),
    ['previews/dist/assets/props/tree-oak.png'],
  );
  assert.deepEqual(exported.entries.find(entry => entry.id === 'visual:creature-emberkin').previews, []);
  assert.ok(manifest.files.some(file => file.path === 'previews/art/characters/reviews/creature-follower-contact-sheet.png'));
  const exportedPage = readFileSync(join(first, 'index.html'), 'utf8');
  assert.ok(exportedPage.includes('"path":"previews/dist/assets/props/tree-oak.png"'));
  assert.ok(exportedPage.includes('"imagePrefix":"./"'));
  assert.match(readFileSync(join(first, 'writer-instructions.md'), 'utf8'), /cannot read the creator's localhost/);
});

test('portable export rejects missing selection, traversal, overwrites and repo destinations', t => {
  const temporary = mkdtempSync(join(tmpdir(), 'mossvale-catalogue-guard-'));
  t.after(() => rmSync(temporary, {recursive: true, force: true}));
  const options = {root: ROOT, catalogue, facts, appScript, stylesheet};
  assert.throws(() => writePortableContext({...options, output: join(temporary, 'none')}), /Choose exactly one/);
  assert.throws(() => writePortableContext({...options, output: join(temporary, 'bad'), ids: ['visual:../private']}), /Unknown visual ID/);
  assert.throws(() => writePortableContext({...options, output: ROOT, ids: ['visual:tree-oak']}), /outside the repository/);
  const existing = join(temporary, 'existing');
  writePortableContext({...options, output: existing, ids: ['visual:tree-oak']});
  assert.throws(() => writePortableContext({...options, output: existing, ids: ['visual:tree-oak']}), /already exists/);
  const link = join(temporary, 'repo-link');
  try {
    symlinkSync(ROOT, link, 'dir');
  } catch (error) {
    if (process.platform === 'win32' && ['EACCES', 'EPERM'].includes(error.code)) {
      t.diagnostic('Skipping the symlink escape subcase because this Windows checkout lacks symlink privilege.');
      return;
    }
    throw error;
  }
  assert.throws(() => writePortableContext({...options, output: join(link, 'export'), ids: ['visual:tree-oak']}), /inside the repository/);
});

test('portable browser escapes metadata and does not embed machine-specific paths', () => {
  const malicious = structuredClone(catalogue);
  malicious.entries[0].summary = '<script>alert(1)</script>';
  const page = renderCataloguePage(
    {sourceRevision: catalogue.sourceRevision, entries: malicious.entries, visuals: createVisualIndex(malicious, facts)},
    {imagePrefix: './'},
  );
  assert.doesNotMatch(page, /<script>alert\(1\)<\/script>/);
  assert.ok(page.includes('\\u003cscript\\u003ealert(1)\\u003c/script\\u003e'));
  assert.doesNotMatch(page, /\/workspace\/mossvale-|C:\\\\Users/);
});

test('catalogue previews all pass safe repository path validation', () => {
  for (const entry of catalogue.entries.filter(value => value.kind === 'visual')) {
    for (const preview of entry.previews ?? []) assert.ok(safePath(ROOT, preview.path));
  }
});
