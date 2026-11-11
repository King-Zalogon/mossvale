# Repository agent instructions

Read [Agent start here](docs/AGENT_START_HERE.md), the target issue and its comments before editing. Check the live claim/PR queue, comment your claim on the issue and record your branch in your handoff file. User instructions override repository guidelines.

## Branches and integration

Confirm `origin/integration` exists. If missing, report it and stop rather than target another branch. Create `codex/<issue>-<summary>`, `claude/<issue>-<summary>` or the assigned prefix from latest `origin/main`. Update the working branch against latest `origin/integration` before integration, preserving both branches' changes. Never commit directly to main or integration. PRs target integration. Main promotion and production deployment require explicit authorization for that task.

GitHub Actions is disabled by owner decision; hosted CI is not a merge condition and its absence is not a blocker to report. The merge precondition is the local gate: merge latest `origin/integration` into the working branch, commit, run `npm run gate` (lint, format, validate, unit, art, browser, build, account API and audit stages; `--skip <stage> --reason "<why>"` only for skippable stages, such as `art` on a docs-only change), commit the generated record under `docs/handoffs/evidence/`, and confirm `npm run gate:check` passes for the final head. Fix attributable failures. Never merge with conflicts, a failing or missing gate record, or unresolved review requests, and never bypass checks/protections or weaken production access for testing.

## Finishing a task

Unless the issue is labelled `needs-owner`, finish it yourself: merge the PR into `integration` with the repository's established strategy, comment on the issue with the PR link, integration merge commit and gate evidence sha, close the issue as completed (PRs to `integration` do not trigger `Closes #n`), delete your own head branch, and complete your handoff file. Keep the issue open only when it is an epic or the issue explicitly asks for owner acceptance. Waiting for the owner is correct only for `needs-owner` work: promotion to main and production deployment, applying migrations to the live Supabase project, and acceptance the issue asks for.

Record your claim and handoff in `docs/handoffs/<issue>-<short-name>.md` (see `docs/handoffs/README.md`), never in a shared file; `docs/AGENT_HANDOFFS.md` is a frozen archive. Generated files (`content/catalogue/**`, `docs/API_INVENTORY.md`, `docs/handoffs/INDEX.md`) are never merged by hand: on conflict take either side and run `npm run regen`.

Report branch, PR, gate evidence, integration merge commit, concrete local test steps and limitations.

## Documentation is part of completion

Follow [the authoring documentation contract](docs/AUTHORING_CONTRACT.md). New, modified or removed authorable resources/capabilities require matching fiches, examples, limitations, status and compatibility treatment. Generated facts come from canonical registries; curate semantic explanations with implementation evidence. A valid schema is not proof of factual correctness. Read the per-kind requirements before implementing a resource.

The six entries in `content/catalogue/examples.json` are teaching fixtures. The complete local catalogue is generated from canonical registries and reviewed descriptions; follow [catalogue usage/update instructions](docs/CATALOGUE.md). Run `npm run catalogue:write`, review the diff and pass `npm run catalogue:check`. Resource/behavior PRs add a scoped impact record and pass `npm run catalogue:impact -- --base origin/integration`. No-semantic-impact explanations require reviewer assessment and do not waive structural/freshness checks. Never claim the automated checker certifies prose accuracy or that GitHub protections are configured without checking repository administration.

Keep domain rules pure. Reuse canonical save codecs, RNG, loaders, pack/map validators and existing authoring tools; do not create parallel implementations. Use stable runtime IDs; catalogue namespaces do not rename save identities. Do not mark proposed mechanics or unreviewed art as available.
