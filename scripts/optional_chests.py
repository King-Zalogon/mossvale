"""Apply authored optional-chest discoveries to maps composed by one-off scripts."""
import copy
import json
from pathlib import Path

DATA = json.loads(Path(__file__).with_name('optional-chest-data.json').read_text())


def add_optional_chests(map_data):
    """Keep optional cache content intact when a procedural map layout is regenerated."""
    for cache in DATA.get(map_data['id'], []):
        if not any(item.get('id') == cache['id'] for item in map_data['landmarks']):
            map_data['landmarks'].append(copy.deepcopy(cache))
    return map_data
