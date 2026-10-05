#!/usr/bin/env node
import {readFileSync, readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {ROOT, safePath, validateCatalogue} from './lib/catalogue.mjs';
import {changedPaths, validateImpact} from './lib/catalogue-impact.mjs';

try {
  if (process.argv.length !== 4 || process.argv[2] !== '--base') throw new Error('Usage: node scripts/check-catalogue-impact.mjs --base origin/integration');
  const paths = changedPaths(ROOT, process.argv[3]);
  const catalogue = JSON.parse(readFileSync(resolve(ROOT, 'content/catalogue/catalogue.json'), 'utf8'));
  const errors = validateCatalogue(catalogue);
  // Only review records added/modified in this PR count; old records cannot become perpetual exemptions.
  const reviews = paths
    .filter(path => /^content\/catalogue\/reviews\/[a-z0-9-]+\.json$/.test(path))
    .filter(path => readdirSync(resolve(ROOT, 'content/catalogue/reviews')).includes(path.split('/').at(-1)))
    .map(path => JSON.parse(readFileSync(safePath(ROOT, path), 'utf8')));
  errors.push(...validateImpact(paths, reviews, catalogue));
  for (const review of reviews)
    for (const change of review.changes ?? [])
      for (const path of change.evidence ?? []) {
        try {
          safePath(ROOT, path);
        } catch (error) {
          errors.push(`Impact evidence: ${error.message}`);
        }
      }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Catalogue impact: ${paths.length} changed paths reviewed against ${process.argv[3]}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
