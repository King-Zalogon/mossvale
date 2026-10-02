// Shared fixtures for Node tests: the real adventure loaded from disk, plus a fake storage.
import {readFileSync} from 'node:fs';
import {assets} from '../dist/src/data/assets.js';
import {species} from '../dist/src/data/species.js';
import {regions} from '../dist/src/data/regions.js';
import {buildAdventure} from '../dist/src/domain/adventure.js';
import {create} from '../dist/src/save.js';

const dir = new URL('../dist/maps/', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
export const rawMaps = () => read('index.json').maps.map(id => read(id + '.json'));
export const rawObjectives = () => read(read('index.json').objectives);
export const content = {assets, species, regions};
export const adventure = buildAdventure(rawMaps(), content, rawObjectives());
export const maps = adventure.maps;
export const objectives = adventure.objectives;
export const objCtx = {speciesCount: species.length, regions};
export const codec = create({species, regions, size: 64});
export const newSave = () => codec.fresh();
