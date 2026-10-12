import {assets} from './data/assets.js';
import {species, replaceSpecies} from './data/species.js';

export const PREPARED_CREATURE_IDS = Object.freeze(['parrocket', 'blastoucan', 'rumblet', 'coglet', 'wispurr']);

// Only artwork review documents call this; the adventure keeps its pack-owned roster.
export async function loadPreparedCreaturePreviews() {
  const definitions = await Promise.all(
    PREPARED_CREATURE_IDS.map(async id => {
      const response = await fetch(new URL(`../resources/creatures/${id}.json`, import.meta.url));
      if (!response.ok) throw new Error(`Creature preview resource failed to load: ${id}`);
      return response.json();
    }),
  );
  const existing = species.map(entry => ({...entry, sprite: assets[entry.sprite].name}));
  replaceSpecies([...existing, ...definitions.filter(entry => !existing.some(current => current.id === entry.id))]);
}
