# Current local authoring catalogue

Issues #182/#183, contract #181 and epic #180. This stage is repository-local; online access and Zalonline remain out of scope. Visual browsing and portable writer-context export are available through #184. Scene script handoffs are covered separately by #185.

## Read and discover

Start with [the compact index](../content/catalogue/INDEX.md); find a resource by name, element, appearance or ID. [catalogue.json](../content/catalogue/catalogue.json) contains complete fiches. [facts.json](../content/catalogue/facts.json) records extracted definitions, animation metadata, art identity/review data, exclusions and exact source hashes. Use the visual browser below for cropped atlas previews and associated review sheets.

For visual browsing, run `npm run catalogue:browse` and open the loopback URL printed by the command (default `http://127.0.0.1:4179/`). Stop it with Ctrl+C. It binds only to `127.0.0.1`, reads the current generated catalogue and serves only registered visual previews. Search across names, descriptions and IDs, then filter by visual kind, associated creature element, appearance tag or availability. Fiche data loads only after selecting a visual. Art identity tags come from reviewed metadata where available; otherwise the browser only shows the registered source kind, and it does not infer appearance from pixels or filenames. Atlas cards show a crop based on registered frame metadata; opening a fiche reveals the complete source sheet and documents its frame states. Creature follower/combat fiches also reuse their existing roster contact sheets, with their review/game scale stated in the caption. Full images load on demand. All controls use native keyboard-accessible inputs/buttons.

Select one or more visuals in the browser's fiche panel and copy their stable IDs, then export a portable context folder:

```sh
npm run catalogue:export -- --out=/tmp/mossvale-writer-context --ids=visual:creature-emberkin,visual:creature-emberkin-follower
```

On Windows PowerShell, use for example `npm run catalogue:export -- --out="$env:TEMP/mossvale-writer-context" --ids=visual:creature-emberkin`. The export has `index.html`, the full text catalogue, writer instructions, a deterministic SHA-256 manifest and local copies of selected visuals' registered source previews plus any existing creature review sheets. Open its `index.html` offline, copy the folder to another machine, or upload it to a chat. A separate cloud assistant cannot read this computer's localhost or files that were not included in the upload. The source checkout's technical-reference paths are retained as authoring pointers; they are not copied source code. The export omits unselected images and does not include account, feedback or secret data. The parent directory must already exist. It refuses output paths within the checkout, symlinked parents, existing destinations, unknown IDs, missing files and unregistered previews. It stages output then renames the completed folder into place.

To include every registered visual preview (currently a larger folder), run `npm run catalogue:export -- --out=/tmp/mossvale-writer-context --all`. Either `--all` or `--ids` is required to prevent accidentally preparing the full image set. Both modes include all text fiches, including proposed gaps; only entries marked available describe implemented behavior. The manifest records source revision and hashes of every included file except itself, so exports can be verified after moving them.

IDs namespace registry records and pack identities: `visual:creature-fernling` selects artwork, `species:mossvale/fernling` selects gameplay species, and `map:mossvale/meadow` selects a map. No runtime/save identity was renamed. A landmark role is distinct from a specific placed landmark. A region/biome is not an exit graph. Definitions from fixture packs demonstrate reuse; the selected pack still controls what's present in one adventure.

Available means the described resource/contract is present with owning regression evidence, not that owner taste or every sprite's semantic facing has been freshly approved. Raw visual review decisions and pending owner taste remain in extracted records. Proposed timed effects, autonomous NPC movement and animated home rest are explicitly unavailable. Percentage item effect metadata does not replace the actual fixed-24-HP battle potion. Domain loot/gather helpers do not establish an integrated live loot flow.

## Update and verify

```sh
npm run catalogue:write
npm run catalogue:check
node --test tests/catalogue-contract.test.mjs tests/catalogue.test.mjs
npm run catalogue:impact -- --base origin/integration
```

`catalogue:write` deterministically extracts the registered resources, applies reviewed family templates and curated capabilities, and writes the three generated files. Never edit those outputs by hand. `templates.json` holds common per-family explanations; `curated.json` holds explicit capabilities, proposed gaps, exclusions and audit baseline. Review both against real implementation before regeneration. A new resource family must gain a collector, a semantic template and coverage tests; an exported helper alone is not proof of an authorable capability. The browser and context exporter validate the generated files against canonical sources before serving or copying them; run `npm run catalogue:write`, review changes, then `npm run catalogue:check` after a legitimate catalogue update.

Large map/story/prefab/rule configuration has a null fiche default: consult its canonical builder reference rather than embed full geometry in the writer fiche. Other definitions retain the existing record as their reuse starting value, not a promise of a universal engine default.

The baseline commit records the inspected integration version; the full source hash map/digest identifies the exact current input bytes, including changes not yet committed. Do not automatically stamp HEAD or a wall-clock timestamp into output: that would make untouched builds stale or non-reproducible. Update the reviewed baseline deliberately when auditing a new integration revision. Source hashes prove freshness and integrity, not truth of the explanations.

Collection imports only known pure data/domain modules and reads explicitly bounded registry/resource paths. It does not execute arbitrary author-supplied code or export private feedback/account data. Source files and referenced previews/evidence must remain inside the repository; symlink escapes and missing files fail. No models, network services or image generation are needed.

## Coverage boundary

The collector covers every asset-manifest entry, biome, terrain token, elemental move, sound/ambience cue, selected shipped/fixture pack, registry species/type/region/tuning, map, placed landmark, landmark kind, item, pack prefab, reusable prefab fixture and terrain source SVG. Shared saves, exploration, objectives, route gates, inventory, event log, editor and brief compiler have explicit curated capability fiches.

Internal exports stay in the existing API inventory rather than becoming fictitious capabilities. Raw generation inputs/intermediate art, archives and private portal services are excluded as selectable resources with reasons in curated.json. The facts/source hashes preserve evidence of owning implementation without presenting every internal file as an object the writer can place. New systems still require implementation review and explicit capability registration.

## PR impact records

Local freshness/schema/reference checks run inside `npm run validate`. PR CI additionally compares the branch with its merge base against `origin/integration`, using full checkout history. Missing history is an error, not an automatic skip. Renamed files are treated as removal/addition, preserving both impact paths. Local impact checks include committed branch changes, staged and unstaged edits, and non-ignored untracked files. Ignored files are excluded. This lets the command provide meaningful pre-commit feedback; PR CI still evaluates the committed branch against its merge base.

Add or modify a JSON record under `content/catalogue/reviews/<issue>-<summary>.json`:

```json
{
  "format": 1,
  "changes": [
    {
      "paths": ["dist/src/domain/battle.js"],
      "entries": ["item:battle-potion"],
      "disposition": "updated",
      "reason": "Describe the exact changed authorable behavior and corresponding fiche updates.",
      "evidence": ["tests/battle-actions.test.mjs"]
    }
  ]
}
```

Only records changed in the current PR count. Paths must be actually changed, entry IDs must exist, evidence must resolve safely, and an `updated` record requires a real catalogue definition/output change. An unrelated Markdown edit cannot satisfy the policy. Use `no-semantic-impact` only with a scoped substantive explanation and evidence when authorable behavior is unchanged (for example a comment-only refactor). Reviewers must verify the explanation and the relevance of entry selections; the checker cannot establish semantic truth. There is no blanket waiver or check-disabling flag.

Changes to registered/owning paths, all game modules/maps/assets, authoring fixtures, art metadata/sources and selected authoring tools require assessment. New non-game systems outside this map must explicitly extend coverage when they introduce authorable capabilities; code review must detect that boundary.

The workflow runs the gate, but configuring it as a required GitHub check is repository administration. The current agent token cannot inspect/update integration branch protections (403). Owner configuration may therefore be needed to make GitHub technically prevent merges; agents still must obey the documented checks regardless. No protection is assumed, modified or bypassed.
