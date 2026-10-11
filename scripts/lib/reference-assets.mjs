import {createHash} from 'node:crypto';
import {lstatSync, readFileSync, realpathSync, statSync} from 'node:fs';
import {relative, resolve, sep, isAbsolute} from 'node:path';
import {safePath} from './catalogue.mjs';

const SUBJECT = /^[a-z][a-z0-9 -]{0,39}$/;
export const MAX_REFERENCE_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_REFERENCE_EXPORT_BYTES = 16 * 1024 * 1024;

export function safeReferencePath(root, path) {
  const full = safePath(root, path);
  let current = realpathSync(root);
  const parts = relative(current, full).split(sep);
  for (const part of parts) {
    current = resolve(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new Error(`Reference paths cannot contain symlinks: ${path}`);
  }
  const rel = relative(realpathSync(root), current);
  if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error(`Reference path escapes repository: ${path}`);
  return full;
}

export function createReferenceIndex(registry, {root, registryPath}) {
  if (registry?.format !== 1 || !Array.isArray(registry.assets) || !/^[a-z0-9-]+$/.test(registry.id ?? ''))
    throw new Error('Invalid reference asset registry.');
  if (
    !registry.libraryPath ||
    !registry.sourceName ||
    !registry.creator ||
    !registry.license ||
    !registry.licenseUrl?.startsWith('https://') ||
    !registry.retrievedOn ||
    !registry.permissions ||
    !Array.isArray(registry.limits)
  )
    throw new Error(`Reference asset registry is missing shared provenance: ${registryPath}`);
  const records = registry.assets.map(asset => {
    if (
      !/^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(asset.id ?? '') ||
      !Array.isArray(asset.subjects) ||
      !asset.subjects.length ||
      asset.subjects.some(tag => !SUBJECT.test(tag))
    )
      throw new Error(`Invalid reference asset ID or subject tags in ${registryPath}: ${asset.id}`);
    if (
      !asset.name ||
      !asset.source?.startsWith('https://') ||
      !asset.description ||
      !/^[a-f0-9]{64}$/.test(asset.sha256 ?? '') ||
      !Array.isArray(asset.dimensions) ||
      asset.dimensions.length !== 2 ||
      asset.dimensions.some(value => !Number.isInteger(value) || value < 1)
    )
      throw new Error(`Reference asset is missing identity, source, description, SHA-256 or valid dimensions: ${asset.id}`);
    const path = `${registry.libraryPath}/${asset.path}`;
    const file = safeReferencePath(root, path);
    if (statSync(file).size > MAX_REFERENCE_FILE_BYTES)
      throw new Error(`Reference exceeds the per-file size limit (${MAX_REFERENCE_FILE_BYTES} bytes): ${path}`);
    const bytes = readFileSync(file);
    const actualHash = createHash('sha256').update(bytes).digest('hex');
    if (actualHash !== asset.sha256) throw new Error(`Reference asset hash mismatch: ${path}`);
    if (
      bytes.length < 24 ||
      bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
      bytes.readUInt32BE(16) !== asset.dimensions[0] ||
      bytes.readUInt32BE(20) !== asset.dimensions[1]
    )
      throw new Error(`Reference asset is not the registered PNG with matching dimensions: ${path}`);
    const subjects = [...new Set(asset.subjects)].sort((a, b) => a.localeCompare(b, 'en'));
    const id = `reference:${asset.id}`;
    const license = registry.license;
    return {
      id,
      recordType: 'reference',
      kind: 'reference',
      name: asset.name,
      summary: asset.description,
      status: 'reference-only',
      scope: 'local-authoring',
      appearance: subjects.join(', '),
      tags: subjects,
      elements: [],
      sourceName: registry.sourceName,
      source: asset.source,
      creator: registry.creator,
      license,
      licenseUrl: registry.licenseUrl,
      attribution: registry.attribution,
      retrievedOn: registry.retrievedOn,
      permissions: registry.permissions,
      sha256: asset.sha256,
      dimensions: asset.dimensions,
      subjects,
      limits: registry.limits,
      preview: {path, description: asset.description},
      searchable: [id, asset.name, asset.description, ...subjects, registry.sourceName, registry.creator, license].join(' ').toLocaleLowerCase('en'),
      runtimeId: null,
      sourceNotes: asset.sourceNotes,
    };
  });
  if (new Set(records.map(item => item.id)).size !== records.length) throw new Error(`Duplicate reference IDs in ${registryPath}`);
  return records.sort((a, b) => a.id.localeCompare(b.id, 'en'));
}
