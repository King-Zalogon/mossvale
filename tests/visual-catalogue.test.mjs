import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, readdirSync, rmSync, symlinkSync, mkdirSync, writeFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createVisualIndex, renderCataloguePage, writePortableContext} from '../scripts/lib/catalogue-visuals.mjs';
import {createReferenceIndex, safeReferencePath} from '../scripts/lib/reference-assets.mjs';
import {ROOT, safePath} from '../scripts/lib/catalogue.mjs';

const catalogue = JSON.parse(readFileSync('content/catalogue/catalogue.json', 'utf8'));
const facts = JSON.parse(readFileSync('content/catalogue/facts.json', 'utf8'));
const appScript = readFileSync('scripts/catalogue-browser/app.js', 'utf8');
const stylesheet = readFileSync('scripts/catalogue-browser/styles.css', 'utf8');
const referenceRegistry = JSON.parse(readFileSync('art/assets/third-party/andhegames-creatures/registry.json', 'utf8'));
const referenceAssets = createReferenceIndex(referenceRegistry, {
  root: ROOT,
  registryPath: 'art/assets/third-party/andhegames-creatures/registry.json',
});

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

test('third-party art has stable reference IDs, curated subject/source/license metadata and no runtime identity', () => {
  assert.equal(referenceAssets.length, 3);
  for (const reference of referenceAssets) {
    assert.match(reference.id, /^reference:andhegames\//);
    assert.equal(reference.recordType, 'reference');
    assert.equal(reference.kind, 'reference');
    assert.equal(reference.status, 'reference-only');
    assert.equal(reference.runtimeId, null);
    assert.equal(reference.creator, 'AndHeGames');
    assert.equal(reference.sourceName, 'OpenGameArt');
    assert.equal(reference.license, 'CC0 1.0 Universal');
    assert.match(reference.sha256, /^[a-f0-9]{64}$/);
    assert.ok(reference.subjects.length > 0);
    assert.ok(reference.limits.length >= 1);
    assert.ok(!catalogue.entries.some(entry => entry.id === reference.id));
  }
});

test('selected reference export is deterministic, carries rights and copies only the selected sheet', t => {
  const root = mkdtempSync(join(tmpdir(), 'mossvale-reference-test-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const first = join(root, 'first');
  const second = join(root, 'second');
  const selectedId = 'reference:andhegames/creatures-volume-3';
  const options = {root: ROOT, catalogue, facts, referenceAssets, ids: [selectedId], appScript, stylesheet};
  const result = writePortableContext({...options, output: first});
  writePortableContext({...options, output: second});
  assert.equal(result.selectedCount, 1);
  assert.equal(result.previewCount, 1);
  const tree = directory =>
    readdirSync(directory, {withFileTypes: true})
      .flatMap(entry => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? tree(path).map(child => `${entry.name}/${child}`) : [entry.name];
      })
      .sort();
  assert.deepEqual(tree(first), tree(second));
  for (const path of tree(first)) assert.deepEqual(readFileSync(join(first, path)), readFileSync(join(second, path)), path);
  const exportedReferences = JSON.parse(readFileSync(join(first, 'references.json'), 'utf8'));
  assert.equal(exportedReferences.length, 1);
  assert.equal(exportedReferences[0].id, selectedId);
  assert.equal(exportedReferences[0].runtimeId, null);
  assert.equal(exportedReferences[0].license, 'CC0 1.0 Universal');
  assert.equal(exportedReferences[0].source, referenceAssets.find(item => item.id === selectedId).source);
  assert.equal(exportedReferences[0].preview.path, 'previews/art/assets/third-party/andhegames-creatures/creatures-volume-3.png');
  assert.equal(
    JSON.parse(readFileSync(join(first, 'catalogue.json'), 'utf8')).entries.some(entry => entry.id === selectedId),
    false,
  );
  const manifest = JSON.parse(readFileSync(join(first, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.selection.referenceIds, [selectedId]);
  assert.deepEqual(manifest.selection.visualIds, []);
  assert.ok(manifest.files.some(file => file.path.endsWith('creatures-volume-3.png')));
  assert.ok(manifest.files.some(file => file.path === 'references.json'));
  assert.match(readFileSync(join(first, 'writer-instructions.md'), 'utf8'), /not runtime visuals, species identities, approved Mossvale art/);
  assert.equal(readdirSync(join(first, 'previews/art/assets/third-party/andhegames-creatures')).length, 1);
});

test('explicit all-visual export never sweeps in the separate reference library', t => {
  const temporary = mkdtempSync(join(tmpdir(), 'mossvale-all-visuals-'));
  t.after(() => rmSync(temporary, {recursive: true, force: true}));
  const output = join(temporary, 'all-visuals');
  const oneVisual = {
    sourceRevision: 'test-revision',
    entries: [
      {
        id: 'visual:test',
        kind: 'visual',
        name: 'Test visual',
        summary: 'A fixture visual.',
        status: 'available',
        scope: 'core',
        details: {appearance: 'fixture', directions: 'all'},
        previews: [],
      },
    ],
  };
  const result = writePortableContext({
    root: ROOT,
    output,
    catalogue: oneVisual,
    facts: {records: []},
    referenceAssets,
    all: true,
    appScript,
    stylesheet,
  });
  assert.equal(result.selectedCount, 1);
  assert.equal(result.previewCount, 0);
  assert.equal(existsSync(join(output, 'references.json')), false);
  assert.deepEqual(JSON.parse(readFileSync(join(output, 'manifest.json'), 'utf8')).selection, {allVisuals: true});
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
  assert.equal(manifest.files.length, 12);
  assert.ok(manifest.files.some(file => file.path === 'scene-examples/bell-three.json'));
  assert.match(readFileSync(join(first, 'writer-instructions.md'), 'utf8'), /continuityChanges/);
  assert.ok(manifest.files.some(file => file.path === 'scene-script.schema.json'));
  assert.match(readFileSync(join(first, 'writer-instructions.md'), 'utf8'), /sceneBrief/);
  assert.match(readFileSync(join(first, 'writer-instructions.md'), 'utf8'), /unrelated chest/);
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
  assert.throws(() => writePortableContext({...options, output: join(temporary, 'bad'), ids: ['visual:../private']}), /Unknown visual\/reference ID/);
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

test('reference exports reject symlink paths, content changes and oversized images', t => {
  const temporary = mkdtempSync(join(tmpdir(), 'mossvale-reference-guards-'));
  t.after(() => rmSync(temporary, {recursive: true, force: true}));
  const root = join(temporary, 'source');
  mkdirSync(root);
  const target = join(root, 'target.png');
  writeFileSync(target, Buffer.from('test image bytes'));
  symlinkSync(target, join(root, 'linked.png'));
  assert.throws(() => safeReferencePath(root, 'linked.png'), /symlinks/);

  const oversized = Buffer.alloc(2 * 1024 * 1024 + 1);
  writeFileSync(join(root, 'oversized.png'), oversized);
  const fake = {
    id: 'reference:test/oversized',
    preview: {path: 'oversized.png', description: 'Test reference.'},
    sha256: createHash('sha256').update(oversized).digest('hex'),
  };
  assert.throws(
    () =>
      writePortableContext({root, output: join(temporary, 'large-export'), catalogue, facts, referenceAssets: [fake], ids: [fake.id], appScript, stylesheet}),
    /per-file export limit/,
  );
  const medium = Buffer.alloc(1_900_000);
  const mediumHash = createHash('sha256').update(medium).digest('hex');
  const selected = Array.from({length: 9}, (_, index) => {
    const path = `medium-${index}.png`;
    writeFileSync(join(root, path), medium);
    return {id: `reference:test/medium-${index}`, preview: {path, description: 'Test reference.'}, sha256: mediumHash};
  });
  assert.throws(
    () =>
      writePortableContext({
        root,
        output: join(temporary, 'combined-export'),
        catalogue,
        facts,
        referenceAssets: selected,
        ids: selected.map(item => item.id),
        appScript,
        stylesheet,
      }),
    /combined reference export limit/,
  );
  assert.throws(
    () =>
      writePortableContext({
        root: ROOT,
        output: join(temporary, 'bad-hash'),
        catalogue,
        facts,
        referenceAssets: [{...referenceAssets[0], sha256: '0'.repeat(64)}],
        ids: [referenceAssets[0].id],
        appScript,
        stylesheet,
      }),
    /hash mismatch/,
  );
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
