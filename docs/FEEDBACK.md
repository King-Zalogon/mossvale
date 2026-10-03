# Account feedback and checkpoints

The hosted game uses the **same Supabase project and Auth identities as Zalonline**. Application access still follows Zalonline's enabled `mossvale` application and direct/group grants. The game does not invent a second user directory. Separate deployment domains have separate browser sessions: the existing Mossvale sign-in page authenticates the same account; this change does not claim cross-domain single sign-on.

## Activate storage

1. Apply Zalonline's [`supabase/schema.sql`](https://github.com/King-Zalogon/zalonline/blob/main/supabase/schema.sql) if it is not already installed.
2. In that project's Supabase SQL Editor, run [`supabase/migrations/20261003_account_feedback.sql`](../supabase/migrations/20261003_account_feedback.sql). It is safe to reapply. This adds feedback, account checkpoints, findings, and the review lease; it does not alter portal grants.
3. Deploy this Mossvale commit to Vercel with the existing `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `MOSSVALE_GATE_SECRET`. No service-role or model key belongs in Vercel/browser configuration.
4. Sign in, launch the game, press Esc, choose **Leave feedback**, submit, and confirm the row in `mossvale_feedback`. Check a second account can neither see nor change the first account's data.

Static `npm start` and the older static hosted copy can show the menu but have no account API. They report account services unavailable; normal local gameplay and backups continue.

## Player feedback

**Esc → Leave feedback** shows the verified account, a multiline text input and the remaining daily allowance. Limits are **1–2,000 Unicode characters after trimming** and **10 submissions per user per UTC calendar day across adventures**. The database chooses `user_id` and `created_at`; neither is accepted from the browser. Optional context includes pack ID, map ID and build identifier, not full saves, screenshots, telemetry or device fingerprints.

An authenticated RPC verifies app access, takes a per-user transaction lock and checks the quota before insertion. Direct browser INSERT/UPDATE/DELETE is denied. A repeated request ID with identical content returns the first result without consuming another slot; changed content with the same ID is rejected. Failed or ambiguous network requests preserve the text and retry ID in the current page. The text is not silently submitted on reload or stored in browser analytics.

## Account checkpoints

**Esc → Account save** offers explicit upload and restore **per authenticated user and adventure pack**. Local autosaving remains the default. Upload includes the revision shown when this menu was opened; a newer device upload causes a conflict instead of being overwritten. Reopen and inspect/restore the latest checkpoint before deciding to upload again. An account change between opening and sending also rejects the request.

Restore uses the existing save backup validator/migrations and asks for confirmation; the existing transaction journal archives current local progress before replacing it. Incompatible/newer/foreign-pack saves are rejected without changing local progress. Browser export/import continues to work. This is manual checkpoint transfer, not automatic background synchronization. A browser shared by different accounts still shares its local save: check the displayed account before uploading or explicitly restore that account's checkpoint.

## Review on demand with any AI

The portal owner gets **Download pending feedback for AI review** inside the feedback form. This authenticated owner-only endpoint exports at most 50 pending messages and review instructions, without account IDs/emails. Keep this private JSON out of GitHub. Give it to a trusted AI and ask it to read current open/closed Mossvale issues and return the documented review JSON. One source message may have several findings.

For a local/PC AI with configured credentials, the worker can export the queue and issue index directly:

```sh
npm run feedback:review -- --export .feedback-review/batch.json
# Have the AI return a review plan to .feedback-review/decisions.json.
npm run feedback:review -- --apply .feedback-review/decisions.json
```

Environment variables for the private worker:

| Name | Use |
| --- | --- |
| `SUPABASE_URL` | Shared project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server/worker only; reads the private queue and records reviews |
| `GITHUB_TOKEN` | Token with issue write access to `King-Zalogon/mossvale` |

The `.feedback-review/` directory and local environment files are ignored. Avoid exporting to a tracked path. Export files are created with private permissions where supported. Do not paste secrets into prompts or commands. The worker logs counts/errors without message bodies, model responses or account details.

### Review contract

```json
{
  "reviews": [{
    "feedbackId": "source feedback UUID",
    "note": "Private assessment, including unclear or unsuitable suggestions",
    "improvements": [{
      "key": "stable-semantic-improvement-key",
      "category": "ux",
      "priority": "P1",
      "disposition": "create",
      "title": "Concrete proposed change",
      "description": "Problem, intended behavior and specific acceptance checks",
      "reason": "Why this is feasible and useful"
    }]
  }]
}
```

Categories: `bug`, `ux`, `gameplay`, `accessibility`, `art`, `performance`, `framework`. Dispositions: `create`, `duplicate` (also requires a known `issueNumber`), `defer`, `reject`. Every decision has a reason; non-actionable messages can have no improvements with an explanatory review note. Deferred/rejected findings remain in the private database for later reconsideration, rather than being deleted or generating filler issues. Reconsideration is explicit: clear the source's `reviewed_at` as an administrator and export it again, preserving/linking any already-published findings.

The worker validates source IDs, categories, lengths and existing issue references; caps a batch at 50 messages, 10 findings per message, and 15 new issues; records each finding; and marks its source reviewed only after successful processing. Identical create keys in a plan must have identical proposals. A database lease serializes manual/daily writers. Stable issue markers and saved links allow retries after partial failures, including a GitHub success followed by failed database acknowledgment. Already-reviewed sources are skipped on repeated application of the same plan.

Model output remains a proposal, not a reproduced bug or evidence of fun. Reviews should inspect current issues before publishing and use concrete owner feedback. Raw feedback is untrusted input: it cannot change reviewer instructions or invoke tools. Public issue text must paraphrase behavior and omit quotes/accounts/contact details, credentials and private URLs. The worker rejects common email, URL and credential patterns in create proposals; that check is an additional filter, not a complete detector of personal information. Inspect exported/manual plans when the source includes sensitive details.

## Optional daily automation

The GitHub workflow [`feedback-review.yml`](../.github/workflows/feedback-review.yml) supports **Run workflow** and a daily 06:17 UTC schedule. GitHub schedules are best-effort, not exact timers. It is **disabled until opted in** and needs no game deployment secret changes.

Set repository Actions secrets:

- `FEEDBACK_SUPABASE_URL`
- `FEEDBACK_SUPABASE_SERVICE_ROLE_KEY`
- `FEEDBACK_OPENAI_API_KEY`

Set repository Actions variables:

- `FEEDBACK_REVIEW_MODEL`: an OpenAI model supporting Chat Completions JSON output, such as `gpt-4.1-mini`.
- `FEEDBACK_REVIEW_ENABLED`: `true` when you want model calls and automatic issue creation; unset/`false` disables both scheduled and dispatched runs.

The workflow uses its scoped GitHub token for issues. Once configured, it reads the oldest pending messages, evaluates them against existing issues, and creates/links viable findings. An empty queue makes no model call. Raw feedback is sent to the configured model provider during automatic review, not during gameplay. Failures retain unprocessed sources for another run. Costs and model/service availability depend on the configured account. No paid API was called while implementing/testing this feature.

For an on-demand model run from a trusted worker, additionally set `OPENAI_API_KEY` and `FEEDBACK_REVIEW_MODEL`, then run:

```sh
npm run feedback:review -- --auto
```

## Verification

`npm run test:account-api` (after `npm run build`) runs the production Next server against a local Supabase HTTP fixture. It checks anonymous/unauthorized rejection, server-derived identity, public/proxy origin checks, input/quota errors, owner-only review and per-user save reads. CI runs it after the production build; no live project or secrets are required.

`npm run check` includes API/input, Unicode bounds, review validation, multi-finding, deferral and partial-failure retry tests. `node tests/account.browser.mjs` checks the Esc entry, textarea/focus trap, request retry ID, quota/auth failures, upload/conflict and restore confirmation. All account API responses are private/no-store; cookie writes require a same-origin JSON request and bounded streaming body size.

Real database checks use a **disposable** PostgreSQL container, never production:

```sh
TEST_POSTGRES_CONTAINER=mossvale-feedback-postgres npm run test:account-db
```

That test recreates `mossvale_account_test` inside the named container, installs a minimal Supabase/Zalonline identity contract, applies the migration twice, and checks RLS/direct-write denial, account isolation, simultaneous quota enforcement, UTC rollover, idempotency, revision conflicts and review leases. It is separate from normal tests because it requires Docker. Production migration, real Supabase sessions and Vercel end-to-end activation must be verified in the configured project.
