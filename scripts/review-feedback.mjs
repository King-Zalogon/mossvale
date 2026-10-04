/* Private queue -> bounded review plan -> durable findings + deduplicated GitHub issues.
   Export/apply works with any AI. --auto is optional and never runs in the game browser. */
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {issueBody, marker, REVIEW_INSTRUCTIONS, validateReview} from './lib/feedback-review.mjs';

const repo = 'King-Zalogon/mossvale';
const need = key => {
  if (!process.env[key]) throw new Error(`Configure ${key} for the private review worker.`);
  return process.env[key];
};

export function createReviewer({request = fetch, env = process.env, now = () => new Date()} = {}) {
  const base = (env.SUPABASE_URL || need('SUPABASE_URL')).replace(/\/$/, '') + '/rest/v1/';
  const dbKey = env.SUPABASE_SERVICE_ROLE_KEY || need('SUPABASE_SERVICE_ROLE_KEY');
  const gitKey = env.GITHUB_TOKEN || need('GITHUB_TOKEN');
  async function call(url, options = {}) {
    const response = await request(url, {...options, signal: AbortSignal.timeout(60000)});
    if (!response.ok) throw new Error(`Review service request failed (${response.status}); no secret or message payload logged.`);
    if (response.status === 204) return null;
    return response.json();
  }
  const db = (path, method = 'GET', body, extra = {}) =>
    call(base + path, {
      method,
      headers: {apikey: dbKey, Authorization: `Bearer ${dbKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...extra},
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    });
  const gh = (path, method = 'GET', body) =>
    call('https://api.github.com/' + path, {
      method,
      headers: {
        Authorization: `Bearer ${gitKey}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    });
  async function issues() {
    const all = [];
    // Scan recent open AND closed issues so retries do not depend on search indexing latency.
    for (let page = 1; page <= 10; page++) {
      const batch = await gh(`repos/${repo}/issues?state=all&sort=updated&direction=desc&per_page=100&page=${page}`);
      all.push(...batch.filter(i => !i.pull_request).map(i => ({number: i.number, title: i.title, state: i.state, body: i.body ?? ''})));
      if (batch.length < 100) break;
    }
    return all;
  }
  const pending = () => db('mossvale_feedback?reviewed_at=is.null&order=created_at.asc&limit=50&select=id,message,pack_id,map_id,build,created_at');
  async function snapshot() {
    const [feedback, index] = await Promise.all([pending(), issues()]);
    return {
      instructions: REVIEW_INSTRUCTIONS,
      feedback,
      issues: [...index.filter(i => i.state === 'open'), ...index.filter(i => i.state !== 'open').slice(0, 50)]
        .slice(0, 200)
        .map(i => ({...i, body: i.body.slice(0, 1200)})),
    };
  }
  async function apply(plan) {
    const token = randomUUID();
    if (!(await db('rpc/mossvale_review_lock', 'POST', {p_token: token}))) throw new Error('Another feedback review is running.');
    const started = Date.now();
    try {
      if (!Array.isArray(plan?.reviews) || plan.reviews.length > 50 || plan.reviews.some(r => !/^[0-9a-f-]{36}$/i.test(r.feedbackId ?? '')))
        throw new Error('Invalid feedback review identifiers.');
      const ids = plan.reviews.map(r => r.feedbackId).join(',');
      const [feedback, index] = await Promise.all([
        ids ? db(`mossvale_feedback?id=in.(${ids})&select=id,message,pack_id,map_id,build,created_at,reviewed_at`) : [],
        issues(),
      ]);
      validateReview(plan, feedback, index);
      const results = {reviewed: 0, created: 0, linked: 0};
      for (const review of plan.reviews) {
        if (feedback.find(f => f.id === review.feedbackId)?.reviewed_at) continue;
        // Stay within the DB lease. Renew only while still holding the same token.
        if (Date.now() - started > 15 * 60 * 1000) throw new Error('Review time budget exceeded; rerun to resume.');
        if (!(await db('rpc/mossvale_review_lock', 'POST', {p_token: token}))) throw new Error('Review lease lost; stop before publishing.');
        const stored = await db(`mossvale_feedback_findings?feedback_id=eq.${review.feedbackId}&select=improvement_key,decision,issue_number`);
        for (const item of review.improvements) {
          const previous = stored.find(f => f.improvement_key === item.key);
          // Once linked, retrying a source cannot replace its meaning and publish another issue.
          if (previous?.issue_number && (previous.decision.title !== item.title || previous.decision.disposition !== item.disposition))
            throw new Error('A published finding changed meaning; review it separately.');
          let issueNumber = previous?.issue_number ?? (item.disposition === 'duplicate' ? item.issueNumber : null);
          await db(
            'mossvale_feedback_findings?on_conflict=feedback_id,improvement_key',
            'POST',
            {feedback_id: review.feedbackId, improvement_key: item.key, decision: item, issue_number: issueNumber, updated_at: now().toISOString()},
            {Prefer: 'resolution=merge-duplicates,return=representation'},
          );
          if (item.disposition === 'create' && !issueNumber) {
            const tag = marker(item.key);
            let found = index.find(i => i.body.includes(tag));
            if (!found) {
              const search = await gh(`search/issues?q=${encodeURIComponent(`repo:${repo} is:issue in:body "${tag}"`)}`);
              found = search.items?.find(i => i.body?.includes(tag));
            }
            if (found) {
              issueNumber = found.number;
              results.linked++;
            } else {
              const made = await gh(`repos/${repo}/issues`, 'POST', {title: `[${item.priority}][Feedback] ${item.title}`, body: issueBody(item)});
              issueNumber = made.number;
              index.push({number: made.number, body: made.body ?? issueBody(item), title: made.title, state: 'open'});
              results.created++;
            }
          }
          if (issueNumber)
            await db(`mossvale_feedback_findings?feedback_id=eq.${review.feedbackId}&improvement_key=eq.${item.key}`, 'PATCH', {
              issue_number: issueNumber,
              updated_at: now().toISOString(),
            });
        }
        await db(`mossvale_feedback?id=eq.${review.feedbackId}&reviewed_at=is.null`, 'PATCH', {reviewed_at: now().toISOString(), review_note: review.note});
        results.reviewed++;
      }
      return results;
    } finally {
      await db('rpc/mossvale_review_lock', 'POST', {p_token: token, p_release: true});
    }
  }
  async function automate() {
    const batch = await snapshot();
    if (!batch.feedback.length) return {reviewed: 0, created: 0, linked: 0};
    const model = env.FEEDBACK_REVIEW_MODEL;
    const key = env.OPENAI_API_KEY;
    if (!model || !key) throw new Error('Set FEEDBACK_REVIEW_MODEL and OPENAI_API_KEY to opt into automated model review.');
    const result = await call('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {Authorization: `Bearer ${key}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        model,
        response_format: {type: 'json_object'},
        max_completion_tokens: 12000,
        messages: [
          {role: 'system', content: REVIEW_INSTRUCTIONS},
          {role: 'user', content: JSON.stringify({feedback: batch.feedback, issues: batch.issues})},
        ],
      }),
    });
    const plan = JSON.parse(result.choices?.[0]?.message?.content ?? 'null');
    if (plan?.reviews?.length !== batch.feedback.length) throw new Error('The model did not review the whole batch; export for manual review.');
    return apply(plan);
  }
  return {snapshot, apply, automate};
}

async function main() {
  const [mode, file] = process.argv.slice(2);
  if (!['--export', '--apply', '--auto'].includes(mode) || (mode !== '--auto' && !file))
    throw new Error('Usage: npm run feedback:review -- --export FILE | --apply FILE | --auto');
  const reviewer = createReviewer();
  if (mode === '--export') {
    const batch = await reviewer.snapshot();
    mkdirSync(dirname(file), {recursive: true});
    writeFileSync(file, JSON.stringify(batch, null, 2) + '\n', {mode: 0o600});
    console.log(`Exported ${batch.feedback.length} private messages. Keep this file out of GitHub.`);
  } else {
    const result = mode === '--apply' ? await reviewer.apply(JSON.parse(readFileSync(file, 'utf8'))) : await reviewer.automate();
    console.log(JSON.stringify(result)); // counts only; never raw messages, identities or model payloads
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
