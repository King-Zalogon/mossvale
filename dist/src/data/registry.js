import {assets} from './assets.js';
import {replaceSpecies} from './species.js';
import {replaceRegions} from './regions.js';
import {replaceEconomy} from './economy.js';
import {replaceTactics} from './tactics.js';
import {configurePackRules} from '../config.js';
import {setPackId} from './pack.js';
import {validateRegistries} from '../domain/registries.js';
import defaultRegistries from '../../maps/registries.json' with {type: 'json'};

const assetNames = new Set(assets.map(asset => asset.name));

/** Validate all pack-owned tables before mutating the engine's live data bindings. */
export function configureRegistry({registries = defaultRegistries, packId}) {
  const errors = validateRegistries(registries, {assetNames});
  if (errors.length) return errors;
  replaceSpecies(registries.species);
  replaceRegions(registries.regions);
  replaceEconomy(registries.economy);
  replaceTactics(registries.tactics);
  configurePackRules(registries.progression, registries.battle, registries.moves);
  setPackId(packId);
  return [];
}
