import test from 'node:test';
import assert from 'node:assert/strict';
import {STAGES, evaluateEvidence, markdownSummary, onlyHandoffPaths, parseGateArgs} from '../scripts/lib/gate.mjs';

const passing = () => ({
  sha: 'a'.repeat(40),
  baseSha: 'b'.repeat(40),
  node: 'v22',
  os: 'linux x64',
  stages: STAGES.map(({name}) => ({name, status: 'pass', ms: 1000})),
});

test('a complete passing record is accepted', () => {
  assert.deepEqual(evaluateEvidence(passing()), {ok: true, problems: [], skipped: []});
});

test('failed, missing, not-run and malformed records are rejected', () => {
  const failed = passing();
  failed.stages[1].status = 'fail';
  assert.match(evaluateEvidence(failed).problems[0], /lint: fail/);
  const missing = passing();
  missing.stages.pop();
  assert.match(evaluateEvidence(missing).problems[0], /audit: missing/);
  const partial = passing();
  partial.stages[5] = {name: 'art', status: 'not-run', reason: 'not selected (partial run)'};
  assert.equal(evaluateEvidence(partial).ok, false);
  assert.equal(evaluateEvidence(null).ok, false);
});

test('skips need a real reason and only skippable stages may be skipped', () => {
  const record = passing();
  record.stages[5] = {name: 'art', status: 'skipped', reason: 'docs-only change, no art or asset paths touched'};
  assert.deepEqual(
    evaluateEvidence(record).skipped.map(skip => skip.name),
    ['art'],
  );
  record.stages[5].reason = ' ';
  assert.match(evaluateEvidence(record).problems[0], /without a reason/);
  const lint = passing();
  lint.stages[1] = {name: 'lint', status: 'skipped', reason: 'because I wanted to'};
  assert.match(evaluateEvidence(lint).problems[0], /cannot be skipped/);
});

test('earlier evidence stays valid only across handoff-only commits', () => {
  assert.equal(onlyHandoffPaths(['docs/handoffs/evidence/abc.json', 'docs/handoffs/INDEX.md']), true);
  assert.equal(onlyHandoffPaths(['docs/handoffs/x.md', 'dist/src/main.js']), false);
  assert.equal(onlyHandoffPaths([]), true);
});

test('argument parsing validates stages, reasons and unskippable stages', () => {
  assert.deepEqual(parseGateArgs(['--skip', 'art', '--reason', 'no art changed']).errors, []);
  assert.match(parseGateArgs(['--skip', 'art']).errors[0], /needs --reason/);
  assert.match(parseGateArgs(['--skip', 'lint', '--reason', 'nope']).errors.join(), /cannot be skipped/);
  assert.match(parseGateArgs(['--skip', 'ghost', '--reason', 'x']).errors[0], /unknown stage/);
  assert.deepEqual(parseGateArgs(['--only', 'unit,lint']).only, ['unit', 'lint']);
  assert.match(parseGateArgs(['--bogus']).errors[0], /unknown argument/);
});

test('summary lists every stage', () => {
  const text = markdownSummary(passing());
  for (const {name} of STAGES) assert.match(text, new RegExp(`\\| ${name} \\|`));
});
