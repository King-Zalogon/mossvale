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
export function checkSubjectProvenance(registry, {root, assets, sourceMetadata, combatMetadata}) {
  const errors = [];
  if (!Array.isArray(assets) || !Array.isArray(sourceMetadata?.assets)) return {errors: ['subjects.json: asset manifest metadata is malformed']};
  const manifest = new Map(assets.map(asset => [asset.name, asset]));
  const sourceByName = new Map(sourceMetadata.assets.map(asset => [asset.name, asset]));
  let profileRegistry;
  let followerMetadata;
  try {
    profileRegistry = JSON.parse(readFileSync(resolve(root, 'art/characters/export-profiles.json'), 'utf8'));
    followerMetadata = JSON.parse(readFileSync(resolve(root, 'art/characters/creature-follower-metadata.json'), 'utf8'));
  } catch {
    return {errors: ['export-profiles.json: profile registry is missing or malformed']};
  }
  const profiles = profileRegistry?.schemaVersion === 1 ? profileRegistry.profiles : null;
  if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) errors.push('export-profiles.json: unsupported or malformed profile registry');
  const checkProfile = (profileId, profileSha256, asset, where) => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*-v\d+$/.test(profileId ?? '')) {
      errors.push(`${where}: a versioned export profile ID is required`);
      return;
    }
    const profile = profiles?.[profileId];
    if (!profile) {
      errors.push(`${where}: unknown export profile ${profileId}`);
      return;
    }
    if (typeof profile.category !== 'string' || !profile.category.trim()) errors.push(`${where}: export profile category is required`);
    if (profile.status?.startsWith('pending-')) errors.push(`${where}: pending profile ${profileId} cannot export runtime art`);
    const actualProfileHash = createHash('sha256').update(JSON.stringify(profile)).digest('hex');
    if (profileSha256 !== actualProfileHash) errors.push(`${where}: export profile ${profileId} settings hash is stale`);
    if (asset) {
      const compatible = {
        'player-motion': asset.kind === 'person' && asset.name === 'person-red-cap-motion',
        'npc-turnaround': asset.kind === 'person' && ['person-traveler', 'person-gardener'].includes(asset.name),
        'creature-combat': asset.kind === 'creature' && asset.name.endsWith('-combat'),
        'creature-follower': asset.kind === 'creature' && asset.name.endsWith('-follower'),
        'creature-portrait': asset.kind === 'creature' && !asset.name.endsWith('-combat'),
        prop: asset.kind === 'prop',
      }[profile.category];
      if (!compatible) errors.push(`${where}: profile category ${profile.category} does not match ${asset.name}`);
    }
  };
  for (const source of sourceMetadata.assets.filter(asset => asset.kind === 'prop')) {
    checkProfile(source.exportProfile?.id, source.exportProfile?.settingsSha256, manifest.get(source.name), `source metadata for ${source.name}`);
  }
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
      checkProfile(output?.profileId, output?.profileSha256, asset, outWhere);
      exportIds.add(output?.assetId);
      checkHash(root, output, errors, outWhere);
    }
    if (!exports?.length) errors.push(`${where}: at least one output hash is required`);

    const workflow = subject?.exportWorkflow;
    checkHash(root, workflow, errors, `${where}: exportWorkflow`);
    if (!workflow?.settings?.trim()) errors.push(`${where}: export settings must be recorded`);
    checkProfile(workflow?.profileId, workflow?.profileSha256, null, `${where}: exportWorkflow`);

    const sourceBatches = subject?.sourceBatches;
    if (!Array.isArray(sourceBatches)) errors.push(`${where}: sourceBatches must be an array`);
    const directions = new Set();
    const states = new Set();
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
      if (batch?.states !== undefined && !Array.isArray(batch.states)) errors.push(`${batchWhere}: states must be an array`);
      for (const state of Array.isArray(batch?.states) ? batch.states : []) {
        if (!['idle', 'attack', 'hit', 'faint', 'capture'].includes(state)) errors.push(`${batchWhere}: unknown combat state ${state}`);
        if (states.has(state)) errors.push(`${batchWhere}: duplicate combat state ${state}`);
        states.add(state);
      }
      if (!Array.isArray(batch?.referenceAssetIds)) errors.push(`${batchWhere}: referenceAssetIds must be an array`);
      for (const id of Array.isArray(batch?.referenceAssetIds) ? batch.referenceAssetIds : [])
        if (!referenceIds.has(id)) errors.push(`${batchWhere}: reference ${id} is not a canonical reference for this subject`);
      if (!Array.isArray(batch?.exportAssetIds)) errors.push(`${batchWhere}: exportAssetIds must be an array`);
      for (const id of Array.isArray(batch?.exportAssetIds) ? batch.exportAssetIds : [])
        if (!exportIds.has(id)) errors.push(`${batchWhere}: output ${id} is not recorded in this subject's exports`);
      if (batch?.generation) {
        for (const field of ['tool', 'provider', 'modelVersion', 'prompt', 'seed', 'generationReference', 'maskHashes']) {
          checkAvailability(batch.generation[field], errors, `${batchWhere}: generation.${field}`);
        }
        if (batch.generation.generationReference?.status === 'available') {
          for (const id of batch.generation.generationReference.assetIds ?? [])
            if (!referenceIds.has(id)) errors.push(`${batchWhere}: generation reference ${id} is not a canonical reference`);
        }
      }
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

    if (subject?.runtimeCombat) {
      const combat = subject.runtimeCombat;
      const combatAsset = manifest.get(combat.assetId);
      if (!exportIds.has(combat.assetId)) errors.push(`${where}: runtime combat asset must resolve to a recorded export`);
      if (!exportIds.has(combat.fallbackAssetId)) errors.push(`${where}: runtime combat fallback must resolve to a recorded export`);
      checkHash(root, {path: combat.contractPath, sha256: combat.contractSha256}, errors, `${where}: runtime combat contract`);
      if (!Array.isArray(combat.states)) errors.push(`${where}: runtime combat states must be an array`);
      if (!Array.isArray(combat.requiredStates)) errors.push(`${where}: required runtime combat states must be an array`);
      checkHash(root, combat.exportWorkflow, errors, `${where}: runtime combat export workflow`);
      if (!combat.exportWorkflow?.settings?.trim()) errors.push(`${where}: runtime combat export settings must be recorded`);
      checkProfile(combat.exportWorkflow?.profileId, combat.exportWorkflow?.profileSha256, combatAsset, `${where}: runtime combat export workflow`);
      for (const state of combat.requiredStates ?? []) {
        if (!combat.states?.includes(state)) errors.push(`${where}: required runtime combat state ${state} is missing`);
        if (!states.has(state)) errors.push(`${where}: required runtime combat state ${state} has no source batch`);
      }
      if (!combatAsset?.frames) errors.push(`${where}: runtime combat asset must declare animation frames in the manifest`);
      else if (JSON.stringify(combat.states) !== JSON.stringify(combatAsset.frames.rowOrder)) {
        errors.push(`${where}: runtime combat states must match the manifest frame row order`);
      }
      const speciesKey = subject.id?.replace(/^creature-/, '');
      const contractSource = combatMetadata?.sourceReferences?.[speciesKey];
      const contractSprite = combatMetadata?.sprites?.[combat.assetId];
      const combatExport = exports?.find(output => output.assetId === combat.assetId);
      if (combatExport?.profileId !== combat.exportWorkflow?.profileId) errors.push(`${where}: runtime combat export profile must match its output record`);
      if (!contractSource || !contractSprite) errors.push(`${where}: combat art must resolve in creature-combat-metadata.json`);
      else {
        if (contractSprite.output !== `dist/${combatAsset?.src}`) errors.push(`${where}: combat metadata output does not match the manifest`);
        if (contractSource.referenceAsset !== subject.id) errors.push(`${where}: combat generation reference must identify this subject`);
        if (JSON.stringify(combat.states) !== JSON.stringify(combatMetadata.frameOrder))
          errors.push(`${where}: runtime combat states must match the combat metadata frame order`);
        if (
          combatAsset?.frames &&
          (contractSprite.columns !== combatAsset.frames.columns ||
            contractSprite.rows !== combatAsset.frames.rows ||
            contractSprite.frame?.[0] !== combatAsset.frames.frameWidth ||
            contractSprite.frame?.[1] !== combatAsset.frames.frameHeight)
        ) {
          errors.push(`${where}: combat frame dimensions do not match the manifest`);
        }
        const sourceMetadataEntry = sourceByName.get(combat.assetId);
        if (!sourceMetadataEntry?.provenance?.originalGeneratedReferences?.includes(contractSource.generatedSource)) {
          errors.push(`${where}: editable source metadata does not link the generated combat source`);
        }
        if (!sourceBatches?.some(batch => batch.path === contractSource.generatedSource && batch.referenceAssetIds?.includes(contractSource.referenceAsset))) {
          errors.push(`${where}: generated combat source must be recorded as a referenced source batch`);
        }
      }
      if (combat.artPixelsChanged !== true) errors.push(`${where}: generated combat art must disclose that its pixels changed`);
    }

    if (subject?.runtimeFollower) {
      const follower = subject.runtimeFollower;
      const followerAsset = manifest.get(follower.assetId);
      const fallbackAsset = manifest.get(follower.fallbackAssetId);
      if (!exportIds.has(follower.assetId)) errors.push(`${where}: follower asset must resolve to a recorded export`);
      if (!exportIds.has(follower.fallbackAssetId)) errors.push(`${where}: follower fallback must resolve to a recorded export`);
      if (followerAsset?.frames?.columns !== 5 || followerAsset?.frames?.rows !== 8) errors.push(`${where}: follower atlas must declare a 5x8 frame grid`);
      if (!fallbackAsset || fallbackAsset.name !== subject.id) errors.push(`${where}: follower fallback must be the canonical portrait`);
      checkHash(root, {path: follower.contractPath, sha256: follower.contractSha256}, errors, `${where}: follower metadata`);
      checkHash(root, follower.exportWorkflow, errors, `${where}: follower export workflow`);
      checkProfile(follower.exportWorkflow?.profileId, follower.exportWorkflow?.profileSha256, followerAsset, `${where}: follower export workflow`);
      const speciesKey = subject.id?.replace(/^creature-/, '');
      const source = followerMetadata?.sourceReferences?.[speciesKey];
      const output = exports?.find(record => record.assetId === follower.assetId);
      const rowOrder = followerMetadata?.sheetRows?.[follower.assetId];
      if (!source || source.referenceAsset !== subject.id) errors.push(`${where}: follower source must reference the same creature identity`);
      if (!sourceBatches?.some(batch => batch.path === source?.generatedSource && batch.referenceAssetIds?.includes(subject.id)))
        errors.push(`${where}: generated follower source must be recorded as a referenced source batch`);
      if (output?.profileId !== follower.exportWorkflow?.profileId) errors.push(`${where}: follower export profile must match its output record`);
      if (!rowOrder || JSON.stringify(rowOrder) !== JSON.stringify(followerAsset?.frames?.rowOrder))
        errors.push(`${where}: follower row order must match the manifest and source metadata`);
      if (JSON.stringify(follower.directions) !== JSON.stringify([...DIRECTIONS])) errors.push(`${where}: follower contract must cover all eight directions`);
      if (JSON.stringify(follower.frameOrder) !== JSON.stringify(['idle', 'walk-1', 'walk-2', 'walk-3', 'walk-4']))
        errors.push(`${where}: follower contract must include idle and four walk frames`);
    }
  }
  return {errors};
}
