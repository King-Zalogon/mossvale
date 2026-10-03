import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';

export const ART_JOB_FORMAT = 1;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateArtJob(job) {
  const errors = [];
  if (!job || job.format !== ART_JOB_FORMAT) errors.push('format must be 1');
  if (!ID.test(job?.id ?? '')) errors.push('id must be lowercase kebab-case');
  if (typeof job?.subject !== 'string' || !job.subject.trim()) errors.push('subject is required');
  if (!Array.isArray(job?.targets) || !job.targets.length || job.targets.some(target => typeof target !== 'string' || !target.trim())) {
    errors.push('targets must be a non-empty list of pose or view names');
  }
  if (job?.references !== undefined && (!Array.isArray(job.references) || job.references.some(path => typeof path !== 'string' || !path.trim()))) {
    errors.push('references must be a list of file paths');
  }
  if (!job?.requirements || typeof job.requirements !== 'object' || Array.isArray(job.requirements)) errors.push('requirements must be an object');
  if (job?.retryLimit !== undefined && (!Number.isInteger(job.retryLimit) || job.retryLimit < 0 || job.retryLimit > 3))
    errors.push('retryLimit must be an integer from 0 to 3');
  return errors;
}

export function makeManualHandoff(job, sourcePath) {
  const errors = validateArtJob(job);
  if (errors.length) throw new Error(errors.join('\n'));
  const source = resolve(sourcePath);
  const digest = createHash('sha256').update(readFileSync(source)).digest('hex');
  return {
    format: 1,
    job: job.id,
    subject: job.subject,
    targets: [...job.targets],
    references: (job.references ?? []).map(path => ({
      path,
      sha256: createHash('sha256')
        .update(readFileSync(resolve(dirname(source), path)))
        .digest('hex'),
    })),
    requirements: structuredClone(job.requirements),
    retryLimit: job.retryLimit ?? 0,
    source: {path: source, sha256: digest},
    adapter: 'manual',
    status: 'awaiting-artwork',
    attempts: 0,
    createdAt: new Date().toISOString(),
  };
}

export function runMockAdapter(handoff, {maxAttempts = (handoff.retryLimit ?? 0) + 1, result = {files: []}} = {}) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) throw new Error('maxAttempts must be an integer from 1 to 3');
  const attempts = Math.min(maxAttempts, (handoff.attempts ?? 0) + 1);
  const failed = result.error !== undefined;
  return {
    ...handoff,
    adapter: 'mock',
    attempts,
    status: failed ? 'failed' : 'completed',
    result: failed ? {error: String(result.error).slice(0, 500)} : structuredClone(result),
  };
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeJson(path, value) {
  const output = resolve(path);
  mkdirSync(dirname(output), {recursive: true});
  writeFileSync(output, JSON.stringify(value, null, 2) + '\n', {flag: 'wx'});
}
