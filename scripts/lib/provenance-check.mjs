import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {isAbsolute, relative, resolve, sep} from 'node:path';

const SHA256 = /^[a-f0-9]{64}$/;
const UNAVAILABLE = new Set(['unavailable', 'summary-only', 'available']);
const DIRECTIONS = new Set(['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']);

function safeFile(root, path, errors, where) {
  if (typeof path !== 'string' || !path || isAbsolute(path)) {
    errors.push(`${where}: path must be a repository-relative path`);
    return null;
  }
  const full = resolve(root, path);
  const fromRoot = relative(root, full);
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    errors.push(`${where}: path escapes the repository`);
    return null;
  }
  return full;
}

function checkHash(root, record, errors, where, {required = true} = {}) {
  if (!record || typeof record !== 'object') {
    if (required) errors.push(`${where}: file record is required`);
    return;
  }
  if (!SHA256.test(record.sha256 ?? '')) {
    errors.push(`${where}: expected a lowercase SHA-256 hex digest`);
    return;
  }
  const path = safeFile(root, record.path, errors, where);
  if (!path) return;
  let digest;
  try {
    digest = createHash('sha256').update(readFileSync(path)).digest('hex');
  } catch {
    errors.push(`${where}: file ${record.path} is missing or unreadable`);
    return;
  }
  if (digest !== record.sha256) errors.push(`${where}: SHA-256 mismatch for ${record.path}`);
}

function checkAvailability(record, errors, where) {
  if (!record || !UNAVAILABLE.has(record.status)) {
    errors.push(`${where}: status must be available, summary-only or unavailable`);
    return;
  }
  if (record.status === 'unavailable' && !record.reason?.trim()) errors.push(`${where}: unavailable history needs a reason`);
  if (record.status === 'summary-only' && !((record.summary || record.value) && record.evidence)) {
    errors.push(`${where}: summary-only history needs a value or summary and an evidence path`);
  }
  if (record.status === 'available' && !((record.value || record.summary || record.assetIds?.length) && (record.evidence || record.assetIds?.length))) {
    errors.push(`${where}: available history needs a value, summary or referenced asset IDs`);
  }
}

/** Check the auditable visual-identity records without inferring missing generation history. */
export function checkSubjectProvenance(registry, {root, assets, sourceMetadata}) {
  const errors = [];
  if (!Array.isArray(assets) || !Array.isArray(sourceMetadata?.assets)) return {errors: ['subjects.json: asset manifest metadata is malformed']};
  const manifest = new Map(assets.map(asset => [asset.name, asset]));
  const sourceByName = new Map(sourceMetadata.assets.map(asset => [asset.name, asset]));
  if (registry?.version !== 1 || !Array.isArray(registry.subjects)) return {errors: ['subjects.json: unsupported or malformed registry']};
  const ids = new Set();

  for (const subject of registry.subjects) {
    const where = `subject ${subject?.id ?? '(missing id)'}`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(subject?.id ?? '') || ids.has(subject.id)) errors.push(`${where}: stable kebab-case ID must be unique`);
    ids.add(subject?.id);
    if (!Number.isInteger(subject?.revision) || subject.revision < 1) errors.push(`${where}: revision must be a positive integer`);
    for (const field of ['silhouette', 'palette', 'distinguishingFeatures']) {
      const value = subject?.identity?.[field];
      if ((Array.isArray(value) && value.length === 0) || (typeof value === 'string' && !value.trim()) || value == null) {
        errors.push(`${where}: identity.${field} must describe the visible subject`);
      }
    }

    const generation = subject?.generation ?? {};
    for (const field of ['tool', 'provider', 'modelVersion', 'prompt', 'seed', 'generationReference', 'maskHashes']) {
      checkAvailability(generation[field], errors, `${where}: generation.${field}`);
    }

    checkHash(root, subject?.sourceNotes, errors, `${where}: source notes`);
    checkHash(root, subject?.sourceMetadata, errors, `${where}: source metadata`, {required: false});

    const canonicalReferences = subject?.canonicalReferences;
    if (!Array.isArray(canonicalReferences)) errors.push(`${where}: canonicalReferences must be an array`);
    const referenceIds = new Set();
    for (const [index, ref] of (Array.isArray(canonicalReferences) ? canonicalReferences : []).entries()) {
      const refWhere = `${where}: canonicalReferences[${index}]`;
      if (!ref?.basis && !ref?.assetId) errors.push(`${refWhere}: identify the approved asset or source-cell basis`);
      checkHash(root, ref, errors, refWhere);
      if (ref.assetId) {
        referenceIds.add(ref.assetId);
        if (!manifest.has(ref.assetId)) errors.push(`${refWhere}: unknown asset ID ${ref.assetId}`);
        if (ref.cell) {
          const source = sourceByName.get(ref.assetId);
          const expectedPath = source && `art/assets/${source.sheet}`;
          if (
            !source ||
            expectedPath !== ref.path ||
            source.cell.x !== ref.cell.x ||
            source.cell.y !== ref.cell.y ||
            source.width !== ref.cell.width ||
            source.height !== ref.cell.height
          ) {
            errors.push(`${refWhere}: source cell does not match art/assets/metadata.json for ${ref.assetId}`);
          }
        } else {
          const asset = manifest.get(ref.assetId);
          if (asset && ref.path !== `dist/${asset.src}`) errors.push(`${refWhere}: path does not match the asset manifest for ${ref.assetId}`);
        }
      }
    }
    if (!canonicalReferences?.length) errors.push(`${where}: at least one hashed canonical reference is required`);
    if (generation.generationReference?.status === 'available') {
      if (!Array.isArray(generation.generationReference.assetIds)) errors.push(`${where}: available generation references must list asset IDs`);
      for (const id of generation.generationReference.assetIds ?? []) {
        if (!referenceIds.has(id)) errors.push(`${where}: generation reference ${id} is not a hashed canonical reference`);
      }
    }

    const exports = subject?.exports;
    if (!Array.isArray(exports)) errors.push(`${where}: exports must be an array`);
    const exportIds = new Set();
    for (const [index, output] of (Array.isArray(exports) ? exports : []).entries()) {
      const outWhere = `${where}: exports[${index}]`;
      const asset = manifest.get(output?.assetId);
      if (!asset) errors.push(`${outWhere}: unknown exported asset ID ${output?.assetId}`);
      else if (output.path !== `dist/${asset.src}`) errors.push(`${outWhere}: path does not match the asset manifest for ${output.assetId}`);
      exportIds.add(output?.assetId);
      checkHash(root, output, errors, outWhere);
    }
    if (!exports?.length) errors.push(`${where}: at least one output hash is required`);

    const workflow = subject?.exportWorkflow;
    checkHash(root, workflow, errors, `${where}: exportWorkflow`);
    if (!workflow?.settings?.trim()) errors.push(`${where}: export settings must be recorded`);

    const sourceBatches = subject?.sourceBatches;
    if (!Array.isArray(sourceBatches)) errors.push(`${where}: sourceBatches must be an array`);
    const directions = new Set();
    for (const [index, batch] of (Array.isArray(sourceBatches) ? sourceBatches : []).entries()) {
      const batchWhere = `${where}: sourceBatches[${index}]`;
      if (!batch?.id) errors.push(`${batchWhere}: batch ID is required`);
      checkHash(root, batch, errors, batchWhere);
      if (!Array.isArray(batch?.directions)) errors.push(`${batchWhere}: directions must be an array`);
      for (const direction of Array.isArray(batch?.directions) ? batch.directions : []) {
        if (!DIRECTIONS.has(direction)) errors.push(`${batchWhere}: unknown direction ${direction}`);
        if (directions.has(direction)) errors.push(`${batchWhere}: duplicate direction ${direction}`);
        directions.add(direction);
      }
      if (!Array.isArray(batch?.referenceAssetIds)) errors.push(`${batchWhere}: referenceAssetIds must be an array`);
      for (const id of Array.isArray(batch?.referenceAssetIds) ? batch.referenceAssetIds : [])
        if (!referenceIds.has(id)) errors.push(`${batchWhere}: reference ${id} is not a canonical reference for this subject`);
      if (!Array.isArray(batch?.exportAssetIds)) errors.push(`${batchWhere}: exportAssetIds must be an array`);
      for (const id of Array.isArray(batch?.exportAssetIds) ? batch.exportAssetIds : [])
        if (!exportIds.has(id)) errors.push(`${batchWhere}: output ${id} is not recorded in this subject's exports`);
    }
    for (const direction of subject?.requiredDirections ?? [])
      if (!directions.has(direction)) errors.push(`${where}: required direction ${direction} has no source batch`);

    if (subject?.runtimeTreatments) {
      const treatments = subject.runtimeTreatments;
      if (!exportIds.has(treatments.assetId)) errors.push(`${where}: runtime treatment asset must resolve to a recorded export`);
      checkHash(root, {path: treatments.contractPath, sha256: treatments.contractSha256}, errors, `${where}: runtime treatment contract`);
      if (treatments.artPixelsChanged !== false) errors.push(`${where}: runtime treatments must state whether art pixels changed`);
      if (!Array.isArray(treatments.states)) errors.push(`${where}: runtime treatment states must be an array`);
      for (const state of Array.isArray(treatments.states) ? treatments.states : [])
        if (!['idle', 'travel', 'hit', 'capture'].includes(state)) errors.push(`${where}: unknown runtime treatment ${state}`);
      for (const state of treatments.requiredStates ?? [])
        if (!treatments.states?.includes(state)) errors.push(`${where}: required runtime treatment ${state} is missing`);
    }
  }
  return {errors};
}
