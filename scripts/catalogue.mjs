#!/usr/bin/env node
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {generateCatalogue, validateCatalogue, validateGenerated, ROOT} from './lib/catalogue.mjs';

try {
  const mode = process.argv[2];
  if (!['write', 'check'].includes(mode) || process.argv.length !== 3) throw new Error('Usage: node scripts/catalogue.mjs write|check');
  const outputs = await generateCatalogue();
  const errors = validateCatalogue(JSON.parse(outputs['content/catalogue/catalogue.json']));
  if (errors.length) throw new Error(errors.join('\n'));
  for (const [path, content] of Object.entries(outputs)) {
    if (mode === 'write') writeFileSync(resolve(ROOT, path), content);
    else if (!existsSync(resolve(ROOT, path)) || readFileSync(resolve(ROOT, path), 'utf8') !== content)
      errors.push(`${path}: stale or missing; run npm run catalogue:write`);
  }
  if (mode === 'check')
    errors.push(...validateGenerated(outputs, path => (existsSync(resolve(ROOT, path)) ? readFileSync(resolve(ROOT, path), 'utf8') : null)));
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Catalogue ${mode}: ${JSON.parse(outputs['content/catalogue/catalogue.json']).entries.length} entries OK`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
