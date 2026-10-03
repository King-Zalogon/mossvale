# Agent claims and handoffs

GitHub issues and pull requests are authoritative for current status. Use this log to make local work visible across coding agents; update it when claiming, changing scope, handing work off, or integrating. Keep entries short and include the source/base commit and the handoff commit. Dates use the repository host's local calendar date.

## Active and recent work

| Date | Issue / scope | Owner lane | Branch | Head / base | Evidence | Blockers / next step |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-03 | #103 API inventory and agent handoff docs | Core engineering / agent workflow | `codex/issue-103-api-handoff` | Work head `77d8d98`; base `origin/main` `a62db72` (merged at `138c6cb`); handoff record `9ba4ba5` | `npm run verify` passed on the merged code head: 210 unit tests and all browser checks, including creature combat | No blocker; root task coordinates PR #107 integration |
| 2026-10-03 | #27 whole-adventure integration check across all map pairs | World integration | `ccr-075e1d10-ok9hef` | Base `origin/main` `8dbf72f` | `npm run verify` (see PR) | Adds `tests/integration.test.mjs` and `docs/MAP_INVENTORY.md`; fixes arrival spawns (Frostveil `pass-return`/`east-return`, Orchard `ridge-return`, Amber `basin-return`) and Amber west now returns to the orchard. |
| 2026-10-03 | #53 badlands pair: expanded Amber Ridge + new `stone-basin` map | World / content design | `ccr-075e1d10-ok9hef` | Base `origin/main` `0e7fa00` | `npm run verify`, `npm run build:game` (see PR) | Data-only plus `scripts/gen-badlands-maps.py`; Frostveil west exit now lands at Amber `east-return`. No #51/#54 content touched. |
| 2026-10-03 | #52 wetland pair: expanded Reedfen + new `stilt-isles` map | World / content design | `ccr-075e1d10-ok9hef` | Base `origin/main` `aeae4d1` | `npm run verify`, `npm run build` (see PR) | Data-only plus `scripts/gen-wetland-maps.py`; no #51/#53/#54 content touched. Stilt art batch still optional. |

## Entry format

`YYYY-MM-DD | #issue / bounded scope | owner lane | branch | head and base | checks or review evidence | blocker and next owner/action`

When work is integrated, add the integration commit and mark the handoff complete. Do not treat a branch name or this log as proof that a GitHub issue is claimed, a PR is current, or CI is green; check the linked GitHub records.
