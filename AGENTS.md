# Repository agent instructions

Read [Agent start here](docs/AGENT_START_HERE.md), the target issue and its comments before editing. Check the live claim/PR queue and record your branch in the issue and handoff log. User instructions override repository guidelines.

## Branches and integration

Confirm `origin/integration` exists. If missing, report it and stop rather than target another branch. Create `codex/<issue>-<summary>`, `claude/<issue>-<summary>` or the assigned prefix from latest `origin/main`. Update the working branch against latest `origin/integration` before integration, preserving both branches' changes. Never commit directly to main or integration. PRs target integration. Main promotion and production deployment require explicit authorization for that task.

Run `npm run verify` and relevant regression checks on the final head; run `npm run build` when shipped output changes. Fix attributable failures. Merge only with no conflicts, pending required checks, failed required checks or pending reviews, using the repository's established merge strategy. Never bypass checks/protections or weaken production access for testing. Report branch, PR, CI, integration merge commit, concrete local test steps and limitations.

## Documentation is part of completion

Follow [the authoring documentation contract](docs/AUTHORING_CONTRACT.md). New, modified or removed authorable resources/capabilities require matching fiches, examples, limitations, status and compatibility treatment. Generated facts come from canonical registries; curate semantic explanations with implementation evidence. A valid schema is not proof of factual correctness. Read the per-kind requirements before implementing a resource.

The six entries in `content/catalogue/examples.json` are teaching fixtures. The complete local catalogue is generated from canonical registries and reviewed descriptions; follow [catalogue usage/update instructions](docs/CATALOGUE.md). Run `npm run catalogue:write`, review the diff and pass `npm run catalogue:check`. Resource/behavior PRs add a scoped impact record and pass `npm run catalogue:impact -- --base origin/integration`. No-semantic-impact explanations require reviewer assessment and do not waive structural/freshness checks. Never claim the automated checker certifies prose accuracy or that GitHub protections are configured without checking repository administration.

Keep domain rules pure. Reuse canonical save codecs, RNG, loaders, pack/map validators and existing authoring tools; do not create parallel implementations. Use stable runtime IDs; catalogue namespaces do not rename save identities. Do not mark proposed mechanics or unreviewed art as available.
