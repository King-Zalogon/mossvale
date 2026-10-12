#!/usr/bin/env node
/* Verify local, revision-bound rendered evidence before producing a builder handoff. */
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {validateSceneScript} from './scene-script.mjs';
import {sceneProofReport, checkSceneLayout} from './lib/scene-quality.mjs';
import {ROOT, safePath} from './lib/catalogue.mjs';

export const fileHash = path =>
  createHash('sha256')
    .update(readFileSync(safePath(ROOT, path)))
    .digest('hex');

export function verifySceneEvidence(scriptPath, evidence, review) {
  const errors = [];
  if (evidence?.format !== 1 || evidence.sceneScript !== scriptPath) errors.push('evidence must identify the exact scene script');
  if (review?.evidenceSha256 !== createHash('sha256').update(JSON.stringify(evidence)).digest('hex'))
    errors.push('visual/content review is stale or not bound to this evidence');
  const sources = evidence?.sourceHashes ?? {};
  for (const path of [
    'content/scene-scripts/schema.json',
    'dist/src/controller.js',
    'dist/src/main.js',
    'dist/src/render/sprites.js',
    'dist/src/ui/speech.js',
    'dist/src/render/world.js',
    'dist/style.css',
  ])
    if (!sources[path]) errors.push(`missing runtime/contract source binding ${path}`);
  if (!sources[scriptPath] || !Object.keys(sources).some(path => path.startsWith('tests/fixtures/packs/') && path.endsWith('/index.json')))
    errors.push('evidence must bind scene script and authored pack sources');
  for (const [path, expected] of Object.entries(sources)) {
    try {
      if (fileHash(path) !== expected) errors.push(`stale source ${path}`);
    } catch {
      errors.push(`unsafe or missing source ${path}`);
    }
  }
  for (const path of Object.keys(sources).filter(path => path.startsWith('tests/fixtures/packs/') && path.endsWith('/index.json'))) {
    try {
      const index = JSON.parse(readFileSync(safePath(ROOT, path)));
      for (const file of index.integrity ?? []) {
        const owned = path.slice(0, -'index.json'.length) + file.path;
        if (sources[owned] !== file.sha256) errors.push(`pack evidence omits or mismatches ${owned}`);
      }
    } catch {
      errors.push(`invalid pack binding ${path}`);
    }
  }
  const captures = evidence?.screenshots ?? [];
  for (const [name, minimum] of [
    ['desktop', 1000],
    ['phone', 320],
  ]) {
    const cases = captures.filter(
      capture => capture.viewport?.name === name && capture.viewport.width >= minimum && (name !== 'phone' || capture.viewport.width <= 400),
    );
    if (!cases.length) errors.push(`missing ${name} runtime screenshots`);
    if (!cases.some(capture => capture.phase === 'dialogue')) errors.push(`missing ${name} dialogue capture`);
  }
  for (const capture of captures) {
    try {
      if (fileHash(capture.path) !== capture.sha256) errors.push(`stale screenshot ${capture.path}`);
    } catch {
      errors.push(`unsafe or missing screenshot ${capture.path}`);
    }
    if (!capture.layout || checkSceneLayout(capture.layout).length) errors.push(`layout failed in ${capture.path}`);
    for (const name of capture.phase === 'dialogue'
      ? ['speaker', 'player', 'companion', 'landmark', 'text', 'advance', 'objective']
      : ['player', 'companion', 'landmark', 'objective'])
      if (!capture.layout?.required?.[name]) errors.push(`capture omits ${name} bounds: ${capture.path}`);
  }
  return errors;
}

export function buildSceneQualityReport(scriptPath, evidence, review) {
  const script = JSON.parse(readFileSync(safePath(ROOT, scriptPath)));
  const validation = validateSceneScript(script, JSON.parse(readFileSync(resolve(ROOT, 'content/catalogue/catalogue.json'))));
  const errors = verifySceneEvidence(scriptPath, evidence, review);
  return sceneProofReport(script, validation, {...evidence, verified: !errors.length, findings: errors}, review);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [script, evidence, review, out] = process.argv.slice(2);
    if (!script || !evidence || !review || !out || process.argv.length !== 6)
      throw new Error('usage: node scripts/scene-quality.mjs <scene.json> <evidence.json> <review.json> <new-report.json>');
    const report = buildSceneQualityReport(script, JSON.parse(readFileSync(evidence)), JSON.parse(readFileSync(review)));
    writeFileSync(out, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
    if (!report.readyForOwnerPlaytest) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
