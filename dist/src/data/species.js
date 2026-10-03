import defaultRegistries from '../../maps/registries.json' with {type: 'json'};
import {spriteId} from './assets.js';

/* Stable species IDs are authored in the selected pack registry and persisted in save files. */
const runtimeSpecies = entries =>
  entries.map(entry => ({
    ...entry,
    stats: {
      hp: entry.stats?.hp ?? entry.hp,
      attack: entry.stats?.attack ?? 10,
      defense: entry.stats?.defense ?? 10,
    },
    sprite: spriteId(entry.sprite),
  }));

export const species = runtimeSpecies(defaultRegistries.species);

export function replaceSpecies(entries) {
  species.splice(0, species.length, ...runtimeSpecies(entries));
}
