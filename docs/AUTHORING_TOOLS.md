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

An optional ComfyUI adapter submits an API-format workflow to an explicitly configured loopback endpoint only. It writes a checkpoint with the prompt ID and bounded request attempts; generation still happens outside the game:

```sh
npm run art:jobs -- comfy-submit /tmp/red-cap-east.handoff.json workflows/red-cap-east.json /tmp/red-cap-east.checkpoint.json --endpoint http://127.0.0.1:8188
```

After either a manual tool or ComfyUI has produced the target PNGs, import a manifest into a new review directory. Each target must appear exactly once. The importer checks PNG signatures and size limits, copies files without replacing existing files, and records their SHA-256 hashes. Those candidates still go through the normal provenance, export, and visual review steps:

```sh
npm run art:jobs -- import-batch /tmp/red-cap-east.handoff.json /tmp/red-cap-east.result.json /tmp/red-cap-east-files.json /tmp/red-cap-east-review --adapter comfyui-local
```

The manifest uses `{ "files": [{ "target": "east-idle", "path": "/path/to/east-idle.png" }] }`. Use `--adapter manual` for manually generated images. Generator binaries, workflows, and model weights are not runtime dependencies.

## Structured adventure briefs

A brief uses format 1 with a kebab-case pack id, name, biome, ordered routes, route landmarks and species roles, goals, and an ending. The first route has ID `start`; later route IDs become additional maps. Compile to a **new** directory so authoring never replaces an existing playable pack:

```sh
npm run brief:compile -- content/briefs/willow-hollow.json /tmp/willow-hollow-candidate
npm run pack -- preview-pack /tmp/willow-hollow-candidate start
```

Compilation validates the complete brief, creates a standard pack scaffold in a temporary directory, adds the remaining linked maps, retains the source brief and revision in `brief.json`, refreshes integrity hashes, and runs the pack validator before atomically moving the finished candidate into place. It also writes `candidate-review.html` with the brief-to-map route list, requested landmarks and species roles, goals, ending, and links to generated map files. Invalid briefs create no candidate, an existing candidate path is refused, and destinations inside the repository are rejected. Candidate maps are generated scaffolds: route landmark and species-role ideas stay review notes in the retained brief and still need to be authored into playable map/registry data. There is no automatic promotion step, and the current playable pack is never changed.

## Scene scripts and continuity handoffs

Scene-level narrative intent uses the separate versioned format in [`content/scene-scripts/`](../content/scene-scripts/README.md), pinned to the current catalogue `sourceRevision`. It reuses catalogue IDs and existing pack/map contracts; it is not executable JavaScript or a runtime cutscene format. Run the local schema/reference validator with `node scripts/scene-script.mjs <scene.json>`. It prints a machine-readable gap report; pass `--report <new-path.json>` to save it, and `--catalogue <catalogue.json>` to validate against an exported catalogue. A scene with gaps can be structurally valid while not yet playable. See the writer/builder prompts and supported plus extension-request examples before proposing a scene.
