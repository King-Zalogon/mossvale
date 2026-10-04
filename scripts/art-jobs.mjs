#!/usr/bin/env node
import {resolve} from 'node:path';
import {importArtBatch, makeManualHandoff, readJson, runMockAdapter, submitComfyWorkflow, validateArtJob, writeJson} from './lib/art-jobs.mjs';

const fail = message => {
  throw new Error(message);
};
try {
  const [command, input, output, ...flags] = process.argv.slice(2);
  if (command === 'handoff' && input && output) {
    const job = readJson(input);
    const errors = validateArtJob(job);
    if (errors.length) fail(errors.join('\n'));
    const handoff = makeManualHandoff(job, input);
    writeJson(output, handoff);
    console.log(`Wrote manual art handoff ${job.id} to ${resolve(output)}`);
  } else if (command === 'mock-result' && input && output) {
    const handoff = readJson(input);
    const errorIndex = flags.indexOf('--error');
    const error = errorIndex >= 0 ? flags[errorIndex + 1] : undefined;
    const result = error === undefined ? {files: []} : {error};
    const attemptsFlag = flags.indexOf('--attempts');
    const updated = runMockAdapter(handoff, {maxAttempts: Number(flags[attemptsFlag + 1] ?? (handoff.retryLimit ?? 0) + 1), result});
    writeJson(output, updated);
    console.log(`Wrote ${updated.status} mock result after ${updated.attempts} attempt(s) to ${resolve(output)}`);
  } else if (command === 'comfy-submit' && input && output) {
    const workflowPath = flags[0];
    const endpointFlag = flags.indexOf('--endpoint');
    const endpoint = endpointFlag >= 0 ? flags[endpointFlag + 1] : undefined;
    if (!workflowPath || !endpoint)
      fail('usage: node scripts/art-jobs.mjs comfy-submit <handoff.json> <workflow.json> <new-checkpoint.json> --endpoint http://127.0.0.1:8188');
    const checkpoint = await submitComfyWorkflow(readJson(input), readJson(workflowPath), {endpoint});
    writeJson(output, checkpoint);
    console.log(`Wrote ${checkpoint.status} ComfyUI checkpoint to ${resolve(output)}`);
    if (checkpoint.status === 'failed') process.exitCode = 1;
  } else if (command === 'import-batch' && input && output) {
    const [manifestPath, directoryPath] = flags;
    const adapterFlag = flags.indexOf('--adapter');
    const adapter = adapterFlag >= 0 ? flags[adapterFlag + 1] : 'manual';
    if (!manifestPath || !directoryPath)
      fail(
        'usage: node scripts/art-jobs.mjs import-batch <handoff.json> <new-result.json> <manifest.json> <new-artwork-directory> [--adapter manual|comfyui-local|mock]',
      );
    const result = importArtBatch(readJson(input), readJson(manifestPath), directoryPath, {adapter});
    writeJson(output, result);
    console.log(`Imported ${result.files.length} image(s) for review into ${resolve(directoryPath)}`);
  } else
    fail(
      'commands: handoff <job.json> <new-handoff.json> | mock-result <handoff.json> <new-result.json> [--attempts 1..3] [--error message] | comfy-submit <handoff.json> <workflow.json> <new-checkpoint.json> --endpoint http://127.0.0.1:8188 | import-batch <handoff.json> <new-result.json> <manifest.json> <new-artwork-directory> [--adapter manual|comfyui-local|mock]',
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
