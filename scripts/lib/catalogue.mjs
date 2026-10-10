import {readFileSync, readdirSync, realpathSync, existsSync, statSync} from 'node:fs';
import {resolve, relative, sep, isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import Ajv from 'ajv';
import {format, resolveConfig} from 'prettier';
import {assets} from '../../dist/src/data/assets.js';
import {biomes} from '../../dist/src/data/biomes.js';
import {moves} from '../../dist/src/data/moves.js';
import {SFX, AMBIENCE} from '../../dist/src/data/sounds.js';
import {LANDMARK_KINDS, TERRAIN} from '../../dist/src/domain/mapdata.js';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const json = path => JSON.parse(readFileSync(safePath(ROOT, path), 'utf8'));
const words = value => value.replaceAll('-', ' ');
const sorted = values => [...values].sort((a, b) => a.localeCompare(b, 'en'));
const pretty = value => JSON.stringify(value, null, 2) + '\n';
export const sha256 = value => createHash('sha256').update(value).digest('hex');

export function safePath(root, path) {
  if (typeof path !== 'string' || !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(path) || path.split('/').includes('..'))
    throw new Error(`Unsafe path: ${path}`);
  const full = resolve(root, path);
  const rel = relative(realpathSync(root), realpathSync(full));
  if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`) || resolve(full) === resolve(root)) throw new Error(`Path escapes root: ${path}`);
  return full;
}

function files(folder) {
  return readdirSync(safePath(ROOT, folder), {withFileTypes: true}).flatMap(entry => {
    const path = `${folder}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Source symlink refused: ${path}`);
    return entry.isDirectory() ? files(path) : [path];
  });
}

export function collectFacts() {
  const records = [];
  const sources = new Set([
    'dist/src/data/assets.js',
    'dist/src/data/biomes.js',
    'dist/src/data/moves.js',
    'dist/src/data/sounds.js',
    'dist/src/domain/mapdata.js',
    'art/assets/subjects.json',
    'art/assets/third-party/registry.json',
    'art/characters/creature-follower-metadata.json',
    'art/characters/creature-combat-metadata.json',
  ]);
  const add = (family, runtimeId, raw, source, extra = {}) => {
    sources.add(source);
    records.push({
      id: `${family}:${runtimeId}`,
      family,
      runtimeId,
      name: raw.name ?? words(runtimeId),
      description: raw.desc ?? raw.description ?? raw.name ?? words(runtimeId),
      source,
      evidence: 'tests/packs.test.mjs',
      raw,
      ...extra,
    });
  };
  const subjects = json('art/assets/subjects.json').subjects;
  const followers = json('art/characters/creature-follower-metadata.json');
  const combat = json('art/characters/creature-combat-metadata.json');
  const visualReviews = json('art/characters/visual-reviews.json');
  const characterMetadata = json('art/characters/metadata.json');
  const thirdParty = json('art/assets/third-party/registry.json');
  const externalAssets = new Map(thirdParty.packages.flatMap(pack => pack.assets.map(asset => [asset.name, {asset, pack}])));
  sources.add('art/characters/visual-reviews.json');
  sources.add('art/characters/metadata.json');
  for (const asset of assets) {
    const external = externalAssets.get(asset.name);
    const subject =
      subjects.find(value => value.exports?.some(output => output.assetId === asset.name)) ??
      subjects.find(
        value => value.canonicalReferences?.some(ref => ref.assetId === asset.name) || asset.name === value.id || asset.name.startsWith(`${value.id}-`),
      );
    const follower = followers.sprites[asset.name];
    const battle = combat.sprites[asset.name];
    const preview = `dist/${asset.src}`;
    sources.add(preview);
    add('visual', asset.name, asset, 'dist/src/data/assets.js', {
      description: external?.asset.description ?? subject?.identity?.silhouette ?? words(asset.name),
      dimensions: `${asset.w} by ${asset.h} source pixels`,
      directions: follower
        ? followers.directions.join(', ')
        : asset.name === 'person-red-cap-motion'
          ? 'Eight rows in the player motion sheet; see character metadata.'
          : 'Static pose or owning atlas metadata; do not infer directions from image size.',
      animations: follower
        ? followers.frameOrder.join(', ')
        : battle
          ? combat.frameOrder.join(', ')
          : asset.name === 'person-red-cap-motion'
            ? 'Player idle and walking frames; see character preview and metadata.'
            : 'No animation states declared for this static image.',
      evidence: 'tests/assets.test.mjs',
      preview,
      animationMetadata: follower ? follower : (battle ?? null),
      identity: subject?.identity ?? null,
      review: visualReviews.subjects.filter(value => value.asset === asset.name).map(value => value.visual),
      characterMetadata: asset.kind === 'person' || asset.name.startsWith('person-') ? characterMetadata : null,
      sourceLicenseSummary: external
        ? `${external.pack.license}; ${external.pack.attributionRequired ? 'attribution required' : 'attribution not required'}.`
        : 'Original Mossvale artwork; see the asset source record.',
      allowedUseSummary: external
        ? `${external.asset.intendedUse} License: personal and public-repository use and adaptation are permitted; attribution is not required. ${external.asset.limitations}`
        : `Asset ${asset.name} is an image reference, not a gameplay action. Refer to visual metadata before using atlas frames.`,
      externalSource: external ? external.pack.source : null,
      licenseReference: external ? external.pack.licenseUrl : null,
      sourcePage: external ? external.pack.source : 'See the local artwork provenance record.',
      licenseLink: external ? external.pack.licenseUrl : 'See the local artwork provenance record.',
    });
  }
  for (const biome of biomes) add('biome', biome.id, biome, 'dist/src/data/biomes.js', {evidence: 'tests/roster.test.mjs'});
  for (const [id, name] of Object.entries(TERRAIN)) add('terrain', name, {name, token: id}, 'dist/src/domain/mapdata.js', {evidence: 'tests/maps.test.mjs'});
  for (const [id, move] of Object.entries(moves))
    add('move', id, move, 'dist/src/data/moves.js', {power: String(move.power), evidence: 'tests/battle-actions.test.mjs'});
  for (const [id, cue] of Object.entries(SFX))
    add('sound', id, {name: words(id), notes: cue}, 'dist/src/data/sounds.js', {
      description: `Synthesized ${words(id)} sound cue.`,
      evidence: 'tests/audio.test.mjs',
    });
  for (const [id, profile] of Object.entries(AMBIENCE))
    add('ambience', id, {name: words(id), profile}, 'dist/src/data/sounds.js', {
      description: `Regional ${words(id)} ambience.`,
      evidence: 'tests/audio.test.mjs',
    });
  const roots = [
    'dist/maps',
    ...sorted(readdirSync(resolve(ROOT, 'tests/fixtures/packs')))
      .filter(name => existsSync(resolve(ROOT, `tests/fixtures/packs/${name}/index.json`)))
      .map(name => `tests/fixtures/packs/${name}`),
  ];
  for (const folder of roots) {
    const source = `${folder}/index.json`;
    const pack = json(source);
    add('pack', pack.id, pack, source, {description: pack.brief ?? pack.name, evidence: 'tests/packs.test.mjs'});
    const registryPath = `${folder}/${pack.registries ?? 'registries.json'}`;
    const registry = json(registryPath);
    for (const key of ['economy', 'tactics', 'progression', 'battle', 'moves'])
      if (registry[key])
        add('rules', `${pack.id}/${key}`, {name: `${pack.name} ${key}`, definition: registry[key]}, registryPath, {
          description: `Validated ${key} tuning for ${pack.name}; configure existing rules, not new mechanics.`,
          evidence: 'tests/registries.test.mjs',
        });
    for (const species of registry.species)
      add('species', `${pack.id}/${species.id}`, species, registryPath, {
        sprite: species.sprite,
        dependencies: [`visual:${species.sprite}`],
        evidence: 'tests/registries.test.mjs',
      });
    for (const region of registry.regions)
      add('region', `${pack.id}/${region.id}`, region, registryPath, {
        biome: region.biome ?? 'No biome tag declared.',
        dependencies: region.preview ? [`visual:${region.preview}`] : [],
        evidence: 'tests/registries.test.mjs',
      });
    for (const type of registry.types ?? []) add('type', `${pack.id}/${type.id}`, type, registryPath, {evidence: 'tests/registries.test.mjs'});
    for (const mapId of pack.maps) {
      const path = `${folder}/${pack.mapDirectory ?? ''}${mapId}.json`;
      const map = json(path);
      add('map', `${pack.id}/${map.id}`, map, path, {
        description: `${map.name}: ${map.size.w} by ${map.size.h} authored map.`,
        biome: map.biome ?? 'No explicit biome tag; consult the selected pack region.',
        connections: JSON.stringify(map.exits?.map(exit => ({id: exit.id, to: exit.to})) ?? []),
        spawns: JSON.stringify(map.spawns),
        cardPreview: map.preview ?? 'No dedicated Island-card preview is configured.',
        dependencies: map.preview ? [`visual:${map.preview}`] : [],
        evidence: 'tests/maps.test.mjs',
      });
      for (const landmark of map.landmarks ?? []) {
        const kind = landmark.kind;
        add('landmark', `${pack.id}/${map.id}/${landmark.id}`, landmark, path, {
          ...landmarkDetails(kind),
          description: `${landmark.name ?? landmark.label ?? words(kind)} (${kind}) on ${map.name}.`,
          dependencies: landmark.sprite ? [`visual:${landmark.sprite}`] : [],
          evidence: 'tests/maps.test.mjs',
        });
      }
    }
    for (const key of ['objectives', 'story'])
      if (typeof pack[key] === 'string') {
        const path = `${folder}/${pack[key]}`;
        add('narrative', `${pack.id}/${key}`, {name: `${pack.name} ${key}`, definition: json(path)}, path, {
          description: `Existing ${key} data for ${pack.name}; conditions/dialogue follow the shared vocabulary.`,
          evidence: key === 'objectives' ? 'tests/objectives.test.mjs' : 'tests/story.test.mjs',
        });
      }
    for (const [id, prefab] of Object.entries(pack.prefabs ?? {}))
      add('prefab', `${pack.id}/${id}`, {name: words(id), ...prefab}, source, {
        description: `Reusable ${words(id)} placement prefab.`,
        evidence: 'tests/prefabs.test.mjs',
      });
    if (pack.inventory) {
      const path = `${folder}/${pack.inventory}`;
      const inventory = json(path);
      for (const [id, item] of Object.entries(inventory.items)) {
        const potion = inventory.supplies?.potions === id;
        const orb = inventory.supplies?.orbs === id;
        add('item', `${pack.id}/${id}`, item, path, {
          description: `${item.name}: ${potion ? 'mapped battle potion; live healing remains fixed at 24 HP' : orb ? 'mapped capture supply' : item.kind === 'valuable' ? 'valuable eligible for inventory selling' : 'pack inventory definition; live consumption is not established'}.`,
          contexts: potion || orb ? 'Inventory transactions and mapped battle supply.' : 'Inventory transactions; no generic exploration-use UI is claimed.',
          targets: potion ? 'Active companion in battle.' : orb ? 'Wild opponent during capture.' : 'Bag/storage and coins, not a temporary actor effect.',
          consumption: potion
            ? 'One on successful battle healing; full HP or no supply refuses use.'
            : orb
              ? 'One on an eligible capture attempt, including failed capture.'
              : 'Selling/transfers use validated quantities; use-effect metadata alone does not consume it in gameplay.',
          strength: potion
            ? `Runtime POTION_HEAL is 24; metadata ${JSON.stringify(item.effect)} is not live percentage healing.`
            : orb
              ? 'Capture probability depends on battle rules and current opponent state.'
              : `Prices/effect metadata: ${JSON.stringify(item)}.`,
          evidence: 'tests/inventory.test.mjs',
        });
      }
    }
  }
  for (const kind of LANDMARK_KINDS)
    add('landmark', kind, {name: words(kind), kind}, 'dist/src/domain/mapdata.js', {
      ...landmarkDetails(kind),
      description: `Configure an existing ${kind} landmark role.`,
      evidence: 'tests/maps.test.mjs',
    });
  // The reusable prefab fixture and terrain source tiles are authoring resources, not shipped game maps.
  const prefabPath = 'tests/fixtures/prefabs/catalog.json';
  const prefabDefinitions = json(prefabPath);
  for (const [id, definition] of Object.entries(prefabDefinitions.prefabs ?? prefabDefinitions))
    add('prefab', `fixture/${id}`, {name: words(id), ...definition}, prefabPath, {
      description: `Validated fixture prefab ${words(id)}.`,
      evidence: 'tests/prefabs.test.mjs',
    });
  for (const path of files('dist/assets/terrain-family').filter(path => path.endsWith('.svg')))
    add('terrain-art', path.split('/').at(-1).replace('.svg', ''), {name: words(path.split('/').at(-1).replace('.svg', ''))}, path, {
      description: 'Authoring terrain source tile; see neighbor-aware terrain preview.',
      evidence: 'tests/maps.test.mjs',
    });
  for (const path of files('art/characters').filter(path => path.endsWith('.json'))) sources.add(path);
  for (const path of files('dist/src')) sources.add(path);
  for (const path of files('dist/maps').filter(path => path.endsWith('.json'))) sources.add(path);
  for (const path of [
    'scripts/compile-brief.mjs',
    'scripts/pack.mjs',
    'scripts/art-jobs.mjs',
    'scripts/bake-terrain-family.mjs',
    'dist/map-editor.html',
    'scripts/catalogue.mjs',
    'scripts/lib/catalogue.mjs',
    'scripts/check-catalogue-impact.mjs',
    'scripts/lib/catalogue-impact.mjs',
    'content/catalogue/templates.json',
    'content/catalogue/curated.json',
    'content/catalogue/schema.json',
  ])
    sources.add(path);
  return {records: records.sort((a, b) => a.id.localeCompare(b.id, 'en')), sources: sorted(sources)};
}

function landmarkDetails(kind) {
  const rules = {
    cottage: [
      'Scenery/collision; no automatic house-rest interaction.',
      'None merely from the cottage sprite.',
      'No reward from decorative placement.',
      'Not applicable: scenery.',
      'No new rest state.',
    ],
    ranger: [
      'Existing ranger menu: healing, supply shop and optional inventory panel.',
      'Existing free rest, buying, selling/storage where pack enables them.',
      'Existing healing/supply floor; no home sleep bonus.',
      'Menu actions repeat subject to supplies/prices.',
      'Existing team/supplies/inventory save transaction.',
    ],
    shrine: [
      'Existing shrine interaction and guardian challenge.',
      'Challenge guardian using existing battle rules.',
      'Authored guardian coins/potions/XP and seal.',
      'Challenges follow current shrine completion rules.',
      'Saved seal and battle/checkpoint rules.',
    ],
    chest: [
      'Existing chest interaction.',
      'Claim authored supply/coin reward once.',
      'Existing coins/potions/orbs, not arbitrary item loot.',
      'Claimed chest does not grant again.',
      'Stable chest flag in existing saves.',
    ],
    sign: [
      'Existing sign interaction.',
      'Authored text/conditional dialogue; optional validated route gate.',
      'No automatic reward solely from a sign image.',
      'Dialogue repeats; route rewards follow once-only event keys.',
      'Dialogue UI is transient; route/scene flags persist when configured.',
    ],
  }[kind];
  if (!rules) throw new Error(`Uncurated landmark kind ${kind}`);
  return {activation: rules[0], actions: rules[1], rewards: rules[2], repetition: rules[3], persistence: rules[4]};
}

function render(text, record) {
  return text.replace(/%([a-zA-Z]+)%/g, (_match, key) => {
    if (record[key] === undefined) throw new Error(`${record.id}: missing template value ${key}`);
    return String(record[key]);
  });
}

function compactDefinition(record) {
  // Large geometry/story blobs belong in the canonical builder reference, not every writer fiche.
  if (['map', 'pack', 'narrative', 'prefab', 'rules'].includes(record.family)) return null;
  return record.raw;
}

export async function generateCatalogue() {
  const facts = collectFacts();
  const templates = json('content/catalogue/templates.json');
  const curated = json('content/catalogue/curated.json');
  const entries = facts.records.map(record => {
    const template = templates[record.family];
    if (!template) throw new Error(`Missing template for ${record.family}`);
    const summary = render(template.summary, record);
    const entry = {
      id: record.id,
      kind: template.kind,
      name: record.name,
      summary,
      status: 'available',
      scope: template.scope,
      configuration: [
        {
          name: 'definition',
          type: 'canonical authoring record',
          default: compactDefinition(record),
          limits: `Configure through ${record.source}; use its existing validator, not arbitrary new fields.`,
        },
      ],
      dependencies: record.dependencies ?? [],
      limits: template.limits,
      examples: [{intent: summary, usage: `Reference ${record.runtimeId} in the existing format at ${record.source}.`, expected: summary}],
      references: [record.source],
      evidence: [{path: record.evidence, assertion: 'Existing owning-contract regression; does not establish fresh semantic art approval.'}],
      details: Object.fromEntries(Object.entries(template.details).map(([key, value]) => [key, render(value, record)])),
    };
    if (record.preview) entry.previews = [{path: record.preview, description: record.description}];
    return entry;
  });
  entries.push(...curated.capabilities);
  entries.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const catalogue = {format: 1, sourceRevision: curated.sourceRevision, purpose: 'catalogue', entries};
  const hashes = Object.fromEntries(facts.sources.map(path => [path, sha256(readFileSync(safePath(ROOT, path)))]));
  const provenance = {
    format: 1,
    sourceRevision: curated.sourceRevision,
    sourceHashes: hashes,
    sourceDigest: sha256(pretty(hashes)),
    exclusions: curated.exclusions,
    records: facts.records,
  };
  const escape = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
  const index =
    '# Current authoring catalogue\n\nGenerated by `npm run catalogue:write`; do not edit. See [usage and update instructions](../../docs/CATALOGUE.md).\n\n' +
    `Audit baseline: \`${curated.sourceRevision}\`; exact source digest: \`${provenance.sourceDigest}\`. Entries: ${entries.length}. Source hashes in facts.json certify freshness, not semantic truth.\n\n` +
    '| ID | Status | Scope | Summary |\n| --- | --- | --- | --- |\n' +
    entries.map(entry => `| ${entry.id} | ${entry.status} | ${entry.scope} | ${escape(entry.summary)} |`).join('\n') +
    '\n';
  const formatting = await resolveConfig(resolve(ROOT, 'package.json'));
  const outputs = {
    'content/catalogue/catalogue.json': pretty(catalogue),
    'content/catalogue/facts.json': pretty(provenance),
    'content/catalogue/INDEX.md': index,
  };
  return Object.fromEntries(
    await Promise.all(
      Object.entries(outputs).map(async ([path, content]) => [
        path,
        await format(content, {...formatting, parser: path.endsWith('.json') ? 'json' : 'markdown'}),
      ]),
    ),
  );
}

export function validateGenerated(outputs, read) {
  return Object.entries(outputs).flatMap(([path, expected]) => (read(path) === expected ? [] : [`${path}: stale or missing; run npm run catalogue:write`]));
}

export function validateCatalogue(catalogue, {root = ROOT, schema = json('content/catalogue/schema.json')} = {}) {
  const validate = new Ajv({allErrors: true, strict: true}).compile(schema);
  if (!validate(catalogue)) return validate.errors.map(error => `${error.instancePath}: ${error.message}`);
  const errors = [];
  const ids = new Set();
  for (const entry of catalogue.entries) {
    if (ids.has(entry.id)) errors.push(`Duplicate catalogue ID: ${entry.id}`);
    ids.add(entry.id);
  }
  for (const entry of catalogue.entries) {
    for (const id of [...entry.dependencies, ...(entry.replacement ? [entry.replacement] : [])])
      if (!ids.has(id)) errors.push(`${entry.id}: missing dependency/replacement ${id}`);
    for (const path of [...entry.references, ...entry.evidence.map(value => value.path), ...(entry.previews ?? []).map(value => value.path)]) {
      try {
        if (!statSync(safePath(root, path)).isFile()) throw new Error(`Reference is not a file: ${path}`);
      } catch (error) {
        errors.push(`${entry.id}: ${error.message}`);
      }
    }
  }
  return errors;
}
