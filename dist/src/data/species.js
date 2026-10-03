import defaultRegistries from '../../maps/registries.json' with {type: 'json'};
import {spriteId} from './assets.js';

/* Stable species IDs are authored in the selected pack registry and persisted in save files. */
export const species = defaultRegistries.species.map(entry => ({...entry, sprite: spriteId(entry.sprite)}));

export function replaceSpecies(entries) {
  species.splice(0, species.length, ...entries.map(entry => ({...entry, sprite: spriteId(entry.sprite)})));
}
