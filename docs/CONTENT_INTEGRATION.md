# Integrating stacked content branches

Some content branches depend on a shared data change. Integrate the base change first, then rebase the dependent change onto the updated `main` and run the full checks on that exact head.

## Creature roster and meadow map stack

PR [#64](https://github.com/King-Zalogon/mossvale/pull/64) contains the #51 orchard maps and is based on the #24 roster branch. Integrate them in this order:

1. Review and merge the #24 creature roster change into `main`.
2. Rebase the #51/#64 orchard work onto the new `main`; resolve any shared manifest or save-format changes there.
3. Run `npm ci`, `npm run verify`, and `npm run build` on the rebased head. Keep all save, browser, and animation checks in the run.
4. Merge #51 only when those checks pass on its current head. Do not merge the dependent head first or treat a green check on its old base as evidence for the rebased commit.

The CI workflow runs this sequence of checks on Linux and Windows. A formatter ignore is not a substitute for fixing changed files: use `npx prettier --check <changed files>` to distinguish an actual formatting regression from the repository baseline.
