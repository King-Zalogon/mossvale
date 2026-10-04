// Ensures source SVG artwork, semantic fixture and the checked-in compiler output stay in sync.
import {readFileSync} from 'node:fs';
import {resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import prettier from 'prettier';
import {bakeTerrainFamily, serializeTerrainFamilyBake, validateTerrainFamilyFixture} from '../dist/src/domain/terrain-family.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = JSON.parse(readFileSync(new URL('../dist/maps/terrain-family-fixture.json', import.meta.url), 'utf8'));
const bakedText = readFileSync(new URL('../dist/maps/terrain-family-fixture.baked.json', import.meta.url), 'utf8');
const errors = validateTerrainFamilyFixture(fixture);
for (const source of Object.values(fixture.artwork ?? {})) {
  const path = resolve(root, 'dist/maps', source.src ?? '');
  if (!path.startsWith(resolve(root, 'dist/assets/terrain-family') + sep)) {
    errors.push(`art source escapes terrain-family assets: ${source.src}`);
    continue;
  }
  let svg;
  try {
    svg = readFileSync(path, 'utf8');
  } catch {
    errors.push(`missing art source ${source.src}`);
    continue;
  }
  const width = Number(/<svg\b[^>]*\bwidth="(\d+)"/.exec(svg)?.[1]);
  const height = Number(/<svg\b[^>]*\bheight="(\d+)"/.exec(svg)?.[1]);
  const viewBox = /<svg\b[^>]*\bviewBox="([^"]+)"/.exec(svg)?.[1];
  if (width !== fixture.tile.w || height !== fixture.tile.h || viewBox !== `0 0 ${fixture.tile.w} ${fixture.tile.h}`) {
    errors.push(`art source ${source.src} must match the ${fixture.tile.w}x${fixture.tile.h} tile bounds`);
  }
  if (/<script\b|<image\b|\bon[a-z]+\s*=|@import|(?:href|url\([^)]*)=["']?https?:\/\//i.test(svg)) {
    errors.push(`art source ${source.src} contains executable or external content`);
  }
}
const bakedPath = fileURLToPath(new URL('../dist/maps/terrain-family-fixture.baked.json', import.meta.url));
const expected = await prettier.format(JSON.stringify(serializeTerrainFamilyBake(fixture, bakeTerrainFamily(fixture))), {
  ...(await prettier.resolveConfig(bakedPath)),
  filepath: bakedPath,
});
if (bakedText !== expected) errors.push('baked terrain family is stale; run npm run terrain:bake');
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`${Object.keys(fixture.artwork).length} source tiles and ${JSON.parse(bakedText).counts.cells} baked cells OK`);
