/* Fetches map JSON listed in maps/index.json, plus the objectives file it names.
   Parsing/validation happens in domain/adventure.js. */
export async function fetchAdventure(base = 'maps/') {
  const get = async name => {
    const response = await fetch(base + name);
    if (!response.ok) throw new Error(`${base + name}: HTTP ${response.status}`);
    return response.json();
  };
  const index = await get('index.json');
  const [maps, objectives] = await Promise.all([Promise.all(index.maps.map(id => get(id + '.json'))), index.objectives ? get(index.objectives) : undefined]);
  return {maps, objectives};
}
