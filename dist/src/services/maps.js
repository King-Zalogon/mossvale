/* Fetches map JSON listed in maps/index.json. Parsing/validation happens in domain/adventure.js. */
export async function fetchMaps(base = 'maps/') {
  const get = async name => {
    const response = await fetch(base + name);
    if (!response.ok) throw new Error(`${base + name}: HTTP ${response.status}`);
    return response.json();
  };
  const index = await get('index.json');
  return Promise.all(index.maps.map(id => get(id + '.json')));
}
