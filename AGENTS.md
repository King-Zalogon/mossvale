# Repository agent instructions

Read [Agent start here](docs/AGENT_START_HERE.md), the target issue and its comments before editing. Check the live claim/PR queue and record your branch in the issue and handoff log. User instructions override repository guidelines.

## Branches and integration

Confirm `origin/integration` exists. If missing, report it and stop rather than target another branch. Create `codex/<issue>-<summary>`, `claude/<issue>-<summary>` or the assigned prefix from latest `origin/main`. Update the working branch against latest `origin/integration` before integration, preserving both branches' changes. Never commit directly to main or integration. PRs target integration. Main promotion and production deployment require explicit authorization for that task.

Run `npm run verify` and relevant regression checks on the final head; run `npm run build` when shipped output changes. Fix attributable failures. Merge only with no conflicts, pending required checks, failed required checks or pending reviews, using the repository's established merge strategy. Never bypass checks/protections or weaken production access for testing. Report branch, PR, CI, integration merge commit, concrete local test steps and limitations.

## Documentation is part of completion

Follow [the authoring documentation contract](docs/AUTHORING_CONTRACT.md). New, modified or removed authorable resources/capabilities require matching fiches, examples, limitations, status and compatibility treatment. Generated facts come from canonical registries; curate semantic explanations with implementation evidence. A valid schema is not proof of factual correctness. Read the per-kind requirements before implementing a resource.

The six entries in `content/catalogue/examples.json` are teaching fixtures, not a complete current catalogue. Until #182 populates the authoritative catalogue, add/update a reviewed contract example or linked technical documentation for affected authorable behavior and record the future catalogue impact in the PR. Never claim coverage enforcement already exists: #183 owns that gate. A no-semantic-impact explanation identifies changed files, why authorable behavior is unchanged and checks supporting that conclusion; reviewers assess it.

Keep domain rules pure. Reuse canonical save codecs, RNG, loaders, pack/map validators and existing authoring tools; do not create parallel implementations. Use stable runtime IDs; catalogue namespaces do not rename save identities. Do not mark proposed mechanics or unreviewed art as available.
