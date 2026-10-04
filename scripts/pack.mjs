#!/usr/bin/env node
/* Small local content-authoring commands for versioned adventure packs. See docs/PACKS.md. */
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve, join} from 'node:path';
import defaultRegistries from '../dist/maps/registries.json' with {type: 'json'};
import {assets} from '../dist/src/data/assets.js';
import {buildAdventure} from '../dist/src/domain/adventure.js';
import {resolveRegistries, validateRegistries} from '../dist/src/domain/registries.js';
import {packFileEntries, validatePack, validatePackMetadata} from '../dist/src/domain/pack.js';
import {ENGINE_VERSION, SAVE_SCHEMA_VERSION} from '../dist/src/compatibility.js';

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const assetNames = new Set(assets.map(asset => asset.name));
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const writeJson = (file, value, force = false) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n', {flag: force ? 'w' : 'wx'});
const fail = message => {
  throw new Error(message);
};

function fileIntegrity(index, root) {
  return packFileEntries(index).map(({id, path}) => {
    let bytes;
    try {
      bytes = readFileSync(join(root, path));
    } catch {
      fail(`pack integrity ${id}: required file ${path} is missing; restore the complete pack before building`);
    }
    return {id, path, sha256: createHash('sha256').update(bytes).digest('hex')};
  });
}

function refreshManifest(folder) {
  const root = resolve(folder);
  const indexPath = join(root, 'index.json');
  const index = json(indexPath);
  if (!Number.isInteger(index.contentVersion) || index.contentVersion < 1) index.contentVersion = 1;
  index.requires = {engineVersion: ENGINE_VERSION, saveSchema: SAVE_SCHEMA_VERSION};
  index.integrity = fileIntegrity(index, root);
  writeJson(indexPath, index, true);
  return index;
}

function verifyFileIntegrity(index, root) {
  const errors = validatePackMetadata(index);
  for (const error of errors) console.error(error);
  if (errors.length) return errors;
  if (!Array.isArray(index.integrity)) return [];
  for (const entry of index.integrity) {
    let actual;
    try {
      actual = createHash('sha256')
        .update(readFileSync(join(root, entry.path)))
        .digest('hex');
    } catch {
      errors.push(`pack integrity ${entry.id}: required file ${entry.path} is missing; restore the complete pack before building`);
      continue;
    }
    if (actual !== entry.sha256) errors.push(`pack integrity ${entry.id}: SHA-256 mismatch for ${entry.path}; refresh the manifest after reviewing the file`);
  }
  return errors;
}

function loadPack(folder) {
  const root = resolve(folder);
  const index = json(join(root, 'index.json'));
  const integrityErrors = verifyFileIntegrity(index, root);
  if (integrityErrors.length) fail(integrityErrors.map(error => ` - ${error}`).join('\n'));
  if (index.registries !== undefined && !/^[a-z0-9-]+\.json$/.test(index.registries)) fail('pack registries: must name a JSON file in the pack folder');
  const registries = json(join(root, index.registries ?? 'registries.json'));
  const errors = validateRegistries(registries, {assetNames});
  const speciesIds = new Set(Array.isArray(registries.species) ? registries.species.map(entry => entry.id) : []);
  errors.push(...validatePack(index, {packId: index.id, speciesIds}));
  if (errors.length) fail(errors.map(error => ` - ${error}`).join('\n'));
  const mapDirectory = index.mapDirectory ?? '';
  const maps = index.maps.map(id => json(join(root, mapDirectory, id + '.json')));
  const objectives = index.objectives ? json(join(root, index.objectives)) : undefined;
  const story = index.story ? json(join(root, index.story)) : undefined;
  const inventoryRules = index.inventory ? json(join(root, index.inventory)) : undefined;
  const content = resolveRegistries(registries, assets);
  const built = buildAdventure(maps, {assets, ...content, packId: index.id}, objectives, story, index, inventoryRules);
  errors.push(...built.errors);
  if (errors.length) fail(errors.map(error => ` - ${error}`).join('\n'));
  return {root, index, registries, maps, built};
}

function starterMap(id, name, speciesIds) {
  const rows = ['........', '.gggggg.', '.gttttg.', '.gggggg.', '.gggggg.', '.gggggg.', '.gggggg.', '........'];
  return {
    format: 1,
    id,
    name,
    size: {w: 8, h: 8},
    legend: {'.': 'void', g: 'ground', p: 'path', w: 'water', t: 'tallgrass'},
    terrain: rows,
    spawns: {camp: [3, 4]},
    landmarks: [],
    exits: [],
    props: [],
    zones: [{id: `${id}-meadow`, terrain: ['t'], pool: speciesIds, level: [3, 4], distance: [4, 7]}],
    triggers: [],
  };
}

function createPack(folder, id, name, force) {
  if (!ID.test(id)) fail('pack id must be lowercase kebab-case');
  if (!name?.trim()) fail('pack name is required');
  const root = resolve(folder);
  if (existsSync(join(root, 'index.json'))) {
    const previous = json(join(root, 'index.json'));
    if (!force) fail(`refusing to overwrite ${join(root, 'index.json')}; pass --force to replace this pack`);
    if (previous.id !== id) fail(`--force only replaces the existing pack with the same id (found "${previous.id}")`);
  }
  mkdirSync(join(root, 'maps'), {recursive: true});
  const registry = structuredClone(defaultRegistries);
  registry.species = registry.species.slice(0, 2);
  registry.regions = [
    {
      ...registry.regions[0],
      id: 'start',
      name,
      short: name.slice(0, 14),
      subtitle: 'A small adventure begins.',
      tag: name.toUpperCase().slice(0, 18),
      seal: 'First seal',
      desc: 'Explore, meet a friend, and find your own way.',
    },
  ];
  const speciesIds = registry.species.map(entry => entry.id);
  const index = {
    format: 1,
    id,
    name,
    brief: `A new adventure: ${name}.`,
    maps: ['start'],
    species: speciesIds,
    milestones: [],
    registries: 'registries.json',
    mapDirectory: 'maps/',
  };
  writeJson(join(root, 'index.json'), index, force);
  writeJson(join(root, 'registries.json'), registry, force);
  writeJson(join(root, 'maps', 'start.json'), starterMap('start', name, speciesIds), force);
  refreshManifest(root);
  loadPack(root);
  console.log(`Created ${id} in ${root}. Run validate-pack and preview-pack before editing the maps.`);
}

function addMap(folder, id) {
  if (!ID.test(id)) fail('map id must be lowercase kebab-case');
  const pack = loadPack(folder);
  if (pack.index.maps.includes(id)) fail(`map "${id}" is already in this pack`);
  const sourceId = pack.index.maps[0];
  const source = structuredClone(pack.maps[0]);
  const template = structuredClone(source);
  template.id = id;
  template.name = id
    .split('-')
    .map(word => word[0].toUpperCase() + word.slice(1))
    .join(' ');
  for (const landmark of template.landmarks ?? []) if (landmark.flag) landmark.flag = `${id}.${landmark.flag.split('.').at(-1)}`;
  for (const zone of template.zones ?? []) zone.id = `${id}-${zone.id}`;
  const chooseGround = map => {
    for (let y = map.size.h - 2; y >= 1; y--) for (let x = map.size.w - 2; x >= 1; x--) if ('gp'.includes(map.terrain[y][x])) return [x, y];
    fail(`map ${map.id} has no ground/path cell for an exit`);
  };
  source.exits ??= [];
  template.exits ??= [];
  source.exits.push({id: `to-${id}`, sprite: 'signpost-wood', at: chooseGround(source), w: 40, label: `Visit ${template.name}`, to: {map: id, spawn: 'camp'}});
  template.exits.push({
    id: `to-${sourceId}`,
    sprite: 'signpost-wood',
    at: chooseGround(template),
    w: 40,
    label: `Return to ${source.name}`,
    to: {map: sourceId, spawn: 'camp'},
  });
  const region = {
    ...pack.registries.regions[0],
    id,
    name: template.name,
    short: template.name.slice(0, 14),
    subtitle: 'A new stretch of the trail.',
    tag: template.name.toUpperCase().slice(0, 18),
    desc: `Explore ${template.name}.`,
  };
  pack.registries.regions.push(region);
  pack.index.maps.push(id);
  writeJson(join(pack.root, pack.index.mapDirectory ?? '', id + '.json'), template);
  writeJson(join(pack.root, pack.index.mapDirectory ?? '', sourceId + '.json'), source, true);
  writeJson(join(pack.root, 'registries.json'), pack.registries, true);
  writeJson(join(pack.root, 'index.json'), pack.index, true);
  refreshManifest(pack.root);
  loadPack(pack.root);
  console.log(`Added ${id} and linked it to ${sourceId}.`);
}

function previewPack(folder, mapId) {
  const pack = loadPack(folder);
  const map = pack.built.maps.find(item => item.id === mapId);
  if (!map) fail(`unknown map "${mapId}"; maps: ${pack.index.maps.join(', ')}`);
  const raw = pack.maps.find(item => item.id === mapId);
  const grid = raw.terrain.map(row => [...row]);
  const sym = {g: '.', p: '=', w: '~', t: '"', '.': ' '};
  for (let y = 0; y < grid.length; y++) grid[y] = grid[y].map(ch => sym[ch] ?? ch);
  const place = (at, ch) => (grid[Math.round(at[1])][Math.round(at[0])] = ch);
  for (const prop of raw.props ?? []) for (const at of prop.at) place(at, '*');
  for (const landmark of raw.landmarks ?? []) place(landmark.at, {ranger: 'R', shrine: 'S', chest: 'C', sign: '?', cottage: 'H'}[landmark.kind]);
  for (const exit of raw.exits ?? []) place(exit.at, 'G');
  for (const spawn of Object.values(raw.spawns)) place(spawn, '@');
  console.log(`${raw.name} (${raw.id})\n${grid.map(row => row.join('')).join('\n')}`);
  for (const zone of raw.zones ?? []) console.log(`zone ${zone.id}: ${zone.pool.join(', ')} on ${zone.terrain.join(', ')}`);
}

const [command, ...args] = process.argv.slice(2);
try {
  if (command === 'create-pack') {
    const [folder, ...options] = args;
    const value = key => options[options.indexOf(key) + 1];
    if (!folder) fail('usage: node scripts/pack.mjs create-pack <folder> --id <id> --name <name> [--force]');
    createPack(folder, value('--id'), value('--name'), options.includes('--force'));
  } else if (command === 'add-map') {
    if (args.length !== 2) fail('usage: node scripts/pack.mjs add-map <folder> <map-id>');
    addMap(args[0], args[1]);
  } else if (command === 'validate-pack') {
    if (args.length !== 1) fail('usage: node scripts/pack.mjs validate-pack <folder>');
    const pack = loadPack(args[0]);
    console.log(`${pack.index.name}: ${pack.index.maps.length} map(s), ${pack.registries.species.length} species; all pack references are valid.`);
  } else if (command === 'refresh-manifest') {
    if (args.length !== 1) fail('usage: node scripts/pack.mjs refresh-manifest <folder>');
    const index = refreshManifest(args[0]);
    console.log(
      `Refreshed ${index.id} content version ${index.contentVersion} (${index.integrity.length} files). Review the pack changes, then run validate-pack.`,
    );
  } else if (command === 'preview-pack') {
    if (args.length !== 2) fail('usage: node scripts/pack.mjs preview-pack <folder> <map-id>');
    previewPack(args[0], args[1]);
  } else fail('commands: create-pack, add-map, validate-pack, preview-pack');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
