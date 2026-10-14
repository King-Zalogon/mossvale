import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {assessAdventure, renderReportJson, renderReportMarkdown} from '../scripts/lib/adventure-readiness.mjs';
import {packFileEntries} from '../dist/src/domain/pack.js';

const BASE = 'tests/fixtures/packs/the-fernling-at-dusk';
const roots = [];
test.after(() => roots.forEach(root => rmSync(root, {recursive: true, force: true})));

const read = (root, file) => JSON.parse(readFileSync(join(root, file), 'utf8'));
const write = (root, file, value) => writeFileSync(join(root, file), JSON.stringify(value, null, 2) + '\n');

/** Copies the valid pack, applies `edit(root)` and re-records the integrity hashes (unless `rehash` is false). */
function variant(edit = () => {}, {rehash = true} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'readiness-'));
  roots.push(root);
  cpSync(BASE, root, {recursive: true});
  edit(root);
  if (rehash) {
    const index = read(root, 'index.json');
    index.integrity = packFileEntries(index).map(({id, path}) => ({
      id,
      path,
      sha256: createHash('sha256')
        .update(readFileSync(join(root, path)))
        .digest('hex'),
    }));
    write(root, 'index.json', index);
  }
  return root;
}
const editMap = (root, fn) => {
  const map = read(root, 'maps/start.json');
  fn(map);
  write(root, 'maps/start.json', map);
};
const statusOf = (report, id) => report.checks.find(check => check.id === id).status;
const snapshot = root => {
  const walk = dir => readdirSync(dir, {withFileTypes: true}).flatMap(entry => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]));
  return Object.fromEntries(
    walk(root)
      .sort()
      .map(file => [file.slice(root.length), createHash('sha256').update(readFileSync(file)).digest('hex')]),
  );
};
const cli = (...args) => spawnSync(process.execPath, ['scripts/adventure-report.mjs', ...args], {encoding: 'utf8'});

test('a valid standalone pack passes every mechanical check and still lists what only a person can judge', () => {
  const report = assessAdventure(BASE);
  assert.equal(report.status, 'buildable');
  assert.deepEqual(report.errors, []);
  assert.deepEqual(
    report.checks.map(check => check.status),
    Array(7).fill('pass'),
  );
  assert.deepEqual(report.pack, {id: 'the-fernling-at-dusk', name: 'The Fernling at Dusk', contentVersion: 1});
  assert.deepEqual(
    report.manualReview.map(item => [item.id, item.status]),
    [
      ['story-meaning', 'not evaluated'],
      ['visual-composition', 'not evaluated'],
      ['encounter-enjoyment', 'not evaluated'],
    ],
  );
  assert.ok(report.notEvaluated.some(line => /Browser playthrough/.test(line)));
  const text = renderReportMarkdown(report);
  assert.match(text, /\*\*Status: buildable by mechanical checks\*\*/);
  assert.match(text, /does not say the adventure is good/);
  assert.match(text, /## Needs a human/);
});

test('the shipped Mossvale pack and the other fixture packs are buildable', () => {
  for (const folder of [
    'dist/maps',
    'tests/fixtures/packs/lantern-crossing',
    'tests/fixtures/packs/scene-quality-yard',
    'tests/fixtures/packs/bakery',
    'tests/fixtures/packs/hearth',
  ]) {
    const report = assessAdventure(folder);
    assert.equal(report.status, 'buildable', `${folder}: ${report.errors.map(error => error.message).join('; ')}`);
  }
});

test('an unknown asset blocks the build, names the map file and path, and stops dependent checks', () => {
  const root = variant(r => editMap(r, map => (map.landmarks[1].sprite = 'no-such-sprite')));
  const report = assessAdventure(root);
  assert.equal(report.status, 'blocked');
  assert.equal(statusOf(report, 'build'), 'fail');
  assert.equal(statusOf(report, 'routes'), 'skipped');
  assert.equal(statusOf(report, 'rewards'), 'skipped');
  const error = report.errors.find(item => /no-such-sprite/.test(item.message));
  assert.ok(error, JSON.stringify(report.errors));
  assert.equal(error.file, 'maps/start.json');
  assert.match(error.fix, /assets/i);
  assert.ok(error.why.length > 20);
});

test('a required place that cannot be walked to is blocked by the game compiler and the report names its file', () => {
  const root = variant(r =>
    editMap(r, map => {
      const [cx, cy] = map.landmarks.find(item => item.id === 'chest').at.map(Math.floor);
      const rows = map.terrain.map(row => [...row]);
      for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) if ((x !== cx || y !== cy) && rows[y]?.[x] !== undefined) rows[y][x] = 'w';
      map.terrain = rows.map(row => row.join(''));
    }),
  );
  const report = assessAdventure(root);
  const error = report.errors.find(item => /cannot be reached/.test(item.message));
  assert.ok(error, JSON.stringify(report.errors.map(item => item.message)));
  assert.equal(error.file, 'maps/start.json');
  assert.equal(error.check, 'build');
  assert.equal(statusOf(report, 'routes'), 'skipped');
});

test('a pack built for another save schema is reported as incompatible without hiding other checks', () => {
  const root = variant(r => {
    const index = read(r, 'index.json');
    index.requires.saveSchema = 99;
    write(r, 'index.json', index);
  });
  const report = assessAdventure(root);
  const error = report.errors.find(item => item.code === 'incompatible-content');
  assert.ok(error);
  assert.equal(error.file, 'index.json');
  assert.equal(error.path, 'requires.saveSchema');
  assert.match(error.fix, /never edit the numbers/);
  assert.equal(statusOf(report, 'compatibility'), 'fail');
});

test('a promised file that is missing, or JSON that does not parse, is named exactly', () => {
  const missing = variant(
    r => {
      const index = read(r, 'index.json');
      index.inventory = 'inventory.json';
      write(r, 'index.json', index);
    },
    {rehash: false},
  );
  const missingReport = assessAdventure(missing);
  assert.ok(missingReport.errors.some(item => item.code === 'file-missing' && item.file === 'inventory.json'));
  assert.equal(statusOf(missingReport, 'build'), 'skipped');

  const broken = variant(r => writeFileSync(join(r, 'story.json'), '{"format": 1,'), {rehash: false});
  const brokenReport = assessAdventure(broken);
  assert.ok(brokenReport.errors.some(item => item.code === 'file-invalid-json' && item.file === 'story.json'));
  assert.equal(brokenReport.status, 'blocked');
});

test('an edited file with a stale hash says how to refresh it and does not hide the other checks', () => {
  const root = variant(r => editMap(r, map => (map.name = 'Edited after the hashes were recorded')), {rehash: false});
  const report = assessAdventure(root);
  const error = report.errors.find(item => item.code === 'integrity-mismatch');
  assert.ok(error);
  assert.equal(error.file, 'maps/start.json');
  assert.match(error.fix, /refresh-manifest/);
  assert.equal(statusOf(report, 'build'), 'pass', 'the rest of the pack is still analysed');
});

test('a chest without its claim flag is stopped by the compiler; a repeatable scene reward is stopped by the report', () => {
  const noFlag = variant(r => editMap(r, map => delete map.landmarks.find(item => item.id === 'chest').flag));
  const first = assessAdventure(noFlag);
  assert.ok(first.errors.some(item => item.file === 'maps/start.json' && /persistence flag/.test(item.message)));

  const repeats = variant(r =>
    editMap(r, map => {
      map.triggers[0].events.push({id: 'free-coins', repeatable: true, actions: [{type: 'reward', coins: 5}]});
    }),
  );
  const report = assessAdventure(repeats);
  const error = report.errors.find(item => item.code === 'scene-reward-repeats');
  assert.ok(error, JSON.stringify(report.errors.map(item => item.message)));
  assert.deepEqual([error.file, error.path], ['maps/start.json', 'triggers[0].events[1]']);
  assert.match(error.fix, /repeatable: false/);

  const guarded = variant(r =>
    editMap(r, map => {
      map.triggers[0].events.push({
        id: 'one-gift',
        repeatable: true,
        when: {not: {flag: 'start.chest'}},
        actions: [
          {type: 'reward', coins: 5},
          {type: 'flag', flag: 'start.chest'},
        ],
      });
    }),
  );
  assert.equal(
    assessAdventure(guarded).errors.some(item => item.code === 'scene-reward-repeats'),
    false,
    'a reward guarded by its own flag is accepted',
  );
});

test('warning-only packs stay buildable and list the review they still need', () => {
  const root = variant(r => {
    const start = read(r, 'maps/start.json');
    start.exits = [{id: 'to-side', sprite: 'signpost-wood', at: [4, 5], w: 40, label: 'Visit the side yard', to: {map: 'side', spawn: 'camp'}}];
    write(r, 'maps/start.json', start);
    const side = structuredClone(start);
    side.id = 'side';
    side.name = 'Side yard';
    side.exits = [];
    side.landmarks = side.landmarks.filter(item => item.kind !== 'chest');
    side.triggers = [];
    write(r, 'maps/side.json', side);
    const index = read(r, 'index.json');
    index.maps.push('side');
    write(r, 'index.json', index);
  });
  const report = assessAdventure(root);
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors.map(item => item.message)));
  assert.equal(report.status, 'buildable');
  const warning = report.warnings.find(item => item.code === 'no-safe-return');
  assert.ok(warning, JSON.stringify(report.warnings.map(item => item.code)));
  assert.equal(warning.file, 'maps/start.json');
  assert.match(warning.fix, /intentionally one-way/);
  assert.ok(report.manualReview.some(item => item.status === 'needs review' && /no-safe-return/.test(item.id)));
  assert.match(renderReportMarkdown(report), /Warnings \(buildable, but a person should look\)/);
});

test('a map that no exit chain reaches is stopped by the progression check', () => {
  const root = variant(r => {
    const start = read(r, 'maps/start.json');
    const island = structuredClone(start);
    island.id = 'island';
    island.name = 'Island';
    island.landmarks = island.landmarks.filter(item => item.kind !== 'chest');
    island.triggers = [];
    write(r, 'maps/island.json', island);
    const index = read(r, 'index.json');
    index.maps.push('island');
    write(r, 'index.json', index);
  });
  const report = assessAdventure(root);
  assert.ok(
    report.errors.some(item => /can never be reached/.test(item.message)),
    JSON.stringify(report.errors.map(item => item.message)),
  );
});

test('reports are byte-identical across runs and contain no clocks or absolute paths', () => {
  const root = variant(r => editMap(r, map => (map.landmarks[1].sprite = 'no-such-sprite')));
  const once = renderReportJson(assessAdventure(root));
  const twice = renderReportJson(assessAdventure(root));
  assert.equal(once, twice);
  assert.equal(renderReportMarkdown(assessAdventure(root)), renderReportMarkdown(assessAdventure(root)));
  assert.doesNotMatch(once, new RegExp(root.replaceAll('\\', '\\\\')));
  assert.doesNotMatch(once, /\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(Object.keys(JSON.parse(once)), ['format', 'tool', 'pack', 'status', 'checks', 'errors', 'warnings', 'manualReview', 'notEvaluated']);
});

test('the command is read-only: the pack is byte-identical afterwards', () => {
  const root = variant(r => editMap(r, map => (map.landmarks[1].sprite = 'no-such-sprite')));
  const before = snapshot(root);
  assessAdventure(root);
  cli(root);
  cli(root, '--format', 'json');
  assert.deepEqual(snapshot(root), before);
});

test('exit codes: 0 buildable, 1 blocked, 2 bad usage, 3 warnings under --strict; --out never writes into the pack', () => {
  const valid = cli(BASE);
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /^# Adventure readiness/);
  const json = cli(BASE, '--format', 'json');
  assert.equal(JSON.parse(json.stdout).status, 'buildable');

  const blocked = variant(r => editMap(r, map => (map.landmarks[1].sprite = 'no-such-sprite')));
  assert.equal(cli(blocked).status, 1);

  assert.equal(cli().status, 2);
  assert.equal(cli('does-not-exist').status, 2);
  assert.equal(cli(BASE, '--format', 'xml').status, 2);
  assert.equal(cli(BASE, '--bogus').status, 2);

  const strict = cli('dist/maps', '--strict');
  assert.equal(strict.status, 3, 'the shipped pack has review warnings');
  assert.equal(cli('dist/maps').status, 0, 'warnings alone do not block');

  const inside = cli(blocked, '--out', join(blocked, 'report.md'));
  assert.equal(inside.status, 2);
  assert.match(inside.stderr, /outside the pack folder/);
  const outFile = join(mkdtempSync(join(tmpdir(), 'readiness-out-')), 'report.json');
  roots.push(join(outFile, '..'));
  assert.equal(cli(BASE, '--format', 'json', '--out', outFile).status, 0);
  assert.equal(statSync(outFile).isFile(), true);
});
