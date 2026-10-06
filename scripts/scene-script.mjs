#!/usr/bin/env node
/* Validate narrative-intent handoffs against the local Mossvale capability catalogue. */
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import Ajv from 'ajv';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schema = JSON.parse(readFileSync(resolve(root, 'content/scene-scripts/schema.json'), 'utf8'));
const ajv = new Ajv({allErrors: true, strict: false});
const validateShape = ajv.compile(schema);
const loadJson = path => JSON.parse(readFileSync(resolve(path), 'utf8'));

function addUniqueErrors(values, path, errors) {
  const seen = new Set();
  for (const [index, item] of values.entries()) {
    if (!item?.id) continue;
    if (seen.has(item.id)) errors.push(`${path}[${index}].id duplicates ${item.id}`);
    seen.add(item.id);
  }
}

export function validateSceneScript(script, catalogue) {
  const errors = [];
  const warnings = [];
  if (!validateShape(script)) errors.push(...validateShape.errors.map(error => `${error.instancePath || '/'} ${error.message}`));
  if (!catalogue || catalogue.format !== 1 || !Array.isArray(catalogue.entries)) errors.push('catalogue must be format 1 with an entries array');
  if (!script || !catalogue?.entries) return {errors, warnings, gapReport: makeGapReport(script)};
  if (script.catalogueSourceRevision !== catalogue.sourceRevision)
    errors.push(`catalogueSourceRevision ${script.catalogueSourceRevision} does not match catalogue ${catalogue.sourceRevision}`);

  const entries = new Map(catalogue.entries.map(entry => [entry.id, entry]));
  const requirements = script.requirements ?? [];
  const participants = script.participants ?? [];
  const beats = script.beats ?? [];
  for (const field of ['participants', 'uses', 'beats', 'requirements']) addUniqueErrors(script[field] ?? [], `/${field}`, errors);
  addUniqueErrors(script.continuityIn?.characters ?? [], '/continuityIn/characters', errors);
  addUniqueErrors(script.continuityIn?.flags ?? [], '/continuityIn/flags', errors);
  addUniqueErrors(script.continuityIn?.canonicalFacts ?? [], '/continuityIn/canonicalFacts', errors);
  addUniqueErrors(script.continuityOut?.characters ?? [], '/continuityOut/characters', errors);
  addUniqueErrors(script.continuityOut?.flags ?? [], '/continuityOut/flags', errors);
  addUniqueErrors(script.continuityOut?.canonicalFacts ?? [], '/continuityOut/canonicalFacts', errors);

  const checkResource = (id, path, acceptedKinds = null, allowNonAvailable = false) => {
    const entry = entries.get(id);
    if (!entry) {
      errors.push(`${path} references unknown catalogue ID ${id}; new requests belong in requirements`);
      return null;
    }
    const namespace = id?.split(':', 1)[0];
    if (acceptedKinds && !acceptedKinds.includes(namespace)) errors.push(`${path} expects ${acceptedKinds.join(' or ')} ID but ${id} uses ${namespace}`);
    if (entry.status === 'removed' || entry.status === 'deprecated') errors.push(`${path} cannot select ${id} (${entry.status})`);
    if (!allowNonAvailable && !['available', 'experimental'].includes(entry.status))
      errors.push(`${path} selects ${id} with status ${entry.status}; proposed capabilities belong in requirements`);
    return entry;
  };

  checkResource(script.setting?.biomeId, '/setting/biomeId', ['biome']);
  if (script.setting?.mapId) checkResource(script.setting.mapId, '/setting/mapId', ['map']);
  for (const [index, participant] of participants.entries())
    checkResource(participant.resourceId, `/participants/${index}/resourceId`, ['visual', 'actor', 'species', 'landmark']);
  for (const [index, use] of (script.uses ?? []).entries()) checkResource(use.resourceId, `/uses/${index}/resourceId`);
  for (const [index, item] of [...(script.continuityIn?.items ?? []), ...(script.continuityOut?.items ?? [])].entries())
    checkResource(item.resourceId, `/continuity/items/${index}/resourceId`, ['item']);

  const participantIds = new Set(participants.map(participant => participant.id));
  for (const [index, beat] of beats.entries()) {
    if (beat.speaker && !participantIds.has(beat.speaker)) errors.push(`/beats/${index}/speaker references missing participant ${beat.speaker}`);
    if (beat.type === 'dialogue' && (!beat.speaker || !beat.text || !beat.advance))
      errors.push(`/beats/${index} dialogue needs a known speaker, text, and advance intent`);
    if (beat.advance === 'timed' && !beat.durationHint)
      errors.push(`/beats/${index} timed advance needs a durationHint; use manual advance if no timing has been tested`);
  }

  const requirementIds = new Set(requirements.map(requirement => requirement.id));
  for (const [index, requirement] of requirements.entries()) {
    if (requirement.capabilityId) {
      const entry = checkResource(requirement.capabilityId, `/requirements/${index}/capabilityId`, null, true);
      if (entry?.status === 'available')
        errors.push(`/requirements/${index}/capabilityId names an available capability; classify it as a selected use or configuration request`);
    }
    for (const dependency of requirement.dependsOn ?? [])
      if (!requirementIds.has(dependency)) errors.push(`/requirements/${index}/dependsOn references missing requirement ${dependency}`);
  }

  const incomingFactIds = new Set((script.continuityIn?.canonicalFacts ?? []).map(fact => fact.id));
  const outgoingFacts = new Map((script.continuityOut?.canonicalFacts ?? []).map(fact => [fact.id, fact]));
  for (const fact of script.continuityIn?.canonicalFacts ?? []) {
    const carried = outgoingFacts.get(fact.id);
    if (!carried) errors.push(`/continuityOut/canonicalFacts must carry forward or resolve incoming canonical fact ${fact.id}`);
    else if (carried.status !== 'active' && !carried.resolution?.trim())
      errors.push(`/continuityOut/canonicalFacts/${fact.id} needs a resolution when marked ${carried.status}`);
  }
  for (const fact of script.continuityOut?.canonicalFacts ?? [])
    if (!incomingFactIds.has(fact.id)) warnings.push(`continuityOut adds canonical fact ${fact.id}; ensure its script beat establishes it`);
  const incomingFlags = new Map((script.continuityIn?.flags ?? []).map(flag => [flag.id, flag.value]));
  const outputFlags = new Map((script.continuityOut?.flags ?? []).map(flag => [flag.id, flag.value]));
  for (const id of incomingFlags.keys())
    if (!outputFlags.has(id)) errors.push(`/continuityOut/flags omits persistent incoming flag ${id}; retain its value or record an explicit transition`);
  for (const [id, value] of incomingFlags)
    if (outputFlags.has(id) && outputFlags.get(id) !== value && !(script.beats ?? []).some(beat => beat.expectedResult?.includes(id)))
      errors.push(`/continuityOut/flags changes ${id} without a beat documenting that transition`);

  return {errors, warnings, gapReport: makeGapReport(script)};
}

export function makeGapReport(script) {
  return {
    format: 1,
    sceneId: script?.id ?? null,
    catalogueSourceRevision: script?.catalogueSourceRevision ?? null,
    gaps: (script?.requirements ?? []).map(requirement => ({
      id: requirement.id,
      kind: requirement.kind,
      capabilityId: requirement.capabilityId ?? null,
      description: requirement.description,
      neededFor: requirement.neededFor,
      priority: requirement.priority,
      dependsOn: requirement.dependsOn ?? [],
    })),
    note: 'Gap reports record authoring work requested by the scene; they do not add capabilities to the catalogue or make the scene playable.',
  };
}

function main(args) {
  const [scriptPath, ...options] = args;
  if (!scriptPath) throw new Error('usage: node scripts/scene-script.mjs <scene.json> [--catalogue <catalogue.json>] [--report <gap-report.json>]');
  let cataloguePath = resolve(root, 'content/catalogue/catalogue.json');
  let reportPath = null;
  for (let index = 0; index < options.length; index++) {
    if (options[index] === '--catalogue') cataloguePath = options[++index];
    else if (options[index] === '--report') reportPath = options[++index];
    else throw new Error(`unknown option ${options[index]}`);
  }
  const script = loadJson(scriptPath);
  const result = validateSceneScript(script, loadJson(cataloguePath));
  const report = JSON.stringify(result.gapReport, null, 2) + '\n';
  if (reportPath) writeFileSync(resolve(reportPath), report, {flag: 'wx'});
  else process.stdout.write(report);
  for (const warning of result.warnings) console.warn(`warning: ${warning}`);
  if (result.errors.length) throw new Error(result.errors.join('\n'));
  console.error(`Valid scene handoff: ${script.id}; ${result.gapReport.gaps.length} requested gap(s)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
