import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateSceneScript} from '../scripts/scene-script.mjs';
import {assessSceneBrief, checkSceneLayout, sceneProofReport} from '../scripts/lib/scene-quality.mjs';
import {verifySceneEvidence, buildSceneQualityReport} from '../scripts/scene-quality.mjs';

const json = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url)));
const scene = () => json('content/scene-scripts/examples/quality-yard.json');
const catalogue = json('content/catalogue/catalogue.json');

test('new scene brief links consequence to beats/resources; legacy stays valid but incomplete', () => {
  const script = scene();
  assert.deepEqual(validateSceneScript(script, catalogue).errors, []);
  assert.equal(assessSceneBrief(script).status, 'specified');
  delete script.sceneBrief;
  const legacy = validateSceneScript(script, catalogue);
  assert.deepEqual(legacy.errors, []);
  assert.equal(legacy.quality.status, 'incomplete');
  assert.ok(legacy.warnings.some(warning => warning.includes('quality incomplete')));
  const invalid = json('content/scene-scripts/examples/incomplete-scene.json');
  assert.ok(validateSceneScript(invalid, catalogue).errors.some(error => error.includes('payoff')));
  const missing = scene();
  missing.sceneBrief.consequence.beatIds = ['invented'];
  missing.sceneBrief.requiredResources = ['mechanic:invented'];
  assert.equal(assessSceneBrief(missing).errors.length, 2);
});

test('actual rectangle gate catches speaker/actor, control and text clipping at any scale', () => {
  const box = (left, top, right, bottom) => ({left, top, right, bottom});
  const frame = {
    viewport: box(0, 0, 390, 844),
    actorViewport: box(0, 0, 390, 400),
    panel: box(10, 250, 380, 390),
    required: {
      speaker: box(50, 150, 90, 210),
      player: box(150, 160, 185, 220),
      companion: box(195, 180, 235, 220),
      landmark: box(250, 180, 280, 220),
      objective: box(10, 440, 380, 470),
      text: box(20, 270, 370, 330),
      advance: box(290, 345, 370, 375),
    },
  };
  assert.deepEqual(checkSceneLayout(frame), []);
  for (const actor of ['speaker', 'player', 'companion', 'landmark', 'objective']) {
    const bad = structuredClone(frame);
    bad.required[actor] = box(20, 270, 100, 320);
    assert.ok(checkSceneLayout(bad).some(error => error.includes('obscured')));
  }
  for (const name of ['advance', 'text']) {
    const bad = structuredClone(frame);
    bad.required[name] = box(10, 380, 100, 410);
    assert.ok(checkSceneLayout(bad).some(error => error.includes(name === 'text' ? 'text' : 'advance')));
  }
  const clipped = structuredClone(frame);
  clipped.required.speaker = box(-2, 10, 40, 60);
  assert.ok(checkSceneLayout(clipped).some(error => error.includes('clipped')));
  const coveredText = structuredClone(frame);
  coveredText.textFragments = [box(300, 350, 350, 370)];
  assert.ok(checkSceneLayout(coveredText).some(error => error.includes('obscures dialogue text')));
});

test('technical-only proof never becomes reviewed readiness or owner approval', () => {
  const script = scene();
  const validation = validateSceneScript(script, catalogue);
  assert.equal(sceneProofReport(script, validation, {}, {}).readyForOwnerPlaytest, false);
  const evidence = {verified: true, realControls: true, reloadOnceReward: true, layoutPassed: true};
  const review = {
    visual: {status: 'pass', rationale: 'Reviewed actors, panel and controls in desktop/phone captures.'},
    narrative: {status: 'pass', rationale: 'Supplies are explicitly offered and useful to the road.'},
    ownerTaste: {status: 'deferred', reason: 'Owner has not played this teaching fixture.'},
  };
  const report = sceneProofReport(script, validation, evidence, review);
  assert.equal(report.readyForOwnerPlaytest, true);
  assert.equal(report.sceneApproved, false);
  review.narrative.status = 'incomplete';
  assert.equal(sceneProofReport(script, validation, evidence, review).readyForOwnerPlaytest, false);
  const forged = {format: 1, sceneScript: 'content/scene-scripts/examples/quality-yard.json', sourceHashes: {}, screenshots: [], realControls: true};
  assert.ok(verifySceneEvidence(forged.sceneScript, forged, {}).length >= 4, 'missing/revision-unbound evidence cannot pass');
});

test('retained rendered review is revision-bound and does not claim owner approval', () => {
  const evidence = json('docs/scene-quality/244/evidence.json');
  const review = json('docs/scene-quality/244/review.json');
  assert.deepEqual(verifySceneEvidence(evidence.sceneScript, evidence, review), []);
  const report = buildSceneQualityReport(evidence.sceneScript, evidence, review);
  assert.equal(report.readyForOwnerPlaytest, true);
  assert.equal(report.sceneApproved, false);
  const stale = structuredClone(evidence);
  stale.screenshots[0].sha256 = '0'.repeat(64);
  assert.ok(verifySceneEvidence(evidence.sceneScript, stale, review).some(error => error.includes('stale')));
});
