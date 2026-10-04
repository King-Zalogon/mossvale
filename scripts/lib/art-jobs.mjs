import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, mkdirSync, copyFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';

export const ART_JOB_FORMAT = 1;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

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
  if (Array.isArray(job?.targets) && job.targets.length > 32) errors.push('targets may contain at most 32 items per batch');
  return errors;
}

function localEndpoint(endpoint) {
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname) || url.username || url.password)
    throw new Error('ComfyUI endpoint must be an explicit localhost URL');
  url.pathname = `${url.pathname.replace(/\/$/, '')}/prompt`;
  return url;
}

export async function submitComfyWorkflow(handoff, workflow, {endpoint, fetchImpl = fetch, timeoutMs = 5000} = {}) {
  if (!handoff?.job || !Array.isArray(handoff.targets) || !workflow || typeof workflow !== 'object' || Array.isArray(workflow))
    throw new Error('a handoff and ComfyUI workflow object are required');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new Error('timeoutMs must be from 1 to 30000');
  const url = localEndpoint(endpoint);
  let error = 'ComfyUI request failed';
  const attempts = Math.min(3, Math.max(1, (handoff.retryLimit ?? 0) + 1));
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          prompt: workflow,
          client_id: `mossvale-${handoff.job}`,
          extra_data: {mossvale: {job: handoff.job, subject: handoff.subject, targets: handoff.targets, requirements: handoff.requirements}},
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`ComfyUI returned HTTP ${response.status}`);
      const queued = await response.json();
      if (typeof queued.prompt_id !== 'string' || !queued.prompt_id) throw new Error('ComfyUI response is missing prompt_id');
      return {...handoff, adapter: 'comfyui-local', status: 'queued', attempts: attempt, comfyui: {endpoint: url.origin, promptId: queued.prompt_id}};
    } catch (caught) {
      error = String(caught?.message ?? caught).slice(0, 500);
    }
  }
  return {...handoff, adapter: 'comfyui-local', status: 'failed', attempts, result: {error}};
}

export function importArtBatch(handoff, manifest, outputDirectory, {adapter = 'manual'} = {}) {
  if (!handoff?.job || !Array.isArray(handoff.targets) || !manifest || !Array.isArray(manifest.files))
    throw new Error('handoff and files manifest are required');
  if (!['manual', 'comfyui-local', 'mock'].includes(adapter)) throw new Error('adapter must be manual, comfyui-local or mock');
  const targets = new Set(handoff.targets);
  if (manifest.files.length !== targets.size) throw new Error('result must provide exactly one image for every target');
  const seen = new Set();
  const prepared = manifest.files.map(file => {
    if (!file || !ID.test(file.target ?? '') || !targets.has(file.target) || seen.has(file.target))
      throw new Error(`unexpected or duplicate target ${file?.target ?? ''}`);
    seen.add(file.target);
    const source = resolve(file.path ?? '');
    const bytes = readFileSync(source);
    if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) || bytes.length > 32 * 1024 * 1024)
      throw new Error(`${file.target}: expected a PNG no larger than 32 MiB`);
    return {target: file.target, source, bytes, sha256: createHash('sha256').update(bytes).digest('hex')};
  });
  const output = resolve(outputDirectory);
  mkdirSync(output, {recursive: false});
  const files = [];
  for (const item of prepared) {
    const name = `${item.target}.png`;
    copyFileSync(item.source, join(output, name), 1); // COPYFILE_EXCL keeps candidate artwork immutable.
    files.push({target: item.target, path: join(output, name), sha256: item.sha256, bytes: item.bytes.length});
  }
  return {format: 1, job: handoff.job, subject: handoff.subject, adapter, status: 'imported-for-review', sourceHandoff: handoff.source, files};
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
