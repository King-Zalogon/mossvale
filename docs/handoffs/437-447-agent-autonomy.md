# 437/447 Local gate and agent-owned workflow (with 438, 441, 442)

Issue: #437
Branch: claude/serene-hopper-xu1efl
Status: in-review
PR: pending
Owner lane: Core engineering / tooling

## Scope

Local verification gate (`npm run gate`, `gate:check`), test auto-discovery and pooled browser runner (#438, #442), pinned Python environment (#441), per-task handoffs, `npm run regen`, and the rewritten finishing rules (#447). Related issues are listed in #449.

## Delivered

- #438: `scripts/run-tests.mjs` discovers `tests/*.test.mjs`; `tests/test-discovery.test.mjs` guards every runner list. The previously orphaned `adventures`, `discovery`, `version` unit tests and `battle-interruption` browser test now run. The two `discovery.test.mjs` failures were stale fixtures (hard-coded 25×25 mask; the meadow is 72×64), not a save-codec bug.
- #442: `scripts/run-browser-tests.mjs` (pool, per-file timeout, process-tree kill, serial retry reported as flaky); stale `tests/run-browser.mjs` removed.
- #441: `requirements.txt` (Pillow pin), `npm run setup` (`.venv/`), launcher prefers `.venv` and prints a one-line mismatch hint on failure, `.nvmrc`.
- #437: `npm run gate` / `gate:check` (`scripts/gate.mjs`, `scripts/lib/gate.mjs`), evidence under `docs/handoffs/evidence/`; `AGENTS.md`, PR template, README, CONTENT_INTEGRATION, PUBLISHING rewritten for the local gate.
- #447 (part): per-task handoffs, generated `INDEX.md`, `npm run regen`, old log frozen, finishing rules in `AGENTS.md`. Not done: labels and the open-issue sweep (need GitHub label/issue write access beyond this PR).
- #439: `npm audit fix` (next 16.4.6, zod 4.6.7, body-parser 2.4.0), `zod` declared, `npm run audit` gate stage, Dependabot to `integration`.
- #440: dormant `ci.yml` reduced to one Ubuntu job running the gate.

## Hotspot files touched

`package.json` scripts, `AGENTS.md`.

## Limitations and next steps

Labels, the open-issue sweep and the baseline gate run on `main` are tracked in #447/#437.
