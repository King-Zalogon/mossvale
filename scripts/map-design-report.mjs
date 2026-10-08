import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assets} from '../dist/src/data/assets.js';
import {buildAdventure} from '../dist/src/domain/adventure.js';
import {buildWorld} from '../dist/src/domain/world.js';
import {resolveRegistries} from '../dist/src/domain/registries.js';
import defaultRegistries from '../dist/maps/registries.json' with {type: 'json'};
import {analyzeMapDesign, renderMapSvg, renderSummaryMarkdown} from './lib/map-design-report.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
let out = join(root, 'build', 'map-design-report');
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--out' && argv[i + 1]) out = resolve(argv[++i]);
  else {
    console.error('Usage: node scripts/map-design-report.mjs [--out <directory>]');
    process.exit(2);
  }
}

// Use the shipped pack's normal validation command and canonical compiler before analyzing anything.
execFileSync(process.execPath, ['scripts/validate-maps.mjs'], {cwd: root, stdio: 'inherit'});
const mapDir = join(root, 'dist', 'maps');
const read = name => JSON.parse(readFileSync(join(mapDir, name), 'utf8'));
const index = read('index.json');
const rawMaps = index.maps.map(id => read(`${id}.json`));
const registries = index.registries ? read(index.registries) : defaultRegistries;
const source = resolveRegistries(registries, assets);
const {mapsById} = buildAdventure(
  rawMaps,
  {assets, ...source, packId: index.id},
  index.objectives ? read(index.objectives) : undefined,
  index.story ? read(index.story) : undefined,
  index,
  index.inventory ? read(index.inventory) : undefined,
);
const rawById = new Map(rawMaps.map(map => [map.id, map]));
const reports = index.maps.map(id => analyzeMapDesign(buildWorld(mapsById[id]), rawById.get(id), rawById));

mkdirSync(out, {recursive: true});
for (const report of reports) writeFileSync(join(out, `${report.id}.svg`), renderMapSvg(report));
writeFileSync(join(out, 'report.md'), renderSummaryMarkdown(reports));
const jsonReports = reports.map(({id, name, size, walkableTiles, reachableTiles, coverage, spawns, targets, branches, exits, wayfindingCues, warnings}) => ({
  id,
  name,
  size,
  walkableTiles,
  reachableTiles,
  coverage,
  spawns,
  targets,
  branches,
  exits,
  wayfindingCues,
  warnings,
}));
writeFileSync(join(out, 'report.json'), JSON.stringify({format: 1, maps: jsonReports}, null, 2) + '\n');
console.log(`Spatial design report: ${reports.length} maps -> ${out}`);
console.log('| Map | Walkable | Reachability | Targets | Branches | Warnings |');
console.log('| --- | ---: | ---: | ---: | ---: | ---: |');
for (const report of reports)
  console.log(
    `| ${report.id} | ${report.walkableTiles} | ${report.coverage}% | ${report.targets.filter(item => item.reachable).length}/${report.targets.length} | ${report.branches.length} | ${report.warnings.filter(item => item.severity !== 'info').length} |`,
  );
