import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdirSync, mkdtempSync, writeFileSync, symlinkSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {collectFacts, generateCatalogue, validateCatalogue, validateGenerated, safePath, ROOT} from '../scripts/lib/catalogue.mjs';
import {changedPaths, validateImpact} from '../scripts/lib/catalogue-impact.mjs';

const output = () => generateCatalogue();
const catalogue = async () => JSON.parse((await output())['content/catalogue/catalogue.json']);

test('catalogue deterministically covers canonical resources, real pack variants and explicit gaps', async () => {
  const first = await output();
  assert.deepEqual(first, await output());
  for (const [path, content] of Object.entries(first)) assert.equal(readFileSync(join(ROOT, path), 'utf8'), content, `Stale ${path}`);
  const data = JSON.parse(first['content/catalogue/catalogue.json']);
  assert.deepEqual(validateCatalogue(data), []);
  const ids = new Set(data.entries.map(entry => entry.id));
  for (const record of collectFacts().records) assert.ok(ids.has(record.id), `Missing authorable entry ${record.id}`);
  assert.ok(ids.has('item:lantern-crossing/lantern-tonic'));
  assert.equal(data.entries.find(entry => entry.id === 'mechanic:npc-navigation').status, 'proposed');
  assert.match(data.entries.find(entry => entry.id === 'item:mossvale/potion').details.strength, /24/);
});

test('missing schema fields, duplicate identities, dangling references and absent previews fail', async () => {
  for (const mutate of [
    value => delete value.entries[0].summary,
    value => value.entries.push(structuredClone(value.entries[0])),
    value => value.entries[0].dependencies.push('visual:nonexistent'),
    value => (value.entries[0].previews = [{path: 'dist/assets/absent.png', description: 'Absent'}]),
    value => (value.entries[0].references = ['../private.json']),
  ]) {
    const data = await catalogue();
    mutate(data);
    assert.ok(validateCatalogue(data).length);
  }
});

test('preview/evidence paths refuse symlinks escaping the portable root', t => {
  const root = mkdtempSync(join(tmpdir(), 'catalogue-root-'));
  const outside = mkdtempSync(join(tmpdir(), 'catalogue-outside-'));
  t.after(() => {
    rmSync(root, {recursive: true, force: true});
    rmSync(outside, {recursive: true, force: true});
  });
  writeFileSync(join(outside, 'private.json'), '{}');
  try {
    symlinkSync(join(outside, 'private.json'), join(root, 'preview.json'));
  } catch (error) {
    if (process.platform === 'win32' && error.code === 'EPERM') {
      t.skip('Windows file symlinks require developer mode or privilege');
      return;
    }
    throw error;
  }
  assert.throws(() => safePath(root, 'preview.json'), /escapes root/);
});

test('unrelated doc edits and old/invalid impact records cannot excuse resource changes', async () => {
  const data = await catalogue();
  const changed = ['dist/src/domain/battle.js', 'README.md'];
  assert.ok(validateImpact(changed, [], data).some(error => error.includes('battle.js')));
  const review = {
    format: 1,
    changes: [
      {
        paths: ['dist/src/domain/battle.js'],
        entries: ['item:battle-potion'],
        disposition: 'no-semantic-impact',
        reason: 'Only comment wording changed; the public potion rules are unchanged.',
        evidence: ['tests/battle-actions.test.mjs'],
      },
    ],
  };
  assert.deepEqual(validateImpact(changed, [review], data), []);
  review.changes[0].entries = ['item:missing'];
  assert.ok(validateImpact(changed, [review], data).length);
  review.changes[0].entries = ['item:battle-potion'];
  review.changes[0].disposition = 'updated';
  assert.ok(validateImpact(changed, [review], data).some(error => error.includes('actual catalogue')));
  assert.deepEqual(
    validateImpact(
      [...changed, 'content/catalogue/curated.json'],
      [{format: 1, changes: [{...review.changes[0], paths: [...review.changes[0].paths, 'content/catalogue/curated.json']}]}],
      data,
    ),
    [],
  );
});

test('impact comparison covers merge-base history and staged, unstaged, untracked, renamed and deleted paths', t => {
  const root = mkdtempSync(join(tmpdir(), 'catalogue-git-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  git('init');
  git('config', 'user.name', 'Catalogue test');
  git('config', 'user.email', 'catalogue@example.invalid');
  writeFileSync(join(root, 'old.json'), '{}');
  writeFileSync(join(root, 'delete.json'), '{}');
  writeFileSync(join(root, '.gitignore'), 'ignored.txt\n');
  git('add', '.');
  git('commit', '-m', 'base');
  const base = git('rev-parse', 'HEAD');
  assert.deepEqual(changedPaths(root, base), [], 'a clean candidate reports no paths');
  git('mv', 'old.json', 'new.json');
  git('commit', '-m', 'rename');
  writeFileSync(join(root, 'staged.json'), '{}');
  git('add', 'staged.json');
  writeFileSync(join(root, 'staged.json'), '{"editedAgain":true}');
  writeFileSync(join(root, 'unstaged.json'), '{}');
  writeFileSync(join(root, 'untracked path.json'), '{}');
  writeFileSync(join(root, 'ignored.txt'), 'ignored');
  execFileSync('git', ['rm', 'delete.json'], {cwd: root, stdio: 'ignore'});
  const paths = changedPaths(root, base);
  for (const path of ['new.json', 'old.json', 'delete.json', 'staged.json', 'unstaged.json', 'untracked path.json'])
    assert.ok(paths.includes(path), `Missing ${path}`);
  assert.ok(!paths.includes('ignored.txt'));
  assert.throws(() => changedPaths(root, 'origin/absent'), /fetch complete integration history/);
});

test('uncommitted authorable files require review and a scoped record satisfies the local gate', async t => {
  const root = mkdtempSync(join(tmpdir(), 'catalogue-impact-git-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  git('init');
  git('config', 'user.name', 'Catalogue test');
  git('config', 'user.email', 'catalogue@example.invalid');
  writeFileSync(join(root, 'README.md'), 'base');
  git('add', '.');
  git('commit', '-m', 'base');
  const base = git('rev-parse', 'HEAD');
  mkdirSync(join(root, 'dist/src/domain'), {recursive: true});
  writeFileSync(join(root, 'dist/src/domain/new-rule.js'), 'export const rule = true;');
  const paths = changedPaths(root, base);
  const data = await catalogue();
  assert.ok(validateImpact(paths, [], data).some(error => error.includes('dist/src/domain/new-rule.js')));
  const review = {
    format: 1,
    changes: [
      {
        paths: ['dist/src/domain/new-rule.js'],
        entries: ['mechanic:guardian-counterplay'],
        disposition: 'no-semantic-impact',
        reason: 'Temporary fixture demonstrates a scoped pre-commit review record.',
        evidence: ['tests/catalogue.test.mjs'],
      },
    ],
  };
  assert.deepEqual(validateImpact(paths, [review], data), []);
});

test('freshness checker rejects missing entries and edited generated facts despite valid JSON', async () => {
  const expected = await output();
  const actual = {...expected};
  const data = JSON.parse(actual['content/catalogue/catalogue.json']);
  data.entries.pop();
  actual['content/catalogue/catalogue.json'] = JSON.stringify(data);
  assert.ok(validateGenerated(expected, path => actual[path]).some(error => error.includes('catalogue.json')));
  actual['content/catalogue/facts.json'] = '{}';
  delete actual['content/catalogue/INDEX.md'];
  assert.equal(validateGenerated(expected, path => actual[path]).length, 3);
});
