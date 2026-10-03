/* Fetches one coherent, verified snapshot of the adventure pack before save loading can begin. */
import {validatePackMetadata, packFileEntries} from '../domain/pack.js';
import {ENGINE_VERSION, SAVE_SCHEMA_VERSION} from '../compatibility.js';

export async function fetchAdventure(base = 'maps/') {
  const bytesFor = async (id, path) => {
    let response;
    try {
      response = await fetch(base + path, {cache: 'no-store'});
    } catch (error) {
      throw new Error(`Pack file ${id} (${path}) could not be fetched: ${error.message || error}. Check the connection, then retry.`, {cause: error});
    }
    if (!response.ok) throw new Error(`Pack file ${id} (${path}) is missing or unavailable: HTTP ${response.status}. Restore the complete build, then retry.`);
    return new Uint8Array(await response.arrayBuffer());
  };
  const parse = (bytes, label) => {
    try {
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new Error(`Pack file ${label} is not valid JSON. Restore the complete build, then retry.`);
    }
  };
  const index = parse(await bytesFor('manifest:index', 'index.json'), 'manifest:index');
  const errors = validatePackMetadata(index, {required: true, engineVersion: ENGINE_VERSION, saveSchema: SAVE_SCHEMA_VERSION});
  if (errors.length)
    throw new Error(`Pack compatibility check failed: ${errors.join(' · ')}. Update the game or restore a complete compatible build, then retry.`);
  if (!globalThis.crypto?.subtle)
    throw new Error('This browser cannot verify the adventure pack integrity hashes. Open Mossvale in a current browser, then retry.');
  const entries = packFileEntries(index);
  const verified = await Promise.all(
    entries.map(async entry => {
      const bytes = await bytesFor(entry.id, entry.path);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const actual = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
      const expected = index.integrity.find(file => file.id === entry.id)?.sha256;
      if (actual !== expected)
        throw new Error(
          `Pack file ${entry.id} (${entry.path}) failed its SHA-256 integrity check. The pack files do not belong to one build; restore the complete build, then retry.`,
        );
      return [entry.id, parse(bytes, `${entry.id} (${entry.path})`)];
    }),
  );
  const files = Object.fromEntries(verified);
  const maps = index.maps.map(id => files[`map:${id}`]);
  const objectives = files['objectives:main'];
  const story = files['story:main'];
  const registries = files['registry:main'];
  return {maps, objectives, story, registries, pack: index};
}

/** The adventure catalog next to the page. A build without one offers just the adventure in `maps/`. */
export async function fetchCatalog(url = 'adventures.json') {
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(`${url}: ${error.message || 'network error'}`, {cause: error});
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}
