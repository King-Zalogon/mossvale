import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {makeManualHandoff, runMockAdapter, validateArtJob} from '../scripts/lib/art-jobs.mjs';
import {compileBrief, validateBrief} from '../scripts/compile-brief.mjs';

test('art job handoff validates targets and preserves source provenance', () => {
  const root = mkdtempSync(join(tmpdir(), 'mossvale-art-job-'));
  try {
    const jobPath = join(root, 'job.json');
    writeFileSync(join(root, 'pose.png'), 'source image bytes');
    const job = {
      format: 1,
      id: 'red-cap-east',
      subject: 'person-red-cap',
      targets: ['east-idle'],
      references: ['pose.png'],
      requirements: {transparent: true},
      retryLimit: 2,
    };
    writeFileSync(jobPath, JSON.stringify(job));
    assert.deepEqual(validateArtJob(job), []);
    const handoff = makeManualHandoff(job, jobPath);
    assert.equal(handoff.status, 'awaiting-artwork');
    assert.match(handoff.references[0].sha256, /^[a-f0-9]{64}$/);
    const done = runMockAdapter(handoff, {result: {files: ['east.png']}});
    assert.equal(done.status, 'completed');
    assert.equal(done.attempts, 1);
    assert.throws(() => runMockAdapter(handoff, {maxAttempts: 9}), /maxAttempts/);
    assert.match(validateArtJob({...job, targets: []}).join(' '), /targets/);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('structured adventure briefs compile to an isolated validated candidate and refuse overwrite', () => {
  const root = mkdtempSync(join(tmpdir(), 'mossvale-brief-'));
  try {
    const briefFile = join(root, 'brief.json');
    const candidate = join(root, 'candidate');
    const brief = {
      format: 1,
      id: 'willow-hollow',
      name: 'Willow Hollow',
      biome: 'meadow',
      routes: [
        {id: 'start', name: 'First Steps', landmarks: ['camp'], speciesRoles: ['starter']},
        {id: 'old-mill', name: 'Old Mill', landmarks: ['mill'], speciesRoles: ['guardian']},
      ],
      goals: ['find the mill'],
      ending: 'return to camp',
      revision: 3,
    };
    writeFileSync(briefFile, JSON.stringify(brief));
    assert.deepEqual(validateBrief(brief), []);
    assert.match(validateBrief({...brief, id: 'Bad'}).join(' '), /lowercase kebab-case/);
    compileBrief(briefFile, candidate);
    const index = JSON.parse(readFileSync(join(candidate, 'index.json'), 'utf8'));
    assert.deepEqual(index.maps, ['start', 'old-mill']);
    assert.match(JSON.parse(readFileSync(join(candidate, 'brief.json'), 'utf8')).content.ending, /camp/);
    assert.throws(() => compileBrief(briefFile, candidate), /refusing to overwrite/);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});
