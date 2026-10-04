# Integrating dependent branches

The owner's current workflow targets `integration`. Historical roster/map stacks do not authorize main merges.

1. Fetch origin and confirm integration exists. Create an agent issue branch from latest origin/main; never commit directly to main/integration.
2. Integrate prerequisite PRs into integration first. Update the dependent working branch with latest integration, preserving both branches' changes and resolving conflicts.
3. Run npm verify and relevant regressions on the final head; run npm build for shipped-output changes. Preserve save, browser and animation checks. Document catalogue impact using [the authoring contract](AUTHORING_CONTRACT.md).
4. Open/update the PR toward integration. Wait for required CI and reviews; fix attributable failures. Do not bypass checks or merge pending/failed/conflicting PRs.
5. Merge with the established strategy and report the integrated commit and local test steps. Main promotion requires explicit owner authorization for that task.

CI verifies Linux and Windows. Format changed files; do not add ignores to hide regressions. See [AGENTS.md](../AGENTS.md) and [Agent start here](AGENT_START_HERE.md).
