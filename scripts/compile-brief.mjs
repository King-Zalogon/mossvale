#!/usr/bin/env node
/* Compile a structured adventure brief into a fresh, separately reviewable pack candidate. */
import {existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, renameSync, rmSync, realpathSync} from 'node:fs';
import {resolve, join, dirname, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {validatePackMetadata} from '../dist/src/domain/pack.js';

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const fail = message => {
  throw new Error(message);
};
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[character]);

function ensureReviewLocation(output) {
  const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const rel = relative(project, output);
  if (rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !rel.startsWith(sep))) {
    fail(`refusing to compile candidates inside the repository: ${output}; choose an isolated review directory`);
  }
  const parent = dirname(output);
  if (existsSync(parent)) {
    const realProject = realpathSync(project);
    const realParent = realpathSync(parent);
    const realRelative = relative(realProject, realParent);
    if (realRelative === '' || (!realRelative.startsWith(`..${sep}`) && realRelative !== '..' && !realRelative.startsWith(sep))) {
      fail(`refusing to compile candidates inside the repository: ${output}; choose an isolated review directory`);
    }
  }
}

function writeCandidatePreview(folder, brief) {
  const rows = brief.routes
    .map(
      route =>
        `<tr><th>${escapeHtml(route.name)}<br><code>${escapeHtml(route.id)}</code></th><td><a href="${encodeURIComponent(route.id)}.json">${escapeHtml(route.id)}.json</a></td><td>${route.landmarks.map(escapeHtml).join(', ')}</td><td>${route.speciesRoles.map(escapeHtml).join(', ')}</td></tr>`,
    )
    .join('\n');
  const html = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(brief.name)} candidate review</title>
<style>body{max-width:960px;margin:2rem auto;padding:0 1rem;font:16px system-ui;color:#20352b;background:#f2f3e5}table{border-collapse:collapse;width:100%;background:white}th,td{padding:.75rem;border:1px solid #bdc8b6;text-align:left;vertical-align:top}th{min-width:10rem}code{color:#536b45}aside{padding:1rem;background:#e1ead4;margin:1rem 0}</style>
<h1>${escapeHtml(brief.name)}</h1><p>Candidate review · revision ${escapeHtml(brief.revision ?? 1)} · biome ${escapeHtml(brief.biome)}</p>
<aside><strong>Draft only:</strong> generated maps are scaffolds. Review map previews and author route landmarks, species roles, objectives, and story data before promotion. This report does not modify the playable game.</aside>
<h2>Brief-to-pack route review</h2><table><thead><tr><th>Brief route</th><th>Generated map</th><th>Requested landmarks</th><th>Requested species roles</th></tr></thead><tbody>${rows}</tbody></table>
<h2>Goals</h2><ul>${brief.goals.map(goal => `<li>${escapeHtml(goal)}</li>`).join('')}</ul><h2>Ending</h2><p>${escapeHtml(brief.ending)}</p>
</html>`;
  writeFileSync(join(folder, 'candidate-review.html'), html, {flag: 'wx'});
}

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
  ensureReviewLocation(output);
  mkdirSync(dirname(output), {recursive: true});
  const staging = mkdtempSync(join(dirname(output), '.mossvale-brief-'));
  const candidate = join(staging, 'pack');
  try {
    runPack('create-pack', candidate, '--id', brief.id, '--name', brief.name);
    for (const route of brief.routes.slice(1)) runPack('add-map', candidate, route.id);
    const indexPath = join(candidate, 'index.json');
    const index = JSON.parse(readFileSync(indexPath, 'utf8'));
    index.brief = `${brief.name}: ${brief.goals.join('; ')} Ending: ${brief.ending}`;
    writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
    writeFileSync(join(candidate, 'brief.json'), JSON.stringify({source: briefFile, revision: brief.revision ?? 1, content: brief}, null, 2) + '\n', {
      flag: 'wx',
    });
    runPack('refresh-manifest', candidate);
    runPack('validate-pack', candidate);
    const metadataErrors = validatePackMetadata(JSON.parse(readFileSync(indexPath, 'utf8')));
    if (metadataErrors.length) fail(metadataErrors.join('\n'));
    writeCandidatePreview(candidate, brief);
    if (existsSync(output)) fail(`refusing to replace candidate directory ${output}; choose a new path`);
    renameSync(candidate, output);
  } finally {
    rmSync(staging, {recursive: true, force: true});
  }
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
