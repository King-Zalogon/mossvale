# Handoffs

One file per task: `docs/handoffs/<issue>-<short-name>.md`. Nothing here is shared between tasks, so concurrent branches cannot conflict. GitHub issues and PRs remain authoritative for status; a handoff records what a later agent needs to continue or audit the work.

Create the file in your first commit, update it as you go, finish it when the PR merges. `docs/handoffs/INDEX.md` is generated (`npm run handoffs:index`, included in `npm run regen`); never edit or hand-merge it. `docs/handoffs/evidence/` holds the `npm run gate` records.

## Template

```markdown
# <issue number> <title>

Issue: #<n>
Branch: <branch name>
Status: claimed | in-review | merged | abandoned
PR: <link or none yet>
Owner lane: <lane from docs/ARCHITECTURE.md>

## Scope

What this task changes and deliberately does not.

## Base and head

Created from `origin/main` <sha>; last merged `origin/integration` <sha>; head <sha>.

## Hotspot files touched

(`dist/src/controller.js`, `dist/src/main.js`, `dist/src/data/assets.js`, `package.json` scripts, or none)

## Evidence

Gate record: `docs/handoffs/evidence/<sha>.json`. Skipped stages with reasons. Manual steps and what was observed.

## Limitations and next steps

## Integration

Merge commit into `integration`: <sha>. Issue closed: yes/no (why not).
```
