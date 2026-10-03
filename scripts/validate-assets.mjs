// Build-time check of the asset manifest and the PNGs behind it (rules in scripts/lib/assets-check.mjs, docs/ASSETS.md).
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assets} from '../dist/src/data/assets.js';
import {checkAssets} from './lib/assets-check.mjs';
import {checkSubjectProvenance} from './lib/provenance-check.mjs';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const root = fileURLToPath(new URL('../', import.meta.url));
const walk = dir => readdirSync(dir).flatMap(f => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
const sources = [...walk(join(dist, 'src')), ...walk(join(dist, 'maps'))].filter(f => /\.(js|json)$/.test(f) && !f.endsWith('data/assets.js'));
const {errors, warnings} = checkAssets(assets, dist, {referenceText: sources.map(f => readFileSync(f, 'utf8')).join('\n')});
const sourceMetadata = JSON.parse(readFileSync(new URL('../art/assets/metadata.json', import.meta.url), 'utf8'));
const subjectRegistry = JSON.parse(readFileSync(new URL('../art/assets/subjects.json', import.meta.url), 'utf8'));
const combatMetadata = JSON.parse(readFileSync(new URL('../art/characters/creature-combat-metadata.json', import.meta.url), 'utf8'));
errors.push(...checkSubjectProvenance(subjectRegistry, {root, assets, sourceMetadata, combatMetadata}).errors);
for (const w of warnings) console.warn('warning: ' + w);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`${assets.length} assets OK`);
