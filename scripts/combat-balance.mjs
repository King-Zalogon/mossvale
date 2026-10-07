#!/usr/bin/env node
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatCombatComparison, runCombatComparison} from './lib/combat-analysis.mjs';

export function parseArguments(args) {
  const options = {seeds: 50, format: 'markdown', output: null};
  for (let index = 0; index < args.length; index++) {
    const [flag, inline] = args[index].split('=', 2);
    const value = inline ?? args[++index];
    if (flag === '--seeds') options.seeds = Number(value);
    else if (flag === '--format') options.format = value;
    else if (flag === '--output') options.output = value;
    else if (flag === '--help' || flag === '-h') options.help = true;
    else throw new Error(`Unknown option: ${args[index]}`);
  }
  if (!Number.isInteger(options.seeds) || options.seeds < 1 || options.seeds > 1000) throw new RangeError('--seeds must be 1..1000');
  if (!['markdown', 'json'].includes(options.format)) throw new RangeError('--format must be markdown or json');
  if (options.output !== null && (!options.output || options.output.startsWith('-'))) throw new Error('--output needs a file path');
  return options;
}

export function printHelp() {
  return [
    'Compare reproducible local Mossvale combat policies.',
    '',
    'Usage: node scripts/combat-balance.mjs [--seeds 50] [--format markdown|json] [--output FILE]',
    '',
    'The report compares attack-only, strongest legal move and intent-responsive play across',
    'normal progression, an overleveled starter, every registered elemental matchup and guardians.',
  ].join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${printHelp()}\n`);
    } else {
      const report = runCombatComparison({seeds: options.seeds});
      const output = options.format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : formatCombatComparison(report);
      if (options.output) {
        writeFileSync(resolve(options.output), output, {encoding: 'utf8', flag: 'wx'});
        process.stdout.write(`Wrote ${options.format} combat report to ${resolve(options.output)}\n`);
      } else process.stdout.write(output);
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n${printHelp()}\n`);
    process.exitCode = 1;
  }
}
