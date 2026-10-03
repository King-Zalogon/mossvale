// Validates dist/maps/*.json against the map format, asset manifest and species list.
//   node scripts/validate-maps.mjs            validate every map
//   node scripts/validate-maps.mjs preview meadow   print an ASCII preview with landmarks, exits, spawns and zones
import {readFileSync} from 'node:fs';
import {assets} from '../dist/src/data/assets.js';
import defaultRegistries from '../dist/maps/registries.json' with {type: 'json'};
import {buildAdventure} from '../dist/src/domain/adventure.js';
import {resolveRegistries, validateRegistries} from '../dist/src/domain/registries.js';

const dir = new URL('../dist/maps/', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
const index = read('index.json');
const registries = index.registries ? read(index.registries) : defaultRegistries;
const registryErrors = validateRegistries(registries, {assetNames: new Set(assets.map(a => a.name))});
if (registryErrors.length) {
  console.error(`${registryErrors.length} registry error(s):\n` + registryErrors.map(e => ' - ' + e).join('\n'));
  process.exit(1);
}
const content = resolveRegistries(registries, assets);
const raw = index.maps.map(id => read(id + '.json'));
const {maps, errors} = buildAdventure(
  raw,
  {assets, ...content, packId: index.id},
  index.objectives ? read(index.objectives) : undefined,
  index.story ? read(index.story) : undefined,
  index,
);
if (errors.length) {
  console.error(`${errors.length} map error(s):\n` + errors.map(e => ' - ' + e).join('\n'));
  process.exit(1);
}
const [command, id] = process.argv.slice(2);
if (command === 'preview') {
  const map = maps.find(m => m.id === id);
  if (!map) {
    console.error(`unknown map "${id}"; maps: ${maps.map(m => m.id).join(', ')}`);
    process.exit(1);
  }
  const sym = {void: ' ', ground: '.', path: '=', water: '~', tallgrass: '"'};
  const grid = [];
  for (let y = 0; y < map.size.h; y++) grid.push([...Array(map.size.w).keys()].map(x => sym[map.terrainAt(x, y)]));
  const put = (o, ch) => (grid[Math.round(o.y)][Math.round(o.x)] = ch);
  for (const o of map.objects) if (o.solid) put(o, '#');
  for (const o of map.objects)
    put(o, {ranger: 'R', shrine: 'S', chest: 'C', sign: '?', gate: 'G', cottage: 'H'}[o.kind] || grid[Math.round(o.y)][Math.round(o.x)]);
  for (const p of Object.values(map.spawns)) put(p, '@');
  console.log(`${map.name} (${map.id})  . ground  = path  ~ water  " tall grass  # solid  @ spawn  R ranger  S shrine  C chest  ? sign  G exit  H cottage`);
  console.log(grid.map(r => r.join('')).join('\n'));
  for (const z of map.zones) console.log(`zone ${z.id}: ${z.pool.map(i => content.species[i].id).join(', ')} at level ${z.level.join('-')}`);
} else console.log(`${maps.length} maps OK`);
