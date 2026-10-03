# Offline authoring tools

These authoring helpers run in Node and are not imported by the browser game. They use the existing pack compiler and schemas; no model service, Python environment, GPU, or network is required.

## Art job files

An art job is a small JSON request with a stable subject, requested poses, references, and export/QA constraints:

```json
{
  "format": 1,
  "id": "red-cap-east",
  "subject": "person-red-cap",
  "targets": ["east-idle", "east-walk-1", "east-walk-2"],
  "references": ["../art/characters/source/person-red-cap-motion-east-southeast.png"],
  "requirements": {"background": "transparent", "frame": "32x48", "footAnchor": [16, 45]},
  "retryLimit": 2
}
```

Create a handoff record for a manual image tool. The record hashes the job and reference files and starts in `awaiting-artwork`; it never calls a paid service or writes image assets:

```sh
npm run art:jobs -- handoff content/art-jobs/red-cap-east.json /tmp/red-cap-east.handoff.json
```

The `mock-result` command exercises the same record shape without contacting a generator. It bounds attempts to three and retains a short error when a simulated attempt fails:

```sh
npm run art:jobs -- mock-result /tmp/red-cap-east.handoff.json /tmp/red-cap-east.result.json --attempts 2 --error "manual review requested a new silhouette"
```

This is a handoff and checkpoint contract, not a ComfyUI client or image importer. Returned image files still go through the normal provenance, export and visual review steps.

## Structured adventure briefs

A brief uses format 1 with a kebab-case pack id, name, biome, ordered routes, route landmarks and species roles, goals, and an ending. The first route has ID `start`; later route IDs become additional maps. Compile to a **new** directory so authoring never replaces an existing playable pack:

```sh
npm run brief:compile -- content/briefs/willow-hollow.json /tmp/willow-hollow-candidate
npm run pack -- preview-pack /tmp/willow-hollow-candidate start
```

Compilation creates a standard pack scaffold, adds the remaining linked maps, retains the original brief and revision in `brief.json`, refreshes integrity hashes, and runs the pack validator. Invalid briefs fail with field-specific messages; an existing candidate path is refused. Candidate maps are generated scaffolds: route landmark and species-role ideas stay review notes in the retained brief and still need to be authored into playable map/registry data. There is no automatic promotion step, and the current playable pack is never changed.
