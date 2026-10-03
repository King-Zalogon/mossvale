#!/usr/bin/env node
/* Compile a structured adventure brief into a fresh, separately reviewable pack candidate. */
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {validatePackMetadata} from '../dist/src/domain/pack.js';

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const fail = message => {
  throw new Error(message);
};

export function validateBrief(brief) {
  const errors = [];
  if (!brief || brief.format !== 1) errors.push('format must be 1');
  if (!ID.test(brief?.id ?? '')) errors.push('id must be lowercase kebab-case');
  if (typeof brief?.name !== 'string' || !brief.name.trim()) errors.push('name is required');
  if (typeof brief?.biome !== 'string' || !brief.biome.trim()) errors.push('biome is required');
  if (!Array.isArray(brief?.routes) || !brief.routes.length) errors.push('routes must contain at least one route');
  else {
    if (brief.routes[0]?.id !== 'start') errors.push('routes[0].id must be "start" for the generated camp route');
    const routeIds = new Set();
    for (const [index, route] of brief.routes.entries()) {
      if (!route || !ID.test(route.id ?? '')) errors.push(`routes[${index}].id must be lowercase kebab-case`);
      else if (routeIds.has(route.id)) errors.push(`routes[${index}].id duplicates ${route.id}`);
      else routeIds.add(route.id);
      if (typeof route?.name !== 'string' || !route.name.trim()) errors.push(`routes[${index}].name is required`);
      if (!Array.isArray(route?.landmarks) || !route.landmarks.length) errors.push(`routes[${index}].landmarks must include at least one landmark`);
      if (!Array.isArray(route?.speciesRoles) || !route.speciesRoles.length) errors.push(`routes[${index}].speciesRoles must include at least one role`);
    }
  }
  if (!Array.isArray(brief?.goals) || !brief.goals.length || brief.goals.some(goal => typeof goal !== 'string' || !goal.trim()))
    errors.push('goals must be a non-empty list of strings');
  if (typeof brief?.ending !== 'string' || !brief.ending.trim()) errors.push('ending is required');
  return errors;
}

function runPack(...args) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./pack.mjs', import.meta.url)), ...args], {encoding: 'utf8'});
  if (result.status !== 0) fail((result.stderr || result.stdout || 'pack command failed').trim());
}

export function compileBrief(briefPath, candidatePath) {
  const briefFile = resolve(briefPath);
  const output = resolve(candidatePath);
  const brief = JSON.parse(readFileSync(briefFile, 'utf8'));
  const errors = validateBrief(brief);
  if (errors.length) fail(errors.join('\n'));
  if (existsSync(output)) fail(`refusing to overwrite candidate directory ${output}; choose a new path`);
  runPack('create-pack', output, '--id', brief.id, '--name', brief.name);
  for (const route of brief.routes.slice(1)) runPack('add-map', output, route.id);
  const indexPath = join(output, 'index.json');
  const index = JSON.parse(readFileSync(indexPath, 'utf8'));
  index.brief = `${brief.name}: ${brief.goals.join('; ')} Ending: ${brief.ending}`;
  writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
  writeFileSync(join(output, 'brief.json'), JSON.stringify({source: briefFile, revision: brief.revision ?? 1, content: brief}, null, 2) + '\n', {flag: 'wx'});
  runPack('refresh-manifest', output);
  runPack('validate-pack', output);
  const metadataErrors = validatePackMetadata(JSON.parse(readFileSync(indexPath, 'utf8')));
  if (metadataErrors.length) fail(metadataErrors.join('\n'));
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [brief, candidate] = process.argv.slice(2);
    if (!brief || !candidate) fail('usage: node scripts/compile-brief.mjs <brief.json> <new-candidate-directory>');
    console.log(`Compiled review candidate at ${compileBrief(brief, candidate)}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
