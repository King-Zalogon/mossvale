#!/usr/bin/env node
/* Local verification gate (#437).
   npm run gate                                  run every stage, record docs/handoffs/evidence/<sha>.json
   npm run gate -- --skip art --reason "docs-only change, no art or asset paths touched"
   npm run gate -- --only unit,lint              partial run (recorded as not-run; gate:check will reject it)
   npm run gate:check [-- <sha>]                 exit 0 only if a complete passing record covers the given head (default HEAD)
   Hosted CI is disabled by owner decision, so this record is the merge precondition. */
import {execFileSync, spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {EVIDENCE_DIR, STAGES, evaluateEvidence, markdownSummary, onlyHandoffPaths, parseGateArgs} from './lib/gate.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
const tryGit = (...args) => {
  try {
    return git(...args);
  } catch {
    return null;
  }
};
const version = (command, args) => {
  const result = spawnSync(command, args, {encoding: 'utf8', windowsHide: true});
  return result.status === 0 ? result.stdout.trim() : null;
};

function findEvidence(head) {
  const dir = join(root, EVIDENCE_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .map(name => JSON.parse(readFileSync(join(dir, name), 'utf8')))
    .filter(record => {
      if (record.sha === head) return true;
      if (tryGit('merge-base', '--is-ancestor', record.sha, head) === null) return false;
      const changed = tryGit('diff', '--name-only', record.sha, head);
      return changed !== null && onlyHandoffPaths(changed.split('\n').filter(Boolean));
    });
}

function check(target) {
  const head = tryGit('rev-parse', target ?? 'HEAD');
  if (!head) {
    console.error(`Unknown revision: ${target}`);
    return 2;
  }
  const records = findEvidence(head);
  if (!records.length) {
    console.error(`No gate evidence covers ${head.slice(0, 12)}. Merge the latest origin/integration, commit, then run \`npm run gate\`.`);
    return 1;
  }
  for (const record of records) {
    const verdict = evaluateEvidence(record);
    if (verdict.ok) {
      console.log(`Gate evidence for ${record.sha.slice(0, 12)} covers ${head.slice(0, 12)}: all stages passed.`);
      for (const skip of verdict.skipped) console.log(`  skipped ${skip.name}: ${skip.reason}`);
      return 0;
    }
  }
  console.error(
    `Gate evidence exists but is not passing:\n${evaluateEvidence(records.at(-1))
      .problems.map(problem => `  ${problem}`)
      .join('\n')}`,
  );
  return 1;
}

function runStage(stage) {
  const started = Date.now();
  const result = spawnSync(stage.command, {cwd: root, shell: true, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true});
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const ms = Date.now() - started;
  if (result.status === 0) return {name: stage.name, status: 'pass', ms};
  if (
    stage.name === 'audit' &&
    /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|audit endpoint returned an error|network/i.test(output) &&
    !/Severity: (high|critical)/i.test(output)
  )
    return {name: stage.name, status: 'skipped', reason: 'npm registry unreachable from this environment', ms};
  return {name: stage.name, status: 'fail', ms, tail: output.split('\n').slice(-40).join('\n')};
}

function gate(argv) {
  const options = parseGateArgs(argv);
  if (options.errors.length) {
    console.error(options.errors.join('\n'));
    return 2;
  }
  if (git('status', '--porcelain')) {
    console.error('The working tree is not clean. Commit your changes first: evidence is recorded against an exact commit.');
    return 2;
  }
  const sha = git('rev-parse', 'HEAD');
  const evidence = {
    sha,
    baseSha: tryGit('rev-parse', 'origin/integration'),
    startedAt: new Date().toISOString(),
    node: process.version,
    python: version(process.platform === 'win32' ? 'python' : 'python3', ['--version']),
    pillow: version(process.platform === 'win32' ? 'python' : 'python3', ['-c', 'import PIL; print(PIL.__version__)']),
    playwright: (() => {
      try {
        return JSON.parse(readFileSync(join(root, 'node_modules/playwright/package.json'), 'utf8')).version;
      } catch {
        return null;
      }
    })(),
    os: `${process.platform} ${process.arch}`,
    stages: [],
  };
  for (const stage of STAGES) {
    if (options.skips.has(stage.name)) evidence.stages.push({name: stage.name, status: 'skipped', reason: options.skips.get(stage.name)});
    else if (options.only && !options.only.includes(stage.name))
      evidence.stages.push({name: stage.name, status: 'not-run', reason: 'not selected (partial run)'});
    else {
      console.log(`\n=== ${stage.name}: ${stage.command}`);
      const result = runStage(stage);
      console.log(`--- ${stage.name}: ${result.status} (${(result.ms / 1000).toFixed(1)}s)${result.tail ? `\n${result.tail}` : ''}`);
      evidence.stages.push(result);
    }
  }
  const dir = join(root, EVIDENCE_DIR);
  mkdirSync(dir, {recursive: true});
  const file = join(dir, `${sha.slice(0, 12)}.json`);
  writeFileSync(file, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(
    `\n${markdownSummary(evidence)}\n\nRecorded ${EVIDENCE_DIR}/${sha.slice(0, 12)}.json. Commit it (it only touches docs/handoffs/, so it does not invalidate itself).`,
  );
  return evaluateEvidence(evidence).ok ? 0 : 1;
}

const [command, ...rest] = process.argv.slice(2);
process.exitCode = command === 'check' ? check(rest[0]) : gate(command === undefined ? [] : [command, ...rest]);
