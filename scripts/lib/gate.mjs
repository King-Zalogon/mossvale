// Local verification gate (#437): stage list, evidence evaluation and the rules for reusing evidence.
// Hosted CI is disabled by owner decision; a passing evidence record for the final head is the merge precondition.

export const EVIDENCE_DIR = 'docs/handoffs/evidence';

/* Stages run in this order and never stop at the first failure. `skippable: false` stages cannot be skipped. */
export const STAGES = [
  {name: 'catalogue-impact', command: 'npm run catalogue:impact -- --base origin/integration', skippable: true},
  {name: 'lint', command: 'npm run lint', skippable: false},
  {name: 'format', command: 'npm run format:check', skippable: false},
  {name: 'typecheck', command: 'npm run typecheck', skippable: false},
  {name: 'validate', command: 'npm run validate', skippable: false},
  {name: 'unit', command: 'npm test', skippable: false},
  {name: 'art', command: 'npm run art:check', skippable: true},
  {name: 'browser', command: 'npm run test:browser', skippable: true},
  {name: 'build', command: 'npm run build', skippable: true},
  {name: 'account-api', command: 'npm run test:account-api', skippable: true},
  {name: 'audit', command: 'npm run audit', skippable: true},
];

/* Paths a later commit may touch without invalidating earlier evidence: the evidence and handoff records themselves. */
export function onlyHandoffPaths(paths) {
  return paths.every(path => path.startsWith('docs/handoffs/'));
}

/* Returns {ok, problems, skipped}. Every stage must be present; pass is fine; skip needs a reason and a skippable stage. */
export function evaluateEvidence(evidence, stages = STAGES) {
  const problems = [];
  const skipped = [];
  if (!evidence || typeof evidence !== 'object' || !Array.isArray(evidence.stages)) return {ok: false, problems: ['not an evidence record'], skipped};
  const byName = new Map(evidence.stages.map(stage => [stage.name, stage]));
  for (const {name, skippable} of stages) {
    const stage = byName.get(name);
    if (!stage) problems.push(`${name}: missing`);
    else if (stage.status === 'pass') continue;
    else if (stage.status === 'skipped') {
      if (!skippable) problems.push(`${name}: cannot be skipped`);
      else if (typeof stage.reason !== 'string' || stage.reason.trim().length < 5) problems.push(`${name}: skipped without a reason`);
      else skipped.push({name, reason: stage.reason});
    } else problems.push(`${name}: ${stage.status}`);
  }
  return {ok: problems.length === 0, problems, skipped};
}

export function markdownSummary(evidence) {
  const rows = evidence.stages.map(stage => {
    const seconds = typeof stage.ms === 'number' ? `${(stage.ms / 1000).toFixed(1)}s` : '';
    return `| ${stage.name} | ${stage.status}${stage.reason ? ` (${stage.reason})` : ''} | ${seconds} |`;
  });
  return [
    `Gate evidence for \`${evidence.sha.slice(0, 12)}\` (base \`origin/integration\` ${String(evidence.baseSha ?? 'unknown').slice(0, 12)})`,
    `Node ${evidence.node} · Python ${evidence.python ?? 'n/a'} · Pillow ${evidence.pillow ?? 'n/a'} · Playwright ${evidence.playwright ?? 'n/a'} · ${evidence.os}`,
    '',
    '| Stage | Result | Time |',
    '| --- | --- | --- |',
    ...rows,
  ].join('\n');
}

/* Parse `--skip name --reason "text"` (repeatable pairs, reason applies to the preceding --skip) and `--only a,b`. */
export function parseGateArgs(argv, stages = STAGES) {
  const known = new Set(stages.map(stage => stage.name));
  const options = {skips: new Map(), only: null, errors: []};
  let last = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--skip') {
      last = argv[++i];
      if (!known.has(last)) options.errors.push(`unknown stage: ${last}`);
      else options.skips.set(last, '');
    } else if (arg === '--reason') {
      if (last === null) options.errors.push('--reason must follow --skip <stage>');
      else options.skips.set(last, argv[++i] ?? '');
    } else if (arg === '--only') {
      options.only = (argv[++i] ?? '').split(',').filter(Boolean);
      for (const name of options.only) if (!known.has(name)) options.errors.push(`unknown stage: ${name}`);
    } else options.errors.push(`unknown argument: ${arg}`);
  }
  for (const [name, reason] of options.skips) {
    const stage = stages.find(item => item.name === name);
    if (stage && !stage.skippable) options.errors.push(`${name} cannot be skipped`);
    if (!reason.trim()) options.errors.push(`--skip ${name} needs --reason "<why>"`);
  }
  return options;
}
