import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
import {importArtBatch, makeManualHandoff, runMockAdapter, submitComfyWorkflow, validateArtJob} from '../scripts/lib/art-jobs.mjs';
import {compileBrief, validateBrief} from '../scripts/compile-brief.mjs';
import {makeGapReport, validateSceneScript} from '../scripts/scene-script.mjs';

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

test('local ComfyUI submission and manual result import share the handoff contract', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mossvale-art-adapter-'));
  const server = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    assert.deepEqual(payload.extra_data.mossvale.targets, ['east-idle', 'east-walk-1']);
    response.writeHead(200, {'content-type': 'application/json'}).end(JSON.stringify({prompt_id: 'local-prompt-42'}));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const jobPath = join(root, 'job.json');
    const job = {
      format: 1,
      id: 'red-cap-east',
      subject: 'person-red-cap',
      targets: ['east-idle', 'east-walk-1'],
      requirements: {transparent: true},
      retryLimit: 2,
    };
    writeFileSync(jobPath, JSON.stringify(job));
    const handoff = makeManualHandoff(job, jobPath);
    const checkpoint = await submitComfyWorkflow(handoff, {1: {class_type: 'EmptyWorkflow'}}, {endpoint: `http://127.0.0.1:${server.address().port}`});
    assert.equal(checkpoint.status, 'queued');
    assert.equal(checkpoint.comfyui.promptId, 'local-prompt-42');

    const source = join(root, 'east-idle.png');
    const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from('fixture')]);
    writeFileSync(source, png);
    const manifest = {
      files: [
        {target: 'east-idle', path: source},
        {target: 'east-walk-1', path: source},
      ],
    };
    for (const adapter of ['manual', 'mock', 'comfyui-local']) {
      const imported = importArtBatch(handoff, manifest, join(root, `review-${adapter}`), {adapter});
      assert.equal(imported.status, 'imported-for-review');
      assert.equal(imported.files.length, 2);
      assert.equal(readFileSync(imported.files[0].path).toString(), png.toString());
    }
    assert.throws(() => importArtBatch(handoff, {files: [{target: 'east-idle', path: source}]}, join(root, 'missing-batch')), /exactly one image/);
    await assert.rejects(submitComfyWorkflow(handoff, {}, {endpoint: 'https://example.com'}), /localhost/);
  } finally {
    await new Promise(resolve => server.close(resolve));
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
    const preview = readFileSync(join(candidate, 'candidate-review.html'), 'utf8');
    assert.match(preview, /Brief-to-pack route review/);
    assert.match(preview, /Requested landmarks/);
    assert.match(preview, /generated maps are scaffolds/i);
    assert.throws(() => compileBrief(briefFile, candidate), /refusing to overwrite/);
    const invalidCandidate = join(root, 'invalid-candidate');
    assert.equal(existsSync(invalidCandidate), false);
    const invalidBriefFile = join(root, 'invalid.json');
    writeFileSync(invalidBriefFile, JSON.stringify({...brief, routes: [{...brief.routes[0], landmarks: []}]}));
    const malformedCandidate = join(root, 'malformed-candidate');
    const playableIndexBefore = readFileSync(join(candidate, 'index.json'), 'utf8');
    assert.throws(() => compileBrief(invalidBriefFile, malformedCandidate), /landmarks/);
    assert.equal(readFileSync(join(candidate, 'index.json'), 'utf8'), playableIndexBefore);
    assert.throws(() => compileBrief(briefFile, join(process.cwd(), 'dist', 'would-be-candidate')), /inside the repository/);
    assert.throws(() => readFileSync(malformedCandidate), /ENOENT/);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('scene script examples validate against the pinned catalogue and report unsupported extension work', () => {
  const catalogue = JSON.parse(readFileSync(new URL('../content/catalogue/catalogue.json', import.meta.url), 'utf8'));
  const supported = JSON.parse(readFileSync(new URL('../content/scene-scripts/examples/supported-yard-conversation.json', import.meta.url), 'utf8'));
  const extension = JSON.parse(readFileSync(new URL('../content/scene-scripts/examples/home-rest-extension-request.json', import.meta.url), 'utf8'));

  assert.deepEqual(validateSceneScript(supported, catalogue).errors, []);
  const extensionResult = validateSceneScript(extension, catalogue);
  assert.deepEqual(extensionResult.errors, []);
  assert.deepEqual(
    extensionResult.gapReport.gaps.map(gap => gap.kind),
    ['new-mechanic', 'new-art', 'new-mechanic'],
  );
  assert.match(extensionResult.gapReport.note, /do not add capabilities/);
  assert.deepEqual(makeGapReport(extension).gaps, extensionResult.gapReport.gaps);
});

test('scene script validation rejects stale/missing capabilities, invalid speakers and dropped continuity', () => {
  const catalogue = JSON.parse(readFileSync(new URL('../content/catalogue/catalogue.json', import.meta.url), 'utf8'));
  const supported = JSON.parse(readFileSync(new URL('../content/scene-scripts/examples/supported-yard-conversation.json', import.meta.url), 'utf8'));
  const invalid = structuredClone(supported);
  invalid.catalogueSourceRevision = '0000000000000000000000000000000000000000';
  invalid.uses.push({resourceId: 'mechanic:teleport-anywhere', purpose: 'bad ID'});
  invalid.beats[0].speaker = 'unknown-speaker';
  invalid.continuityIn.canonicalFacts.push({id: 'old-promise', statement: 'A promise made earlier.', status: 'active'});
  invalid.continuityIn.flags.push({id: 'gate-open', value: true});

  const {errors} = validateSceneScript(invalid, catalogue);
  assert.ok(errors.some(error => error.includes('does not match catalogue')));
  assert.ok(errors.some(error => error.includes('unknown catalogue ID mechanic:teleport-anywhere')));
  assert.ok(errors.some(error => error.includes('missing participant unknown-speaker')));
  assert.ok(errors.some(error => error.includes('must carry forward or resolve incoming canonical fact old-promise')));
  assert.ok(errors.some(error => error.includes('omits persistent incoming flag gate-open')));
});

test('scene script validation rejects silent use of proposed capabilities and untested timed dialogue', () => {
  const catalogue = JSON.parse(readFileSync(new URL('../content/catalogue/catalogue.json', import.meta.url), 'utf8'));
  const supported = JSON.parse(readFileSync(new URL('../content/scene-scripts/examples/supported-yard-conversation.json', import.meta.url), 'utf8'));
  const proposed = {...supported, uses: [...supported.uses, {resourceId: 'mechanic:timed-effects', purpose: 'Not implemented'}]};
  const timed = structuredClone(supported);
  timed.beats[0].advance = 'timed';

  assert.ok(validateSceneScript(proposed, catalogue).errors.some(error => error.includes('proposed capabilities belong in requirements')));
  assert.ok(validateSceneScript(timed, catalogue).errors.some(error => error.includes('needs a durationHint')));
});

test('scene continuity carries obligations through a three-scene handoff and resolves them once', () => {
  const catalogue = JSON.parse(readFileSync(new URL('../content/catalogue/catalogue.json', import.meta.url), 'utf8'));
  const base = JSON.parse(readFileSync(new URL('../content/scene-scripts/examples/supported-yard-conversation.json', import.meta.url), 'utf8'));
  const scene = (id, previousScene = null) => ({
    ...structuredClone(base),
    id,
    title: id,
    previousScene,
    participants: [
      {...base.participants[0], id: 'healer-wren', binding: {owner: 'npc', identityId: 'healer-wren', required: true}},
      {
        ...base.participants[1],
        id: 'yard-villager',
        binding: {owner: 'npc', identityId: 'yard-villager', required: false, fallbackResourceId: 'visual:person-red-cap-south'},
      },
    ],
  });
  const first = scene('continuity-one');
  first.continuityOut.obligations = [
    {id: 'missing-bell', kind: 'question', statement: 'Who rang the bell after dusk?', status: 'active', sourceSceneId: 'continuity-one'},
  ];
  first.continuityOut.relationships = [{id: 'wren-villager', from: 'healer-wren', to: 'yard-villager', state: 'trusting', sourceSceneId: 'continuity-one'}];
  first.continuityOut.intentionalUnknowns = [{id: 'bell-source', statement: 'The bell source is deliberately unknown.', sourceSceneId: 'continuity-one'}];
  const second = scene('continuity-two', {id: 'continuity-one', summary: 'The bell question remains open.'});
  second.continuityIn = structuredClone(first.continuityOut);
  second.continuityOut = structuredClone(second.continuityIn);
  second.continuityOut.obligations[0].status = 'advanced';
  second.continuityOut.obligations[0].statement = 'The bell rang after dusk, but its source is still unknown.';
  const third = scene('continuity-three', {id: 'continuity-two', summary: 'The bell question was investigated.'});
  third.continuityIn = structuredClone(second.continuityOut);
  third.continuityOut = structuredClone(third.continuityIn);
  third.continuityOut.obligations[0].status = 'resolved';
  third.continuityOut.obligations[0].resolution = 'The old yard bell was triggered by wind through the loose rope.';
  third.continuityOut.intentionalUnknowns = [];

  assert.deepEqual(validateSceneScript(first, catalogue).errors, []);
  assert.deepEqual(validateSceneScript(second, catalogue).errors, []);
  assert.deepEqual(validateSceneScript(third, catalogue).errors, []);
  assert.equal(third.continuityOut.obligations[0].status, 'resolved');
});

test('scene continuity rejects missing optional bindings and reintroduced obligations', () => {
  const catalogue = JSON.parse(readFileSync(new URL('../content/catalogue/catalogue.json', import.meta.url), 'utf8'));
  const supported = JSON.parse(readFileSync(new URL('../content/scene-scripts/examples/supported-yard-conversation.json', import.meta.url), 'utf8'));
  const invalid = structuredClone(supported);
  invalid.participants[0].binding = {owner: 'companion', identityId: 'fernling', required: false};
  invalid.continuityIn.obligations = [
    {
      id: 'old-promise',
      kind: 'promise',
      statement: 'Return the borrowed compass.',
      status: 'resolved',
      sourceSceneId: 'prior-scene',
      resolution: 'The compass was returned.',
    },
  ];
  invalid.continuityOut.obligations = [
    {id: 'old-promise', kind: 'promise', statement: 'Return the borrowed compass.', status: 'active', sourceSceneId: invalid.id},
  ];
  const {errors} = validateSceneScript(invalid, catalogue);
  assert.ok(errors.some(error => error.includes('requires fallbackResourceId')));
  assert.ok(errors.some(error => error.includes('reopens an incoming resolved obligation')));
});
