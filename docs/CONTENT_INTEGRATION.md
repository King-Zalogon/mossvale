# Integrating dependent branches

The owner's current workflow targets `integration`. Historical roster/map stacks do not authorize main merges.

1. Fetch origin and confirm integration exists. Create an agent issue branch from latest origin/main; never commit directly to main/integration.
2. Integrate prerequisite PRs into integration first. Update the dependent working branch with latest integration, preserving both branches' changes and resolving conflicts.
3. Run `npm run gate` (which includes `verify`'s checks) on the final head; run npm build for shipped-output changes. Preserve save, browser and animation checks. Document catalogue impact using [the authoring contract](AUTHORING_CONTRACT.md).
4. Open/update the PR toward integration. Run `npm run gate` on the final head and commit its evidence record; fix attributable failures. Do not bypass checks or merge failing, unverified or conflicting PRs.
5. Merge with the established strategy and report the integrated commit and local test steps. Main promotion requires explicit owner authorization for that task.

Hosted CI is disabled by owner decision; the local gate record is authoritative. Format changed files; do not add ignores to hide regressions. See [AGENTS.md](../AGENTS.md) and [Agent start here](AGENT_START_HERE.md).

## Conflicts in generated files

`content/catalogue/**`, `docs/API_INVENTORY.md` and `docs/handoffs/INDEX.md` are generated. Never merge them by hand: take either side of the conflict, run `npm run regen`, review the diff and commit. `npm run catalogue:check` and `npm run validate` remain the gates.
