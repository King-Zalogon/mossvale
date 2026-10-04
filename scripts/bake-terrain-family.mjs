// Compiles the authored terrain family into stable per-cell topology, art and walkability records.
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import prettier from 'prettier';
import {bakeTerrainFamily, serializeTerrainFamilyBake} from '../dist/src/domain/terrain-family.js';

const fixturePath = new URL('../dist/maps/terrain-family-fixture.json', import.meta.url);
const bakedPath = new URL('../dist/maps/terrain-family-fixture.baked.json', import.meta.url);
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const baked = bakeTerrainFamily(fixture);
const serialized = serializeTerrainFamilyBake(fixture, baked);
const outputPath = fileURLToPath(bakedPath);
const output = await prettier.format(JSON.stringify(serialized), {...(await prettier.resolveConfig(outputPath)), filepath: outputPath});
writeFileSync(bakedPath, output);
console.log(`baked ${baked.counts.cells} tiles from ${fixture.id} (seed ${baked.seed}) -> ${fileURLToPath(bakedPath)}`);
