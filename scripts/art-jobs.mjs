#!/usr/bin/env node
import {resolve} from 'node:path';
import {makeManualHandoff, readJson, runMockAdapter, validateArtJob, writeJson} from './lib/art-jobs.mjs';

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
  } else
    fail(
      'usage: node scripts/art-jobs.mjs handoff <job.json> <new-handoff.json> | mock-result <handoff.json> <new-result.json> [--attempts 1..3] [--error message]',
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
