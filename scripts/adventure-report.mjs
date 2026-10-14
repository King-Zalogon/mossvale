#!/usr/bin/env node
/* Read-only adventure readiness report (#282). Usage and exit codes: docs/PACKS.md. */
import {existsSync, statSync, writeFileSync} from 'node:fs';
import {isAbsolute, relative, resolve} from 'node:path';
import {assessAdventure, renderReportJson, renderReportMarkdown} from './lib/adventure-readiness.mjs';

const USAGE = 'usage: node scripts/adventure-report.mjs <pack-folder> [--format markdown|json] [--out <file>] [--strict]';
const args = process.argv.slice(2);
const usage = message => {
  console.error(message ? `${message}\n${USAGE}` : USAGE);
  process.exit(2);
};

let folder;
let format = 'markdown';
let out;
let strict = false;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--format') format = args[++i];
  else if (arg === '--out') out = args[++i];
  else if (arg === '--strict') strict = true;
  else if (arg.startsWith('--')) usage(`unknown option ${arg}`);
  else if (folder === undefined) folder = arg;
  else usage('only one pack folder is accepted');
}
if (!folder) usage();
if (!['markdown', 'json'].includes(format)) usage('--format must be markdown or json');
if (!existsSync(folder) || !statSync(folder).isDirectory()) usage(`${folder} is not a folder`);
if (out !== undefined) {
  const inside = relative(resolve(folder), resolve(out));
  if (inside !== '' && !inside.startsWith('..') && !isAbsolute(inside)) usage('--out must point outside the pack folder (the report never writes into a pack)');
}

const report = assessAdventure(folder);
const text = format === 'json' ? renderReportJson(report) : renderReportMarkdown(report);
if (out) writeFileSync(out, text);
else process.stdout.write(text);
// 0 buildable · 1 blocked by errors · 2 usage or unreadable input · 3 buildable but warnings present with --strict
process.exitCode = report.errors.length ? 1 : strict && report.warnings.length ? 3 : 0;
