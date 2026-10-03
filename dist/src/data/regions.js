import defaultRegistries from '../../maps/registries.json' with {type: 'json'};
import {spriteId} from './assets.js';

/* Region IDs index a save at runtime but their string form is always stored on disk. */
export const regions = defaultRegistries.regions.map(entry => ({...entry, preview: spriteId(entry.preview)}));

export function replaceRegions(entries) {
  regions.splice(0, regions.length, ...entries.map(entry => ({...entry, preview: spriteId(entry.preview)})));
}
