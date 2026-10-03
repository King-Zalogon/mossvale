import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReview, marker, issueBody} from '../scripts/lib/feedback-review.mjs';
import {createReviewer} from '../scripts/review-feedback.mjs';

const feedback = [{id: 'c68ac9ac-5906-4b08-8e31-79531a372f02', message: 'Fix keyboard menus and make trails larger.'}];
const improvement = {
  key: 'keyboard-menu-focus',
  category: 'ux',
  priority: 'P1',
  disposition: 'create',
  title: 'Keep keyboard focus in menus',
  description: 'Keyboard focus should stay inside open menus. Verify Tab and Shift+Tab.',
  reason: 'A concrete input improvement.',
};
const plan = {
  reviews: [
    {
      feedbackId: feedback[0].id,
      note: 'Two distinct improvements.',
      improvements: [improvement, {...improvement, key: 'larger-trail-routes', title: 'Expand trail routes'}],
    },
  ],
};

test('review supports multiple findings, rejects fabricated sources/duplicates and bounds public output', () => {
  validateReview(plan, feedback, []);
  assert.throws(() => validateReview({...plan, reviews: [{...plan.reviews[0], feedbackId: 'unknown'}]}, feedback, []));
  assert.throws(() =>
    validateReview({reviews: [{...plan.reviews[0], improvements: [{...improvement, disposition: 'duplicate', issueNumber: 999}]}]}, feedback, [{number: 1}]),
  );
  assert.throws(() =>
    validateReview({reviews: [{...plan.reviews[0], improvements: [{...improvement, description: 'Email someone@example.com'}]}]}, feedback, []),
  );
  assert.throws(() =>
    validateReview({reviews: [{...plan.reviews[0], improvements: [{...improvement, description: 'Use https://private.example/token'}]}]}, feedback, []),
  );
  assert.ok(issueBody(improvement).includes(marker(improvement.key)));
  assert.doesNotMatch(issueBody(improvement), /c68ac9ac|Fix keyboard menus/);
});

function fixture({existing = [], failOnce = false} = {}) {
  let created = 0;
  let fail = failOnce;
  let reviewed = false;
  const findings = new Map();
  const issues = existing.slice();
  const env = {SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'test-key', GITHUB_TOKEN: 'test-token'};
  const request = async (url, options = {}) => {
    const path = new URL(url).pathname;
    const body = options.body && JSON.parse(options.body);
    const response = value => Response.json(value);
    if (path.endsWith('/rpc/mossvale_review_lock')) return response(true);
    if (path.endsWith('/mossvale_feedback')) {
      if (options.method === 'PATCH') {
        reviewed = true;
        return response([]);
      }
      return response(
        new URL(url).searchParams.has('id') ? feedback.map(f => ({...f, reviewed_at: reviewed ? '2026-10-03' : null})) : reviewed ? [] : feedback,
      );
    }
    if (path.endsWith('/mossvale_feedback_findings')) {
      if (options.method === 'POST') {
        findings.set(body.improvement_key, body);
        return response([body]);
      }
      if (options.method === 'PATCH') {
        if (fail) {
          fail = false;
          return Response.json({}, {status: 503});
        }
        const key = new URL(url).searchParams.get('improvement_key').slice(3);
        Object.assign(findings.get(key), body);
        return response([]);
      }
      return response([...findings.values()]);
    }
    if (path.endsWith('/search/issues')) return response({items: []});
    if (path.endsWith('/issues')) {
      if (options.method === 'POST') {
        created++;
        const issue = {number: 200 + created, body: body.body, title: body.title};
        issues.push(issue);
        return response(issue);
      }
      return response(issues);
    }
    throw new Error('Unexpected test request: ' + path);
  };
  return {reviewer: createReviewer({request, env}), created: () => created, findings};
}

test('review creates one issue per viable improvement and records each finding', async () => {
  const f = fixture();
  assert.deepEqual(await f.reviewer.apply(plan), {reviewed: 1, created: 2, linked: 0});
  assert.deepEqual(await f.reviewer.apply(plan), {reviewed: 0, created: 0, linked: 0});
  assert.equal(f.findings.size, 2);
  assert.ok([...f.findings.values()].every(row => row.issue_number));
});

test('retry after GitHub success but failed DB acknowledgment finds the existing marker', async () => {
  const f = fixture({failOnce: true});
  await assert.rejects(f.reviewer.apply(plan), /503/);
  assert.equal(f.created(), 1);
  assert.deepEqual(await f.reviewer.apply(plan), {reviewed: 1, created: 1, linked: 1});
  assert.equal(f.created(), 2, 'one issue per improvement across both attempts');
});

test('a deferred improvement is recorded without a GitHub write', async () => {
  const f = fixture();
  const deferred = {reviews: [{...plan.reviews[0], improvements: [{...improvement, disposition: 'defer'}]}]};
  assert.deepEqual(await f.reviewer.apply(deferred), {reviewed: 1, created: 0, linked: 0});
  assert.equal(f.created(), 0);
});
