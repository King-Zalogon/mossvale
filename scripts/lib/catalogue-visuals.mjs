import {createHash} from 'node:crypto';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {dirname, resolve, sep, relative, isAbsolute} from 'node:path';
import {safePath, ROOT} from './catalogue.mjs';
import {MAX_REFERENCE_EXPORT_BYTES, MAX_REFERENCE_FILE_BYTES, safeReferencePath} from './reference-assets.mjs';

const FAMILY_SUFFIXES = ['-combat', '-follower'];
const cleanName = value =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en');
const stableUnique = values => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en'));
const isWithin = (base, target) => {
  const path = relative(base, target);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
};

function asFrameMetadata(entry) {
  const frames = entry.configuration?.find(item => item.name === 'definition')?.default?.frames;
  if (
    !frames ||
    !Number.isInteger(frames.columns) ||
    !Number.isInteger(frames.rows) ||
    !Number.isInteger(frames.frameWidth) ||
    !Number.isInteger(frames.frameHeight)
  )
    return null;
  const column = Number.isInteger(frames.defaultFrame?.column) ? frames.defaultFrame.column : 0;
  const row = Number.isInteger(frames.defaultFrame?.row) ? frames.defaultFrame.row : 0;
  if (column < 0 || row < 0 || column >= frames.columns || row >= frames.rows) return null;
  return {
    columns: frames.columns,
    rows: frames.rows,
    frameWidth: frames.frameWidth,
    frameHeight: frames.frameHeight,
    column,
    row,
    columnLabel: String(frames.columnOrder?.[column] ?? column),
    rowLabel: String(frames.rowOrder?.[row] ?? row),
  };
}

function visualBaseId(record) {
  const name = record.runtimeId;
  for (const suffix of FAMILY_SUFFIXES) if (name.endsWith(suffix)) return `visual:${name.slice(0, -suffix.length)}`;
  return record.id;
}

function visualReferencePreviews(entry) {
  if (entry.id.endsWith('-follower'))
    return [
      {
        path: 'art/characters/reviews/creature-follower-contact-sheet.png',
        description: 'Twelve-species follower sheet at 37-pixel game scale; technical review image, not owner taste approval.',
      },
    ];
  if (entry.id.endsWith('-combat'))
    return [
      {
        path: 'art/characters/reviews/creature-combat-contact-sheet.png',
        description: 'Twelve-species combat sheet at 115-pixel review scale; technical review image, not the combat UI.',
      },
    ];
  return [];
}

export function createVisualIndex(catalogue, facts) {
  const factsById = new Map(facts.records.map(record => [record.id, record]));
  const baseVisualToElements = new Map();
  for (const actor of catalogue.entries.filter(entry => entry.kind === 'actor')) {
    const definition = actor.configuration?.find(item => item.name === 'definition')?.default;
    const type = definition?.type;
    const visualDependency = actor.dependencies.find(id => id.startsWith('visual:'));
    if (!type || !visualDependency) continue;
    const values = baseVisualToElements.get(visualDependency) ?? [];
    values.push({type, actorId: actor.id, actorName: actor.name});
    baseVisualToElements.set(visualDependency, values);
  }

  return catalogue.entries
    .filter(entry => entry.kind === 'visual')
    .map(entry => {
      const fact = factsById.get(entry.id);
      const baseId = fact ? visualBaseId(fact) : entry.id;
      const identity = fact?.identity ?? {};
      const elements = stableUnique((baseVisualToElements.get(baseId) ?? []).map(value => value.type));
      const tags = new Set();
      const sourceKind = fact?.raw?.kind;
      if (sourceKind) tags.add(sourceKind);
      else if (entry.id.includes(':creature-')) tags.add('creature');
      else if (entry.id.includes(':person-')) tags.add('person');
      else tags.add('prop');
      if (asFrameMetadata(entry)) tags.add('animated sheet');
      if (entry.details.directions.includes('north, northeast')) tags.add('directional');
      for (const value of identity.palette ?? []) tags.add(cleanName(value));
      for (const value of identity.distinguishingFeatures ?? []) tags.add(cleanName(value));
      const appearance = [identity.silhouette, ...(identity.distinguishingFeatures ?? []), ...(identity.palette ?? [])].filter(Boolean).join(' ');
      const searchable = [entry.id, entry.name, entry.summary, appearance, ...elements, ...tags].join(' ').toLocaleLowerCase('en');
      return {
        id: entry.id,
        name: entry.name,
        kind: fact?.raw?.kind ?? entry.id.split(':')[1]?.split('-')[0] ?? 'unknown',
        summary: entry.summary,
        status: entry.status,
        scope: entry.scope,
        appearance: identity.silhouette ?? entry.details.appearance,
        tags: stableUnique([...tags]),
        elements,
        preview: entry.previews?.[0] ?? null,
        referencePreviews: visualReferencePreviews(entry),
        frame: asFrameMetadata(entry),
        searchable,
        artIdentityReviewed: Boolean(fact?.identity),
      };
    });
}

const safeJson = value =>
  JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');

export function renderCataloguePage(model, {appScript = './app.js', stylesheet = './styles.css', imagePrefix = '/asset?path='} = {}) {
  const payload = {...model, imagePrefix};
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="description" content="Local, searchable visual catalogue for Mossvale adventure authors.">\n<title>Mossvale visual catalogue</title>\n<link rel="stylesheet" href="${stylesheet}">\n</head>\n<body>\n<header><p class="eyebrow">Mossvale authoring tools</p><h1>Visual catalogue</h1><p>Browse registered game visuals and separately licensed reference art. Full reference sheets load only after selection. Copy stable IDs for a portable writer context export.</p></header>\n<main><section class="filters" aria-label="Filter visuals and reference art"><label>Search <input id="search" type="search" autocomplete="off" placeholder="Name, description, ID…"></label><label>Kind <select id="kind"><option value="">All kinds</option></select></label><label>Element <select id="element"><option value="">All elements</option></select></label><label>Subject / appearance <select id="tag"><option value="">All subjects and tags</option></select></label><label>Availability <select id="status"><option value="">All statuses</option></select></label><label>Source <select id="source"><option value="">All sources</option></select></label><label>License <select id="license"><option value="">All licenses</option></select></label></section>\n<div class="toolbar"><p id="result-count" role="status" aria-live="polite"></p><button id="copy-selection" type="button">Copy selected resource IDs</button><span id="copy-status" role="status" aria-live="polite"></span></div>\n<div class="layout"><section id="results" class="cards" aria-label="Visual resources and reference art"></section><aside id="details" class="details" aria-live="polite"><p>Select a resource to inspect its catalogue fiche or reference license and full image.</p></aside></div></main>\n<script>window.MOSSVALE_CATALOGUE=${safeJson(payload)};</script>\n<script defer src="${appScript}"></script>\n</body>\n</html>\n`;
}

export function writePortableContext({root = ROOT, output, catalogue, facts, referenceAssets = [], ids = [], all = false, appScript, stylesheet}) {
  if (!output) throw new Error('Provide --out DIR and either --all or --ids ID[,ID], including reference: IDs when selecting concept art.');
  if (all === Boolean(ids.length)) throw new Error('Choose exactly one of --all or --ids ID[,ID].');
  const destination = resolve(output);
  const rootReal = resolve(root);
  if (isWithin(rootReal, destination)) throw new Error('Portable exports must be written outside the repository root.');
  const parentPath = dirname(destination);
  const parent = realpathSync(parentPath);
  if (isWithin(rootReal, parent)) throw new Error('Portable export parent resolves inside the repository root.');
  if (parent !== parentPath) throw new Error('Portable export parent must not resolve through a symlink.');
  if (existsSync(destination)) {
    if (lstatSync(destination).isSymbolicLink()) throw new Error('Portable export destination cannot be a symlink.');
    if (realpathSync(destination) !== destination) throw new Error('Portable export destination must not resolve through a symlink.');
    throw new Error(`Portable export destination already exists: ${destination}`);
  }
  const model = createVisualIndex(catalogue, facts);
  const visualIds = new Set(model.map(item => item.id));
  const referencesById = new Map(referenceAssets.map(item => [item.id, item]));
  const selectedIds = all ? model.map(item => item.id) : stableUnique(ids);
  const unknown = selectedIds.filter(id => !visualIds.has(id) && !referencesById.has(id));
  if (unknown.length) throw new Error(`Unknown visual/reference ID(s): ${unknown.join(', ')}`);
  const selectedVisualIds = selectedIds.filter(id => visualIds.has(id));
  const selectedReferenceIds = selectedIds.filter(id => referencesById.has(id));
  const selected = new Set(selectedVisualIds);
  const copyVisualIds = all ? new Set(selectedVisualIds) : selected;
  const previewMap = new Map();
  const stage = mkdtempSync(resolve(parent, '.mossvale-context-'));
  try {
    const copyPreview = preview => {
      const source = safePath(root, preview.path);
      const targetRelative = `previews/${preview.path}`;
      const target = resolve(stage, targetRelative);
      const targetCheck = relative(stage, target);
      if (targetCheck === '..' || targetCheck.startsWith(`..${sep}`) || isAbsolute(targetCheck)) throw new Error(`Unsafe exported path: ${targetRelative}`);
      if (previewMap.has(targetRelative)) return {...preview, path: targetRelative};
      mkdirSync(dirname(target), {recursive: true});
      copyFileSync(source, target);
      const digest = createHash('sha256').update(readFileSync(source)).digest('hex');
      previewMap.set(targetRelative, digest);
      return {...preview, path: targetRelative};
    };
    let selectedReferenceBytes = 0;
    const copyReference = item => {
      const source = safeReferencePath(root, item.preview.path);
      const bytes = readFileSync(source);
      if (bytes.length > MAX_REFERENCE_FILE_BYTES)
        throw new Error(`Reference exceeds the per-file export limit (${MAX_REFERENCE_FILE_BYTES} bytes): ${item.id}`);
      selectedReferenceBytes += bytes.length;
      if (selectedReferenceBytes > MAX_REFERENCE_EXPORT_BYTES)
        throw new Error(`Selected references exceed the combined reference export limit (${MAX_REFERENCE_EXPORT_BYTES} bytes).`);
      const targetRelative = `previews/${item.preview.path}`;
      const target = resolve(stage, targetRelative);
      const targetCheck = relative(stage, target);
      if (targetCheck === '..' || targetCheck.startsWith(`..${sep}`) || isAbsolute(targetCheck)) throw new Error(`Unsafe exported path: ${targetRelative}`);
      const digest = createHash('sha256').update(bytes).digest('hex');
      if (digest !== item.sha256) throw new Error(`Reference hash mismatch while exporting: ${item.id}`);
      mkdirSync(dirname(target), {recursive: true});
      writeFileSync(target, bytes, {flag: 'wx'});
      previewMap.set(targetRelative, digest);
      return {...item, preview: {...item.preview, path: targetRelative}};
    };
    const allEntries = catalogue.entries.map(entry => {
      if (entry.kind !== 'visual') return entry;
      const outputEntry = structuredClone(entry);
      if (!copyVisualIds.has(entry.id)) {
        outputEntry.previews = [];
        return outputEntry;
      }
      outputEntry.previews = (entry.previews ?? []).map(copyPreview);
      return outputEntry;
    });
    const exportModel = createVisualIndex({...catalogue, entries: allEntries}, facts).map(item => ({
      ...item,
      referencePreviews: copyVisualIds.has(item.id) ? item.referencePreviews.map(copyPreview) : [],
    }));
    const exportedCatalogue = {...catalogue, entries: allEntries};
    const exportedReferences = selectedReferenceIds.map(id => copyReference(referencesById.get(id)));
    writeFileSync(resolve(stage, 'catalogue.json'), `${JSON.stringify(exportedCatalogue, null, 2)}\n`);
    const pageModel = {sourceRevision: catalogue.sourceRevision, entries: exportedCatalogue.entries, visuals: exportModel, references: exportedReferences};
    writeFileSync(resolve(stage, 'index.html'), renderCataloguePage(pageModel, {appScript: './app.js', stylesheet: './styles.css', imagePrefix: './'}));
    if (exportedReferences.length) writeFileSync(resolve(stage, 'references.json'), `${JSON.stringify(exportedReferences, null, 2)}\n`);
    writeFileSync(resolve(stage, 'app.js'), appScript);
    writeFileSync(resolve(stage, 'styles.css'), stylesheet);
    const instructions = `# Mossvale writer context\n\nSource revision: \`${catalogue.sourceRevision}\`\n\nOpen \`index.html\` in a browser for offline browsing. The page embeds its catalogue data and uses only local relative preview paths. The folder can be copied to another machine or uploaded to an AI chat. Remote assistants cannot read the creator's localhost or files that were not included in this folder.\n\nUse stable catalogue IDs when referring to visuals and capabilities. Visual art entries describe images only; matching gameplay behavior is documented separately as actor, interactable, mechanic, item or environment entries. Only entries marked \`available\` may be requested as implemented. \`proposed\` entries describe gaps and are not usable features. Descriptions summarize the verified contract; technical references point back into the source repository and are not copied source files.\n\nRecords in the separate \`reference:\` namespace are licensed visual inspiration only. They are not runtime visuals, species identities, approved Mossvale art or gameplay capabilities. Their creator, source page, exact license, content hash and limitations travel with the selected image in \`references.json\`; do not infer names, elements, lore, behavior, stats or readiness from a reference image.\n\nIncluded image files: ${previewMap.size}. ${all ? 'All registered Mossvale visual previews were selected; reference art is excluded unless explicitly selected.' : `Selected IDs: ${selectedIds.map(id => `\`${id}\``).join(', ')}.`}\n`;
    const sceneInstructions = `\n## Required playable-scene brief\n\nReturn a format-1 scene intent matching the included \`scene-script.schema.json\`. New scenes must include \`sceneBrief\`: playerPurpose, consequence (kind/description/supporting beatIds), tone, setup, action, payoff, requiredResources and continuityState. The consequence must matter to the player: clue, choice, access, relationship, encounter, useful reward, or a deliberate atmospheric beat with a stated role. Never add an unrelated chest just to pass an interaction test. Select required resources from the supplied available catalogue and the scene's uses/participants/setting; preserve incoming continuity and declare missing capabilities as gaps.\n\nA builder must report schema/data, real-control playable behavior, reviewed rendered composition and reviewed narrative purpose separately. Capture actual runtime desktop and narrow-phone views, inspect important actor/landmark sprite bounds and legible dialogue, controls and objectives. Phone objectives may live in the scrollable sidebar; do not silently remove them. Automated geometry cannot judge enjoyable writing or art. Debug-state mutation and schema validation alone never complete a scene proof. Record deferred owner taste explicitly and preserve revision-bound screenshots and review evidence. Existing legacy scripts stay valid but need the brief and proof before quality acceptance.\n`;
    writeFileSync(resolve(stage, 'writer-instructions.md'), instructions + sceneInstructions);
    appendFileSync(
      resolve(stage, 'writer-instructions.md'),
      `\n## Durable narrative handoff\n\nUse the included three \`scene-examples/bell-*.json\` handoffs as an authoring example, not a runtime adventure. Preserve the complete previous continuityOut as the next continuityIn, including resolved questions/promises and choices. Recaps never replace canonical state. Stable obligations, decisionRecords and actorRoles retain IDs and originating scenes. Each scene must introduce, advance, complicate or resolve an obligation and state a beat-linked consequence in continuityChanges. Keep required traits in both participant and durable role; optional appearance must not override ownership. A role substitution needs matching identity/resource/owner, dialogueBeatIds and staging, as well as updated continuity. Required capability gaps stay proposals, never invented implemented mechanics. Use --require-continuity and --previous when validating a new handoff. Legacy string decisions need explicit authored IDs; do not infer them automatically. Structural consistency cannot judge literary truth or quality.\n`,
    );
    writeFileSync(resolve(stage, 'scene-script.schema.json'), readFileSync(resolve(ROOT, 'content/scene-scripts/schema.json')));
    mkdirSync(resolve(stage, 'scene-examples'));
    for (const id of ['one', 'two', 'three'])
      writeFileSync(resolve(stage, `scene-examples/bell-${id}.json`), readFileSync(resolve(ROOT, `content/scene-scripts/examples/continuity/bell-${id}.json`)));
    const files = [];
    for (const file of [
      'catalogue.json',
      'index.html',
      'app.js',
      'styles.css',
      'writer-instructions.md',
      'scene-script.schema.json',
      ...['one', 'two', 'three'].map(id => `scene-examples/bell-${id}.json`),
    ]) {
      const content = readFileSync(resolve(stage, file));
      files.push({path: file, sha256: createHash('sha256').update(content).digest('hex')});
    }
    if (exportedReferences.length) {
      const content = readFileSync(resolve(stage, 'references.json'));
      files.push({path: 'references.json', sha256: createHash('sha256').update(content).digest('hex')});
    }
    for (const [path, sha256] of previewMap) files.push({path, sha256});
    files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
    writeFileSync(
      resolve(stage, 'manifest.json'),
      `${JSON.stringify({format: 1, sourceRevision: catalogue.sourceRevision, selection: all ? {allVisuals: true} : {visualIds: selectedVisualIds, referenceIds: selectedReferenceIds}, files}, null, 2)}\n`,
    );
    renameSync(stage, destination);
    return {destination, selectedCount: selectedIds.length, previewCount: previewMap.size, fileCount: files.length + 1};
  } catch (error) {
    rmSync(stage, {recursive: true, force: true});
    throw error;
  }
}
