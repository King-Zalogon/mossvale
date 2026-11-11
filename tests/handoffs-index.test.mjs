import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readHandoffs, renderIndex} from '../scripts/handoffs-index.mjs';

test('index lists each handoff with its header fields', () => {
  const text = renderIndex([
    {name: '12-example.md', text: '# 12 Example | task\n\nIssue: #12\nBranch: codex/12-example\nStatus: merged\nPR: https://example.test/pull/1\n'},
  ]);
  assert.match(text, /\| \[12 Example \/ task\]\(12-example\.md\) \| #12 \| `codex\/12-example` \| merged \| https:\/\/example\.test\/pull\/1 \|/);
});

test('the committed index matches the handoff files', () => {
  assert.equal(readFileSync(new URL('../docs/handoffs/INDEX.md', import.meta.url), 'utf8'), renderIndex(readHandoffs()));
});
