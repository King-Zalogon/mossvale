# Reusable map prefabs

Pack manifests may define a `prefabs` object and map files may place its entries through `instances`. The game expands these records into ordinary map data before running the existing map validator and compiler. Runtime saves, collision, rendering and interaction continue to use the flattened map contract.

## Definition

Each prefab has a bounded rectangular footprint. `solid` defaults to true; two solid instance footprints may not overlap. A prefab can opt into only the arrangement transforms that suit its art. The current transforms move placements within the footprint but never rotate or recolor sprite pixels.

```jsonc
{
  "prefabs": {
    "waystation": {
      "footprint": {"w": 5, "h": 4, "solid": true},
      "transforms": ["none", "flip-x"],
      "terrain": [{"at": [0, 3], "tile": "p"}],
      "spawns": {"door": [0, 3]},
      "props": [{"id": "oak", "kind": "scenery", "sprite": "tree-oak", "at": [[4, 0]], "w": 42}],
      "slots": [{
        "id": "host", "kind": "ranger", "role": "guide", "sprite": "person-gardener",
        "at": [2, 2], "w": 37, "label": "Talk to the guide"
      }],
      "triggers": [{
        "id": "welcome", "at": [1, 2], "on": "interact",
        "do": [{"type": "toast", "text": "A friendly hello."}],
        "events": [{"id": "noticed", "repeatable": false, "actions": [{"type": "dialogue", "text": "Welcome."}]}]
      }]
    }
  }
}
```

## Placement and role

```jsonc
{
  "instances": [{
    "id": "orchard-station",
    "prefab": "waystation",
    "at": [12, 8],
    "transform": "flip-x",
    "roles": {"guide": {"name": "Mara", "tag": "KEEPER", "lines": [{"text": "Take the west trail."}]}}
  }]
}
```

`at` is the footprint's top-left map coordinate. Local terrain, spawn, prop, landmark, exit, zone and trigger coordinates are translated into the containing map. Local IDs become `<instance-id>-<local-id>`; event IDs use that same namespace so each copy has its own once-only state in the existing event journal. Spawns use the same namespacing. Role overrides can change names, labels, dialogue and rewards; they cannot replace entity kind, sprite, ID, position, collision or size.

The flattener rejects unknown prefabs, duplicate instance/entity/spawn IDs, missing roles, disallowed transforms, out-of-bounds placements and overlapping solid footprints. Normal map checks then validate the expanded sprites, landmarks, exits, terrain reachability and event references.

Prefab definitions belong to one pack manifest. Another pack can reuse the same definition and shared asset IDs while assigning different role text and distinct instance IDs; no runtime art or story-name contract changes are needed.
