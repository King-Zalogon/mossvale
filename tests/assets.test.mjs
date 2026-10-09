import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync, crc32} from 'node:zlib';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {assets, spriteId} from '../dist/src/data/assets.js';
import {species} from '../dist/src/data/species.js';
import {checkAssets} from '../scripts/lib/assets-check.mjs';
import {checkSubjectProvenance} from '../scripts/lib/provenance-check.mjs';
import {sha256File} from '../scripts/lib/sha256.mjs';
import {decodePng, opaqueBounds} from '../scripts/lib/png.mjs';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

/** A tiny PNG writer for fixtures. `pixel(x, y)` returns [r, g, b, a] (type 6) or [r, g, b] (type 2). */
function makePng(w, h, pixel, colorType = 6) {
  const ch = colorType === 6 ? 4 : 3;
  const raw = Buffer.alloc((w * ch + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) pixel(x, y).forEach((v, i) => (raw[y * (w * ch + 1) + 1 + x * ch + i] = v));
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const solid = () => [10, 200, 30, 255];
const entry = (name, kind, extra = {}) => ({
  name,
  kind,
  src: `assets/${{prop: 'props', creature: 'creatures', person: 'people', item: 'items'}[kind]}/${name}.png`,
  w: 20,
  h: 20,
  anchor: 'bottom-center',
  required: true,
  ...extra,
});

function withDist(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'mossvale-assets-'));
  try {
    for (const [path, buf] of Object.entries(files)) {
      mkdirSync(join(dir, path, '..'), {recursive: true});
      writeFileSync(join(dir, path), buf);
    }
    return fn(dir);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
}
const has = (errors, text) =>
  assert.ok(
    errors.some(e => e.includes(text)),
    `expected "${text}" in:\n${errors.join('\n')}`,
  );

test('the shipped manifest, names and PNGs pass the checks', () => {
  const dist = fileURLToPath(new URL('../dist/', import.meta.url));
  const {errors} = checkAssets(assets, dist);
  assert.deepEqual(errors, []);
});

test('text provenance hashes are stable across Windows CRLF checkouts', () => {
  const lf = Buffer.from('{"metadata":true}\n');
  withDist({'metadata.json': Buffer.from('{"metadata":true}\r\n')}, dir => {
    assert.equal(sha256File(join(dir, 'metadata.json')), createHash('sha256').update(lf).digest('hex'));
  });
});

test('sample visual subjects have hashed canonical references, exports and linked batches', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const registry = JSON.parse(readFileSync(new URL('../art/assets/subjects.json', import.meta.url), 'utf8'));
  const sourceMetadata = JSON.parse(readFileSync(new URL('../art/assets/metadata.json', import.meta.url), 'utf8'));
  const combatMetadata = JSON.parse(readFileSync(new URL('../art/characters/creature-combat-metadata.json', import.meta.url), 'utf8'));
  const {errors} = checkSubjectProvenance(registry, {root, assets, sourceMetadata, combatMetadata});
  assert.deepEqual(errors, []);
  assert.deepEqual(
    registry.subjects.map(subject => subject.id),
    [
      'player-red-cap-adventurer',
      'creature-fernling',
      'creature-duskwing',
      'creature-emberkin',
      'creature-brooklet',
      'creature-hushram',
      'creature-voltkit',
      'creature-mushmallow',
      'creature-frostowl',
      'creature-pebblit',
      'creature-bramblebuck',
      'creature-siltkip',
      'creature-sunskitter',
      'creature-sedgegnaw',
      'creature-petalunge',
      'creature-cindercurl',
      'creature-sunsifter',
      'creature-rillume',
      'creature-mushmallow-thorn-mantle',
      'creature-pebblit-crystal-ridge',
      'creature-frostowl-ice-mantle',
      'creature-siltkip-tide-sail',
    ],
  );
  const player = registry.subjects[0];
  assert.deepEqual(player.sourceBatches.flatMap(batch => batch.directions).toSorted(), [
    'east',
    'north',
    'northeast',
    'northwest',
    'south',
    'southeast',
    'southwest',
    'west',
  ]);
  assert.ok(player.sourceBatches.every(batch => batch.referenceAssetIds.length && batch.exportAssetIds.includes('person-red-cap-motion')));
  const additionalPlayerSources = player.sourceBatches.flatMap(batch => batch.additionalSources ?? []);
  for (const source of additionalPlayerSources) {
    assert.equal(sha256File(join(root, source.path)), source.sha256, `${source.id} generated pose hash`);
    assert.ok(source.walkColumns?.length, `${source.id} identifies the runtime walk cell it supplies`);
  }
  assert.match(player.exportWorkflow.settings, /West walk cell 3 uses its separately retained generated opposite-stride source/);
  for (const creature of registry.subjects.filter(subject => subject.runtimeCombat)) {
    assert.deepEqual(creature.runtimeTreatments.states, ['idle', 'travel', 'hit', 'capture']);
    assert.equal(creature.runtimeTreatments.artPixelsChanged, false);
    assert.equal(creature.runtimeTreatments.scope, 'static portrait fallback only');
    assert.deepEqual(creature.runtimeCombat.states, ['idle', 'attack', 'hit', 'faint', 'capture']);
    assert.equal(creature.runtimeCombat.artPixelsChanged, true);
    assert.ok(creature.sourceBatches.some(batch => batch.states?.length === 5 && batch.referenceAssetIds.includes(creature.id)));
  }
  const followers = registry.subjects.filter(subject => subject.runtimeFollower);
  assert.deepEqual(followers.map(subject => subject.id).toSorted(), [
    'creature-bramblebuck',
    'creature-brooklet',
    'creature-cindercurl',
    'creature-duskwing',
    'creature-emberkin',
    'creature-fernling',
    'creature-frostowl',
    'creature-hushram',
    'creature-mushmallow',
    'creature-pebblit',
    'creature-petalunge',
    'creature-rillume',
    'creature-sedgegnaw',
    'creature-siltkip',
    'creature-sunsifter',
    'creature-sunskitter',
    'creature-voltkit',
  ]);
  for (const creature of followers) {
    assert.equal(creature.runtimeFollower.assetId, `${creature.id}-follower`);
    assert.equal(creature.runtimeFollower.fallbackAssetId, creature.id);
    assert.deepEqual(creature.runtimeFollower.directions, ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']);
  }
});

test('visual-subject validation catches a stale output digest and an unrecorded batch reference', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const registry = JSON.parse(readFileSync(new URL('../art/assets/subjects.json', import.meta.url), 'utf8'));
  const sourceMetadata = JSON.parse(readFileSync(new URL('../art/assets/metadata.json', import.meta.url), 'utf8'));
  const combatMetadata = JSON.parse(readFileSync(new URL('../art/characters/creature-combat-metadata.json', import.meta.url), 'utf8'));
  registry.subjects[0].exports[0].sha256 = '0'.repeat(64);
  registry.subjects[0].sourceBatches[0].referenceAssetIds = ['missing-reference'];
  registry.subjects[0].sourceBatches[0].directions = ['northeast'];
  const {errors} = checkSubjectProvenance(registry, {root, assets, sourceMetadata, combatMetadata});
  has(errors, 'SHA-256 mismatch');
  has(errors, 'is not a canonical reference');
  has(errors, 'required direction north has no source batch');
});

test('visual-subject exports pin a compatible, versioned profile and its settings digest', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const registry = JSON.parse(readFileSync(new URL('../art/assets/subjects.json', import.meta.url), 'utf8'));
  const sourceMetadata = JSON.parse(readFileSync(new URL('../art/assets/metadata.json', import.meta.url), 'utf8'));
  const combatMetadata = JSON.parse(readFileSync(new URL('../art/characters/creature-combat-metadata.json', import.meta.url), 'utf8'));
  const profiles = JSON.parse(readFileSync(new URL('../art/characters/export-profiles.json', import.meta.url), 'utf8')).profiles;
  const digest = id => createHash('sha256').update(JSON.stringify(profiles[id])).digest('hex');

  registry.subjects[0].exports[0].profileSha256 = '0'.repeat(64);
  let result = checkSubjectProvenance(registry, {root, assets, sourceMetadata, combatMetadata});
  has(result.errors, 'export profile red-cap-motion-v1 settings hash is stale');

  registry.subjects[0].exports[0].profileId = 'creature-portrait-v1';
  registry.subjects[0].exports[0].profileSha256 = digest('creature-portrait-v1');
  result = checkSubjectProvenance(registry, {root, assets, sourceMetadata, combatMetadata});
  has(result.errors, 'profile category creature-portrait does not match person-red-cap-motion');
});

test('a prop source atlas record cannot omit its export profile', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const registry = JSON.parse(readFileSync(new URL('../art/assets/subjects.json', import.meta.url), 'utf8'));
  const sourceMetadata = JSON.parse(readFileSync(new URL('../art/assets/metadata.json', import.meta.url), 'utf8'));
  const combatMetadata = JSON.parse(readFileSync(new URL('../art/characters/creature-combat-metadata.json', import.meta.url), 'utf8'));
  delete sourceMetadata.assets.find(asset => asset.kind === 'prop').exportProfile;
  const {errors} = checkSubjectProvenance(registry, {root, assets, sourceMetadata, combatMetadata});
  has(errors, 'a versioned export profile ID is required');
});

test('combat provenance rejects frame-order drift and unlinked generated sources', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const registry = JSON.parse(readFileSync(new URL('../art/assets/subjects.json', import.meta.url), 'utf8'));
  const sourceMetadata = JSON.parse(readFileSync(new URL('../art/assets/metadata.json', import.meta.url), 'utf8'));
  const combatMetadata = JSON.parse(readFileSync(new URL('../art/characters/creature-combat-metadata.json', import.meta.url), 'utf8'));
  registry.subjects[1].runtimeCombat.states.reverse();
  registry.subjects[2].sourceBatches[0].path = 'art/characters/source/missing-generated-sheet.png';
  const {errors} = checkSubjectProvenance(registry, {root, assets, sourceMetadata, combatMetadata});
  has(errors, 'runtime combat states must match the manifest frame row order');
  has(errors, 'generated combat source must be recorded as a referenced source batch');
});

test('content refers to art by name: species, directions and the manifest agree', () => {
  assert.equal(new Set(assets.map(a => a.name)).size, assets.length);
  for (const s of species) assert.equal(assets[s.sprite].kind, 'creature', s.id);
  for (const d of ['south', 'north', 'west', 'east']) assert.equal(assets[spriteId(`person-red-cap-${d}`)].kind, 'person');
  assert.deepEqual(assets[spriteId('person-red-cap-motion')].frames.rowOrder, [
    'north',
    'northeast',
    'east',
    'southeast',
    'south',
    'southwest',
    'west',
    'northwest',
  ]);
  assert.deepEqual(assets[spriteId('person-traveler')].frames.columnOrder, ['north', 'east', 'south', 'west']);
  assert.deepEqual(assets[spriteId('person-gardener')].frames.columnOrder, ['north', 'east', 'south', 'west']);
  assert.throws(() => spriteId('no-such-sprite'), /unknown asset/);
});

test('editable portrait and prop atlases cover their runtime sprites and export exact manifest crops', () => {
  const sourceRoot = new URL('../art/assets/', import.meta.url);
  const metadata = JSON.parse(readFileSync(new URL('metadata.json', sourceRoot), 'utf8'));
  const sourceArchive = JSON.parse(readFileSync(new URL('../characters/source-archive.json', sourceRoot), 'utf8'));
  const profiles = JSON.parse(readFileSync(new URL('../characters/export-profiles.json', sourceRoot), 'utf8')).profiles;
  const propProfileSha256 = id => createHash('sha256').update(JSON.stringify(profiles[id])).digest('hex');
  const landmarkSources = new Set(
    JSON.parse(readFileSync(new URL('../art/assets/source/landmarks/manifest.json', import.meta.url), 'utf8')).assets.map(asset => asset.name),
  );
  assert.equal(metadata.pixelPreserving, true);
  assert.equal(metadata.anchor, 'bottom-center');
  const separatelySourced = new Set([
    'creature-emberkin-combat',
    'creature-voltkit-combat',
    'creature-hushram-follower',
    'creature-voltkit-follower',
    'creature-mushmallow-follower',
    'creature-frostowl-follower',
    'creature-pebblit-follower',
    'creature-bramblebuck-follower',
    'creature-siltkip-follower',
    'creature-sunskitter-follower',
  ]);
  const atlasAssets = assets.filter(a => !separatelySourced.has(a.name));
  assert.equal(metadata.assets.length, atlasAssets.length);
  assert.deepEqual(metadata.assets.map(a => a.name).toSorted(), atlasAssets.map(a => a.name).toSorted());

  const sheets = new Map();
  for (const [name, dimensions] of Object.entries(metadata.sheets)) {
    const decoded = decodePng(readFileSync(new URL(name, sourceRoot)));
    assert.equal(decoded.color, 6, name);
    assert.deepEqual([decoded.width, decoded.height], [dimensions.width, dimensions.height], name);
    sheets.set(name, decoded);
  }

  for (const source of metadata.assets) {
    const asset = assets.find(a => a.name === source.name);
    assert.ok(asset, source.name);
    assert.equal(source.width, asset.w, source.name);
    assert.equal(source.height, asset.h, source.name);
    assert.equal(source.anchor, asset.anchor, source.name);
    assert.equal(source.kind, asset.kind, source.name);
    if (source.kind === 'prop') {
      const profileId = landmarkSources.has(source.name) ? 'prop-landmark-v1' : 'prop-static-v1';
      assert.deepEqual(source.exportProfile, {id: profileId, settingsSha256: propProfileSha256(profileId)}, source.name);
    }
    assert.ok(sheets.has(source.sheet), `${source.name} source sheet exists`);
    assert.ok(source.provenance.editablePixelSource, source.name);
    for (const ref of source.provenance.originalGeneratedReferences) {
      let generated;
      try {
        generated = readFileSync(new URL(`../../${ref}`, sourceRoot));
      } catch {
        const archived = sourceArchive.sources[ref];
        assert.ok(archived, `${ref} is retained directly or in the generated-source archive`);
        generated = Buffer.concat(archived.parts.map(part => readFileSync(new URL(`../../${part}`, sourceRoot))));
        assert.equal(generated.length, archived.bytes, ref);
        assert.equal(createHash('sha256').update(generated).digest('hex'), archived.sha256, ref);
      }
      assert.ok(generated.length, ref);
    }
    if (asset.frames) {
      assert.equal(source.frames.columns, asset.frames.columns, source.name);
      assert.equal(source.frames.rows, asset.frames.rows, source.name);
      assert.deepEqual(source.frames.columnOrder, asset.frames.columnOrder, source.name);
      assert.deepEqual(source.frames.rowOrder, asset.frames.rowOrder, source.name);
    } else assert.equal(source.frames, null, source.name);

    const sheet = sheets.get(source.sheet);
    const {x, y} = source.cell;
    assert.ok(x >= 0 && y >= 0 && x + source.width <= sheet.width && y + source.height <= sheet.height, source.name);
    const runtime = decodePng(readFileSync(new URL(asset.src, new URL('../dist/', import.meta.url))));
    assert.ok([3, 6].includes(runtime.color), `${asset.name} uses a supported RGBA or indexed PNG`);
    assert.equal(runtime.channels, 4, asset.name);
    for (let row = 0; row < source.height; row++) {
      const sheetStart = (y + row) * sheet.stride + x * 4;
      const runtimeStart = row * runtime.stride;
      assert.deepEqual(
        sheet.data.subarray(sheetStart, sheetStart + source.width * 4),
        runtime.data.subarray(runtimeStart, runtimeStart + source.width * 4),
        `${source.name} source pixels match dist`,
      );
    }
  }
});

test('a well-formed sprite passes; the decoder reports padding', () => {
  const png = makePng(20, 20, (x, y) => (x >= 2 && x < 18 && y >= 3 && y < 19 ? [1, 2, 3, 255] : [0, 0, 0, 0]));
  assert.deepEqual(opaqueBounds(decodePng(png)), {left: 2, top: 3, right: 2, bottom: 1});
  withDist({'assets/props/tree-fir.png': png}, dir => assert.deepEqual(checkAssets([entry('tree-fir', 'prop')], dir), {errors: [], warnings: []}));
});

test('problems are reported with the asset name', () => {
  const good = makePng(20, 20, solid);
  const run = (list, files) => withDist(files, dir => checkAssets(list, dir).errors);
  has(run([entry('tree-fir', 'prop', {w: 21})], {'assets/props/tree-fir.png': good}), 'is 20x20, manifest says 21x20');
  has(run([entry('tree-fir', 'prop')], {}), 'file assets/props/tree-fir.png is missing');
  has(run([entry('tree-fir', 'prop')], {'assets/props/tree-fir.png': makePng(20, 20, () => [1, 2, 3], 2)}), 'RGBA');
  has(run([entry('tree-fir', 'prop')], {'assets/props/tree-fir.png': makePng(20, 20, () => [0, 0, 0, 0])}), 'fully transparent');
  has(
    run([entry('tree-fir', 'prop')], {'assets/props/tree-fir.png': makePng(20, 20, (x, y) => (y < 8 ? [1, 2, 3, 255] : [0, 0, 0, 0]))}),
    'empty space under the feet',
  );
  has(run([entry('tree-fir', 'prop')], {'assets/props/tree-fir.png': makePng(20, 20, x => (x > 12 ? [1, 2, 3, 255] : [0, 0, 0, 0]))}), 'side padding');
  has(run([entry('tree-fir', 'prop'), entry('tree-fir', 'prop')], {'assets/props/tree-fir.png': good}), 'duplicate name');
  has(run([entry('Tree_Fir', 'prop', {src: 'assets/props/Tree_Fir.png'})], {'assets/props/Tree_Fir.png': good}), 'kebab-case');
  has(run([entry('ranger-iris', 'prop')], {'assets/props/ranger-iris.png': good}), 'story role');
  has(run([entry('tree-fir', 'prop', {src: 'sprites/tree-fir.png'})], {'sprites/tree-fir.png': good}), 'src must be assets/props/tree-fir.png');
  has(run([entry('fox', 'creature')], {'assets/creatures/fox.png': good}), 'creature names start with "creature-"');
  has(run([entry('creature-tree', 'prop')], {'assets/props/creature-tree.png': good}), 'only creature/person/item');
  has(run([entry('tree-fir', 'prop', {kind: 'tree'})], {'assets/props/tree-fir.png': good}), 'kind must be one of');
  has(run([entry('tree-fir', 'prop', {anchor: 'center'})], {'assets/props/tree-fir.png': good}), 'anchor');
  has(run([entry('tree-fir', 'prop')], {'assets/props/tree-fir.png': good, 'assets/props/stray.png': good}), 'stray.png: not in the manifest');
});

test('unused required assets are flagged as warnings, optional ones are not', () => {
  const good = makePng(20, 20, solid);
  withDist({'assets/props/tree-fir.png': good, 'assets/items/item-orb.png': good}, dir => {
    const list = [entry('tree-fir', 'prop'), entry('item-orb', 'item', {required: false})];
    const {warnings} = checkAssets(list, dir, {referenceText: ''});
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /tree-fir: required but not referenced/);
    assert.deepEqual(checkAssets(list, dir, {referenceText: `"tree-fir"`}).warnings, []);
  });
});

test('fixed-cell transparent atlases validate each frame and its bottom anchor', () => {
  const png = makePng(40, 20, (x, y) => (x % 20 >= 2 && x % 20 < 18 && y >= 2 && y < 19 ? [1, 2, 3, 255] : [0, 0, 0, 0]));
  const sheet = entry('person-scout', 'person', {w: 40, h: 20, frames: {columns: 2, rows: 1, frameWidth: 20, frameHeight: 20}});
  withDist({'assets/people/person-scout.png': png}, dir => assert.deepEqual(checkAssets([sheet], dir), {errors: [], warnings: []}));
  withDist({'assets/people/person-scout.png': png}, dir => {
    const {errors} = checkAssets([{...sheet, frames: {...sheet.frames, columns: 3}}], dir);
    has(errors, 'frame grid');
  });
});

test('the real sprites decode as tightly cropped RGBA', () => {
  const dist = new URL('../dist/', import.meta.url);
  for (const a of assets) {
    const im = decodePng(readFileSync(new URL(a.src, dist)));
    assert.ok([3, 6].includes(im.color), `${a.name} uses a supported RGBA/indexed PNG`);
    assert.equal(im.channels, 4, `${a.name} expands to RGBA pixels`);
    assert.equal(im.transparent, true, `${a.name} has a real transparent palette/channel`);
    if (a.frames) {
      for (let row = 0; row < a.frames.rows; row++) {
        for (let column = 0; column < a.frames.columns; column++) {
          let maxY = -1;
          const x0 = column * a.frames.frameWidth;
          const y0 = row * a.frames.frameHeight;
          for (let y = 0; y < a.frames.frameHeight; y++) {
            for (let x = 0; x < a.frames.frameWidth; x++) if (im.data[(y0 + y) * im.stride + (x0 + x) * 4 + 3] > 8) maxY = y;
          }
          assert.ok(maxY >= 0, `${a.name} frame ${row},${column} is visible`);
          assert.ok(a.frames.frameHeight - 1 - maxY <= 6, `${a.name} frame ${row},${column} feet use the common bottom anchor`);
        }
      }
    } else assert.ok(opaqueBounds(im).bottom <= 3, `${a.name} stands on the bottom edge`);
  }
});
