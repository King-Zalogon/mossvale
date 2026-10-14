/* Deterministic, read-only adventure readiness report (#282).
   Aggregates the validators the game already uses (pack manifest and integrity, registries, maps, objectives, story,
   inventory, scenes, progression) and adds a few objective cross-system checks. It never writes to a pack, reads no
   clock and uses no network, so the same input always produces the same bytes. */
import {createHash} from 'node:crypto';
import {existsSync, readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {assets} from '../../dist/src/data/assets.js';
import {buildAdventure} from '../../dist/src/domain/adventure.js';
import {expandMapPrefabs} from '../../dist/src/domain/prefabs.js';
import {packFileEntries, validatePack, validatePackMetadata} from '../../dist/src/domain/pack.js';
import {resolveRegistries, validateRegistries} from '../../dist/src/domain/registries.js';
import {buildWorld} from '../../dist/src/domain/world.js';
import {ENGINE_VERSION, SAVE_SCHEMA_VERSION} from '../../dist/src/compatibility.js';
import {analyzeMapDesign} from './map-design-report.mjs';

export const REPORT_FORMAT = 1;

/** Checks in the order they run. A check is `skipped` (never green) when something it depends on failed. */
export const CHECKS = [
  ['files', 'Pack files present, readable and matching their integrity hashes'],
  ['metadata', 'Pack manifest fields'],
  ['compatibility', 'Engine and save-schema compatibility'],
  ['registries', 'Species, regions, moves and tuning registries'],
  ['build', 'Maps, exits, assets, route reachability, objectives, story, inventory, scenes, rewards and milestone order (the game compiler)'],
  ['routes', 'Route and return design signals (advisory)'],
  ['rewards', 'Scene rewards cannot repeat'],
];

/** What no script can decide. Always listed; never turned into a pass. */
export const MANUAL_REVIEW = [
  {
    id: 'story-meaning',
    topic: 'Story beats feel meaningful and connected to the adventure',
    how: 'Play the pack and compare it with its script (docs/SCENE_QUALITY.md).',
  },
  {
    id: 'visual-composition',
    topic: 'Actors, props, interaction cues and dialogue read well together',
    how: 'Capture desktop and phone screenshots with the real controls and inspect them.',
  },
  {
    id: 'encounter-enjoyment',
    topic: 'Encounters, pacing and rewards are enjoyable and fairly tuned',
    how: 'Playtest; compare with the combat trace report (npm run combat:report).',
  },
];

/** Not run by this command, so they cannot be reported as passing. */
export const NOT_EVALUATED = [
  'Browser playthrough (start, dialogue, reward once, reload): run the pack browser regression for a live check.',
  'Catalogue IDs and capability fiches: packs do not declare them; run `npm run catalogue:check` for the shipped catalogue.',
  'Saves from an earlier content version: compare contentVersion and the save fixtures before shipping a changed pack.',
];

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sortIssues = list => list.sort((a, b) => compare(a.file, b.file) || compare(a.path, b.path) || compare(a.code, b.code) || compare(a.message, b.message));

const REMEDIES = [
  [
    /unknown sprite|no sprite|sprite .* (?:not|unknown)/i,
    'Use an asset name from dist/src/data/assets.js, or add the picture through the asset pipeline (docs/ASSETS.md).',
  ],
  [/unknown map|no such map|not listed in the pack|no map file/i, 'Make the map id, the pack `maps` list and the file name agree.'],
  [/SHA-256|hash record|integrity/i, 'Review the changed files, then run `node scripts/pack.mjs refresh-manifest <pack>` to record their hashes.'],
  [/unknown species|species/i, 'List the species in the pack `species` and define it in the registries file.'],
  [/duplicate/i, 'Give each entry a unique stable id.'],
  [/spawn/i, 'Define the spawn in the destination map, or point the exit at an existing spawn.'],
  [/flag|milestone/i, 'Use `<map-id>.seal` or `<map-id>.chest` flags that a landmark in this pack actually sets (docs/PACKS.md).'],
];
const remedyFor = message =>
  REMEDIES.find(([pattern]) => pattern.test(message))?.[1] ??
  'Edit the file at this path so the game validator accepts it; the validator message above names the rule.';

const WHY = {
  files: 'The pack cannot be loaded, so nothing else can be checked.',
  metadata: 'The game refuses a pack whose manifest is invalid.',
  compatibility: 'The game refuses content built for a different engine or save schema, to protect saves.',
  registries: 'Creatures, regions and tuning come from this file; the build fails without a valid one.',
  build: 'The same compiler runs at build time and at game start; the adventure cannot be built until it passes.',
  routes: 'These are design heuristics, not build rules.',
  rewards: 'A repeatable scene would pay its reward every time it is triggered.',
};

/** Splits a validator message into the pack file and JSON path it concerns. */
function locate(message, ctx) {
  const mapDirectory = ctx.index?.mapDirectory ?? '';
  const mapFile = id => `${mapDirectory}${id}.json`;
  let match;
  if ((match = /^map ([a-z0-9-]+)\s*(?:\(([^)]*)\))?[:\s]?\s*(.*)$/s.exec(message)))
    return {file: mapFile(match[1]), path: (match[2] ?? '').trim(), detail: message};
  if (/^(objectives?|eventObjectives)/.test(message)) return {file: ctx.index?.objectives ?? 'index.json', path: message.split(':')[0], detail: message};
  if (/^story/.test(message)) return {file: ctx.index?.story ?? 'index.json', path: message.split(':')[0], detail: message};
  if (/^inventory/.test(message)) return {file: ctx.index?.inventory ?? 'index.json', path: message.split(':')[0], detail: message};
  if (/^(region|species)\b/.test(message)) return {file: ctx.index?.registries ?? 'registries.json', path: message.split(':')[0], detail: message};
  if (/^pack\b/.test(message)) return {file: 'index.json', path: message.split(':')[0].replace(/^pack\s*/, ''), detail: message};
  return {file: 'index.json', path: '', detail: message};
}

function issue(report, severity, check, code, where, message, {why, fix} = {}) {
  report[severity === 'error' ? 'errors' : 'warnings'].push({
    check,
    code,
    file: where.file,
    path: where.path ?? '',
    message,
    why: why ?? WHY[check],
    fix: fix ?? remedyFor(message),
  });
}

function readJson(root, relative, report, check) {
  const path = join(root, relative);
  if (!existsSync(path)) {
    issue(report, 'error', check, 'file-missing', {file: relative}, `required file ${relative} is missing`, {
      fix: 'Restore the file, or remove it from the pack manifest if it is not needed.',
    });
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    issue(report, 'error', check, 'file-invalid-json', {file: relative}, `${relative} is not valid JSON (${error.message.split('\n')[0]})`, {
      fix: 'Fix the JSON syntax; most editors can format and validate JSON.',
    });
    return undefined;
  }
}

/**
 * @param {string} folder pack folder containing index.json
 * @returns {object} the report. `status` is `blocked` when any error exists, otherwise `buildable`; human review is always pending.
 */
export function assessAdventure(folder) {
  const root = resolve(folder);
  const report = {
    format: REPORT_FORMAT,
    tool: 'adventure-readiness',
    pack: {id: null, name: null, contentVersion: null},
    status: 'blocked',
    checks: [],
    errors: [],
    warnings: [],
    manualReview: [],
    notEvaluated: [...NOT_EVALUATED],
  };
  const state = {};
  const stage = (id, run, requires = []) => {
    const title = CHECKS.find(([key]) => key === id)[1];
    // A stale hash alone must not hide every other problem, so `files` only gates later checks when a file is missing or unreadable.
    const blockedBy = requires.find(key => report.checks.find(check => check.id === key)?.status !== 'pass' && !(key === 'files' && state.loadable));
    if (blockedBy) {
      report.checks.push({id, title, status: 'skipped', errors: 0, warnings: 0, reason: `Not run because the "${blockedBy}" check did not pass.`});
      return;
    }
    const before = [report.errors.length, report.warnings.length];
    run();
    const errors = report.errors.length - before[0];
    report.checks.push({id, title, status: errors ? 'fail' : 'pass', errors, warnings: report.warnings.length - before[1]});
  };

  stage('files', () => {
    const index = readJson(root, 'index.json', report, 'files');
    if (!index || typeof index !== 'object' || Array.isArray(index)) {
      if (index !== undefined)
        issue(report, 'error', 'files', 'index-not-object', {file: 'index.json'}, 'index.json must be a JSON object', {
          fix: 'Start from `node scripts/pack.mjs create-pack` and copy its shape.',
        });
      return;
    }
    state.index = index;
    state.loadable = true;
    report.pack = {id: index.id ?? null, name: index.name ?? null, contentVersion: index.contentVersion ?? null};
    const hashes = new Map((Array.isArray(index.integrity) ? index.integrity : []).map(item => [item?.id, item?.sha256]));
    for (const entry of packFileEntries(index)) {
      const path = join(root, entry.path);
      if (!existsSync(path)) {
        issue(report, 'error', 'files', 'file-missing', {file: entry.path, path: `integrity.${entry.id}`}, `required file ${entry.path} is missing`, {
          fix: 'Restore the file, or remove it from the pack manifest if it is not needed.',
        });
        state.loadable = false;
        continue;
      }
      const bytes = readFileSync(path);
      try {
        JSON.parse(bytes.toString('utf8'));
      } catch (error) {
        issue(report, 'error', 'files', 'file-invalid-json', {file: entry.path}, `${entry.path} is not valid JSON (${error.message.split('\n')[0]})`, {
          fix: 'Fix the JSON syntax; most editors can format and validate JSON.',
        });
        state.loadable = false;
        continue;
      }
      if (hashes.has(entry.id) && hashes.get(entry.id) !== sha256(bytes))
        issue(report, 'error', 'files', 'integrity-mismatch', {file: entry.path, path: `integrity.${entry.id}`}, `SHA-256 mismatch for ${entry.path}`, {
          fix: 'Review the change, then run `node scripts/pack.mjs refresh-manifest <pack>` to record the new hash.',
        });
    }
  });

  stage(
    'metadata',
    () => {
      const {index} = state;
      const known = new Set(readRegistrySpecies(root, index));
      for (const message of validatePack(index, {packId: index.id, speciesIds: known})) {
        if (/^pack (requires|integrity)/.test(message)) continue; // reported under compatibility / files
        issue(report, 'error', 'metadata', 'pack-manifest', locate(message, state), message);
      }
    },
    ['files'],
  );

  stage(
    'compatibility',
    () => {
      for (const message of validatePackMetadata(state.index, {required: true, engineVersion: ENGINE_VERSION, saveSchema: SAVE_SCHEMA_VERSION}).filter(text =>
        /^pack requires/.test(text),
      ))
        issue(report, 'error', 'compatibility', 'incompatible-content', {file: 'index.json', path: message.split(':')[0].replace(/^pack\s*/, '')}, message, {
          fix: `Rebuild the pack for engine ${ENGINE_VERSION} / save schema ${SAVE_SCHEMA_VERSION}, or migrate it deliberately; never edit the numbers to silence this.`,
        });
    },
    ['files'],
  );

  stage(
    'registries',
    () => {
      const {index} = state;
      const file = index.registries ?? 'registries.json';
      const registries = readJson(root, file, report, 'registries');
      if (!registries) return;
      state.registries = registries;
      for (const message of validateRegistries(registries, {assetNames: new Set(assets.map(asset => asset.name))}))
        issue(report, 'error', 'registries', 'registry-rule', {file, path: message.split(':')[0]}, message);
    },
    ['files', 'metadata'],
  );

  stage(
    'build',
    () => {
      const {index, registries} = state;
      const directory = index.mapDirectory ?? '';
      const rawMaps = index.maps.map(id => readJson(root, `${directory}${id}.json`, report, 'build'));
      const objectives = index.objectives ? readJson(root, index.objectives, report, 'build') : undefined;
      const story = index.story ? readJson(root, index.story, report, 'build') : undefined;
      const inventory = index.inventory ? readJson(root, index.inventory, report, 'build') : undefined;
      if (rawMaps.includes(undefined) || (index.objectives && !objectives) || (index.story && !story) || (index.inventory && !inventory)) return;
      const content = resolveRegistries(registries, assets);
      const built = buildAdventure(rawMaps, {assets, ...content, packId: index.id}, objectives, story, index, inventory);
      for (const message of built.errors) issue(report, 'error', 'build', 'compile-rule', locate(message, state), message);
      if (built.errors.length) return;
      state.built = built;
      state.rawMaps = expandMapPrefabs(rawMaps, index.prefabs).maps;
      state.rawById = new Map(state.rawMaps.map(map => [map.id, map]));
    },
    ['files', 'metadata', 'compatibility', 'registries'],
  );

  stage(
    'routes',
    () => {
      const {index, built, rawById} = state;
      const directory = index.mapDirectory ?? '';
      // The compiler already refuses unreachable required places and unreachable maps; here only the advisory signals are surfaced.
      for (const mapId of index.maps) {
        const analysis = analyzeMapDesign(buildWorld(built.mapsById[mapId]), rawById.get(mapId), rawById);
        for (const warning of analysis.warnings.filter(item => item.severity === 'warning'))
          issue(report, 'warning', 'routes', warning.code, {file: `${directory}${mapId}.json`, path: warning.target}, warning.message, {
            why: 'This is a design heuristic, not a build rule; a person has to decide whether it is intended.',
            fix:
              warning.code === 'no-safe-return'
                ? 'Add an ungated return exit in the destination map, or confirm in review that the entrance is intentionally one-way (the manifest has no field to declare it yet).'
                : 'Review it in the preview (`node scripts/pack.mjs preview-pack <pack> <map>`) and either fix the layout or accept it.',
          });
      }
    },
    ['build'],
  );

  stage(
    'rewards',
    () => {
      const {index, rawMaps} = state;
      const directory = index.mapDirectory ?? '';
      // Chest and shrine rewards are paid once through their saved flag (the compiler requires it). A repeatable scene event has no
      // such memory, so its reward would be granted on every trigger unless the event flips a flag that its own condition checks.
      for (const map of rawMaps)
        (map.triggers ?? []).forEach((trigger, ti) =>
          (trigger.events ?? []).forEach((event, ei) => {
            if (event.repeatable !== true || !(event.actions ?? []).some(action => action.type === 'reward')) return;
            const flags = (event.actions ?? []).filter(action => action.type === 'flag').map(action => action.flag);
            if (flags.some(flag => blocksOnFlag(event.when, flag))) return;
            issue(
              report,
              'error',
              'rewards',
              'scene-reward-repeats',
              {file: `${directory}${map.id}.json`, path: `triggers[${ti}].events[${ei}]`},
              `scene event "${event.id}" is repeatable and grants a reward without a guard, so it pays out every time it is triggered`,
              {
                fix: 'Make the event `repeatable: false` (the game then remembers it ran), or add a `flag` action and a `when: {"not": {"flag": "<that flag>"}}` condition.',
              },
            );
          }),
        );
    },
    ['build'],
  );

  sortIssues(report.errors);
  sortIssues(report.warnings);
  report.manualReview = MANUAL_REVIEW.map(item => ({...item, status: 'not evaluated'}));
  for (const warning of report.warnings)
    report.manualReview.push({
      id: `warning:${warning.code}`,
      topic: warning.message,
      how: warning.fix,
      status: 'needs review',
      file: warning.file,
      path: warning.path,
    });
  report.status = report.errors.length ? 'blocked' : 'buildable';
  return report;
}

function readRegistrySpecies(root, index) {
  try {
    const registries = JSON.parse(readFileSync(join(root, index.registries ?? 'registries.json'), 'utf8'));
    return Array.isArray(registries.species) ? registries.species.map(entry => entry.id) : [];
  } catch {
    return [];
  }
}

export const renderReportJson = report => JSON.stringify(report, null, 2) + '\n';

export function renderReportMarkdown(report) {
  const lines = [`# Adventure readiness: ${report.pack.name ?? '(unreadable pack)'}`, ''];
  lines.push(`- Pack id: \`${report.pack.id ?? 'unknown'}\` · content version ${report.pack.contentVersion ?? 'unknown'}`);
  lines.push(`- Game compatibility checked against engine ${ENGINE_VERSION}, save schema ${SAVE_SCHEMA_VERSION}`);
  lines.push(
    report.status === 'blocked'
      ? `- **Status: BLOCKED** — ${report.errors.length} error(s), ${report.warnings.length} warning(s).`
      : `- **Status: buildable by mechanical checks** — ${report.warnings.length} warning(s). Human review is still pending (see below); this report does not say the adventure is good.`,
  );
  lines.push('', '## Checks', '', '| Check | Result | Errors | Warnings |', '| --- | --- | --- | --- |');
  for (const check of report.checks)
    lines.push(
      `| ${check.title} | ${check.status === 'pass' ? 'pass' : check.status === 'fail' ? '**FAIL**' : 'skipped'} | ${check.errors} | ${check.warnings} |`,
    );
  for (const check of report.checks.filter(item => item.status === 'skipped')) lines.push('', `_${check.title}: ${check.reason}_`);
  const block = (title, list) => {
    if (!list.length) return;
    lines.push('', `## ${title}`);
    for (const item of list)
      lines.push(
        '',
        `### \`${item.file}\`${item.path ? ` · \`${item.path}\`` : ''} — ${item.code}`,
        '',
        item.message,
        '',
        `- Why it matters: ${item.why}`,
        `- Next step: ${item.fix}`,
      );
  };
  block('Errors (block the build or the playthrough)', report.errors);
  block('Warnings (buildable, but a person should look)', report.warnings);
  lines.push('', '## Needs a human', '', 'These cannot be decided mechanically and are never reported as passing.', '');
  for (const item of report.manualReview) lines.push(`- **${item.topic}** (${item.status}) — ${item.how}`);
  lines.push('', '## Not evaluated by this command', '');
  for (const item of report.notEvaluated) lines.push(`- ${item}`);
  return lines.join('\n') + '\n';
}

/** True when `when` can only hold while `flag` is not yet set (directly, inside `all`, or negated). */
function blocksOnFlag(when, flag) {
  if (!when || typeof when !== 'object') return false;
  if (when.not && typeof when.not === 'object' && when.not.flag === flag) return true;
  return Array.isArray(when.all) && when.all.some(part => blocksOnFlag(part, flag));
}
