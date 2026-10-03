/* Fetches map JSON listed in maps/index.json (the adventure pack, docs/PACKS.md), plus the objectives and story files it names.
   Parsing/validation happens in domain/adventure.js. */
export async function fetchAdventure(base = 'maps/') {
  const get = async name => {
    const response = await fetch(base + name);
    if (!response.ok) throw new Error(`${base + name}: HTTP ${response.status}`);
    return response.json();
  };
  const index = await get('index.json');
  const id = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!Array.isArray(index.maps) || !index.maps.length || !index.maps.every(mapId => typeof mapId === 'string' && id.test(mapId)))
    throw new Error('pack maps: expected a list of map IDs');
  if (index.registries !== undefined && (typeof index.registries !== 'string' || !/^[a-z0-9-]+\.json$/.test(index.registries)))
    throw new Error('pack registries: must name a JSON file in the pack folder');
  if (index.mapDirectory !== undefined && (typeof index.mapDirectory !== 'string' || !/^[a-z0-9-]+\/$/.test(index.mapDirectory)))
    throw new Error('pack mapDirectory: must be a relative folder name ending with /');
  for (const key of ['objectives', 'story'])
    if (index[key] !== undefined && (typeof index[key] !== 'string' || !/^[a-z0-9-]+\.json$/.test(index[key])))
      throw new Error(`pack ${key}: must name a JSON file in the pack folder`);
  const directory = index.mapDirectory ?? '';
  const [maps, objectives, story, registries] = await Promise.all([
    Promise.all(index.maps.map(id => get(directory + id + '.json'))),
    index.objectives ? get(index.objectives) : undefined,
    index.story ? get(index.story) : undefined,
    index.registries ? get(index.registries) : undefined,
  ]);
  return {maps, objectives, story, registries, pack: index};
}
