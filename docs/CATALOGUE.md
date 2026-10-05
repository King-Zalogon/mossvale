# Current local authoring catalogue

Issues #182/#183, contract #181 and epic #180. This stage is repository-local; online access, Zalonline, visual browsing/export (#184) and scene script handoffs (#185) remain separate work.

## Read and discover

Start with [the compact index](../content/catalogue/INDEX.md); find a resource by name, element, appearance or ID. [catalogue.json](../content/catalogue/catalogue.json) contains complete fiches. [facts.json](../content/catalogue/facts.json) records extracted definitions, animation metadata, art identity/review data, exclusions and exact source hashes. The index does not attach every image: consult a fiche's safe relative preview path only when needed. A sprite atlas is not a cropped subject preview; #184 owns that presentation.

IDs namespace registry records and pack identities: `visual:creature-fernling` selects artwork, `species:mossvale/fernling` selects gameplay species, and `map:mossvale/meadow` selects a map. No runtime/save identity was renamed. A landmark role is distinct from a specific placed landmark. A region/biome is not an exit graph. Definitions from fixture packs demonstrate reuse; the selected pack still controls what's present in one adventure.

Available means the described resource/contract is present with owning regression evidence, not that owner taste or every sprite's semantic facing has been freshly approved. Raw visual review decisions and pending owner taste remain in extracted records. Proposed timed effects, autonomous NPC movement and animated home rest are explicitly unavailable. Percentage item effect metadata does not replace the actual fixed-24-HP battle potion. Domain loot/gather helpers do not establish an integrated live loot flow.

## Update and verify

```sh
npm run catalogue:write
npm run catalogue:check
node --test tests/catalogue-contract.test.mjs tests/catalogue.test.mjs
npm run catalogue:impact -- --base origin/integration
```

`catalogue:write` deterministically extracts the registered resources, applies reviewed family templates and curated capabilities, and writes the three generated files. Never edit those outputs by hand. `templates.json` holds common per-family explanations; `curated.json` holds explicit capabilities, proposed gaps, exclusions and audit baseline. Review both against real implementation before regeneration. A new resource family must gain a collector, a semantic template and coverage tests; an exported helper alone is not proof of an authorable capability.

Large map/story/prefab/rule configuration has a null fiche default: consult its canonical builder reference rather than embed full geometry in the writer fiche. Other definitions retain the existing record as their reuse starting value, not a promise of a universal engine default.

The baseline commit records the inspected integration version; the full source hash map/digest identifies the exact current input bytes, including changes not yet committed. Do not automatically stamp HEAD or a wall-clock timestamp into output: that would make untouched builds stale or non-reproducible. Update the reviewed baseline deliberately when auditing a new integration revision. Source hashes prove freshness and integrity, not truth of the explanations.

Collection imports only known pure data/domain modules and reads explicitly bounded registry/resource paths. It does not execute arbitrary author-supplied code or export private feedback/account data. Source files and referenced previews/evidence must remain inside the repository; symlink escapes and missing files fail. No models, network services or image generation are needed.

## Coverage boundary

The collector covers every asset-manifest entry, biome, terrain token, elemental move, sound/ambience cue, selected shipped/fixture pack, registry species/type/region/tuning, map, placed landmark, landmark kind, item, pack prefab, reusable prefab fixture and terrain source SVG. Shared saves, exploration, objectives, route gates, inventory, event log, editor and brief compiler have explicit curated capability fiches.

Internal exports stay in the existing API inventory rather than becoming fictitious capabilities. Raw generation inputs/intermediate art, archives and private portal services are excluded as selectable resources with reasons in curated.json. The facts/source hashes preserve evidence of owning implementation without presenting every internal file as an object the writer can place. New systems still require implementation review and explicit capability registration.

## PR impact records

Local freshness/schema/reference checks run inside `npm run validate`. PR CI additionally compares the branch with its merge base against `origin/integration`, using full checkout history. Missing history is an error, not an automatic skip. Renamed files are treated as removal/addition, preserving both impact paths. Local impact checks assess committed changes; commit the candidate before running them.

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
