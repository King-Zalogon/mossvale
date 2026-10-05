import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {assets, spriteId} from '../dist/src/data/assets.js';

const map = id => JSON.parse(readFileSync(new URL(`../dist/maps/${id}.json`, import.meta.url), 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

const replacements = [
  {
    map: 'meadow',
    id: 'old-well',
    sprite: 'prop-well-ruined',
    label: 'Inspect the old well',
    mapLabel: 'Old well',
    at: [60.4, 26.8],
    text: 'An old well, long dry. Carved beneath: the shy ones nap where the grass is longest.',
  },
  {
    map: 'meadow',
    id: 'hollow-note',
    sprite: 'tree-oak-hollow',
    label: 'Inspect the hollow oak',
    mapLabel: 'Whispering hollow',
    at: [44.2, 56.4],
    text: 'A hollow among the old trees. If you hear a rustle, wait: someone is watching.',
  },
  {
    map: 'orchard-ruins',
    id: 'cider-press',
    sprite: 'prop-cider-press',
    label: 'Inspect the cider press',
    mapLabel: 'Old cider press',
    at: [30.4, 44.4],
    text: 'The old cider press. The last pressing was a good year: the apples here never stopped falling.',
  },
  {
    map: 'orchard-ruins',
    id: 'fallen-wall',
    sprite: 'prop-orchard-wall-broken',
    label: 'Inspect the broken orchard wall',
    mapLabel: 'Fallen wall',
    at: [56.4, 27.4],
    text: 'Part of the old orchard wall. The ruins keep going east, but the trail is safe.',
  },
  {
    map: 'reedfen-wetlands',
    id: 'heron-blind',
    sprite: 'prop-heron-blind',
    label: 'Look through the heron hide',
    mapLabel: 'Heron blind',
    at: [16.4, 8.2],
    text: 'A hide for watching herons. Someone scratched in the plank: the shrine guardian loves a strong current.',
  },
  {
    map: 'stone-basin',
    id: 'quarry-note',
    sprite: 'prop-quarry-alcove',
    label: 'Inspect the quarry alcove',
    mapLabel: 'Old quarry alcove',
    at: [6.6, 21.4],
    text: 'Cut by hand, a block at a time. The guardian above sleeps lightly: roll with its charge, do not stand against it.',
  },
  {
    map: 'stone-basin',
    id: 'vista-note',
    sprite: 'prop-rim-overlook',
    label: 'Look over the basin',
    mapLabel: 'Rim vista',
    at: [47.4, 8.6],
    text: 'From the rim you can see the whole basin and the long road up to the shrine.',
  },
  {
    map: 'frostveil-grove',
    id: 'icefall-note',
    sprite: 'prop-icefall-ledge',
    label: 'Inspect the icefall ledge',
    mapLabel: 'Icefall ledge',
    at: [50.4, 38.2],
    text: 'The lake path bends back to the pass. Frostowl keep watch above; Hushram shelter under the lower pines.',
  },
  {
    map: 'stilt-isles',
    id: 'lantern-note',
    sprite: 'prop-hanging-lantern',
    label: 'Inspect the hanging lantern',
    mapLabel: 'Lantern islet',
    at: [40.3, 39.2],
    text: 'A hanging lantern for night crossings. Keep to the planks and the water keeps its distance.',
  },
  {
    map: 'amber-ridge',
    id: 'lookout-note',
    sprite: 'prop-sunstone-lookout',
    label: 'Look from the Sunstone shelf',
    mapLabel: 'Sunstone lookout',
    at: [10.8, 11.6],
    text: 'A lookout carved into the cliff. Voltkit love the bright trail; Pebblit prefer to bask where the grass is warm.',
  },
];

test('all ten hidden landmark objects match their discovery and keep authored identity and clues', () => {
  for (const expected of replacements) {
    const location = map(expected.map);
    const landmark = location.landmarks.find(item => item.id === expected.id);
    assert.ok(landmark, `${expected.map}:${expected.id} remains stable`);
    assert.equal(landmark.secret, true, `${expected.id} remains hidden until discovery`);
    assert.equal(landmark.kind, 'sign', `${expected.id} keeps its existing interaction behavior`);
    assert.equal(landmark.sprite, expected.sprite, `${expected.id} uses the fitting object`);
    assert.equal(assets[spriteId(expected.sprite)].kind, 'prop');
    assert.equal(landmark.label, expected.label, `${expected.id} names the object action`);
    assert.equal(landmark.mapLabel, expected.mapLabel, `${expected.id} keeps its stable map label`);
    assert.deepEqual(landmark.at, expected.at, `${expected.id} keeps its coordinates`);
    assert.equal(landmark.text, expected.text, `${expected.id} keeps its clue text`);
  }
});

test('the hidden Blueglass cache remains the existing wooden chest', () => {
  const cache = map('frostveil-pass').landmarks.find(item => item.id === 'cache');
  assert.ok(cache);
  assert.equal(cache.secret, true);
  assert.equal(cache.kind, 'chest');
  assert.equal(cache.sprite, 'chest-wooden');
});

test('environmental exploration cues remain authored independently from landmark labels', () => {
  const expected = {
    meadow: {'quiet-grove': ['A narrow track slips under the oldest trees. It is quiet here, and it rejoins the south trail.', 'tree-oak', 2]},
    'amber-ridge': {'echo-hollow': ['Your footsteps echo from a hollow in the rock. Nothing stirs here.', 'boulder-mossy', 5]},
    'orchard-ruins': {
      'hidden-cut-through': ['A quiet cut-through slips under the oldest apple trees and rejoins the winding trail.', 'tree-oak', 5],
      'hidden-lower-row': ['Another quiet row slips between the trees, down to the old ruins.', 'tree-oak', 4],
    },
    'reedfen-wetlands': {'reed-whistle': ['A reed whistle trills somewhere in the bed. The hush here is safe.', 'cattail-clump', 5]},
    'stone-basin': {'chasm-edge': ['The chasm falls away below the rail. The path keeps you safe.', 'rock-spire-red', 4]},
    'stilt-isles': {'high-boardwalk': ["The high boardwalk hums underfoot. Reedfen's shrine is a short walk beyond.", null, 2.5]},
  };
  for (const [mapId, triggers] of Object.entries(expected)) {
    const location = map(mapId);
    for (const [id, [text, prop, radius]] of Object.entries(triggers)) {
      const trigger = location.triggers.find(item => item.id === id);
      assert.ok(trigger, `${mapId} keeps environmental trigger ${id}`);
      assert.equal(trigger.do[0].text, text, `${id} retains its authored environmental message`);
      assert.equal(trigger.once, id === 'hidden-cut-through' ? undefined : true, `${id} keeps its authored repeat rule`);
      assert.equal(trigger.on, 'enter', `${id} remains discoverable by exploration`);
      assert.deepEqual(
        trigger.do.map(action => action.type),
        ['toast'],
        `${id} remains an atmosphere message, not a hidden route reveal`,
      );
      if (prop) {
        const nearby = location.props.flatMap(group =>
          group.at.map(at => ({sprite: group.sprite, at, distance: Math.hypot(at[0] - trigger.at[0], at[1] - trigger.at[1])})),
        );
        assert.ok(
          nearby.some(item => item.sprite === prop && item.distance <= radius),
          `${id} remains supported by nearby ${prop} art`,
        );
      } else {
        const hasBoardwalkPath = location.terrain.some((row, y) =>
          [...row].some((terrain, x) => terrain === 'p' && Math.hypot(x - trigger.at[0], y - trigger.at[1]) <= radius),
        );
        assert.ok(hasBoardwalkPath, `${id} remains beside the raised path art`);
      }
    }
  }
});

test('phone-scale visual review evidence is pinned to every landmark source, runtime sprite and capture', () => {
  const review = JSON.parse(readFileSync(new URL('../art/assets/landmark-visual-review.json', import.meta.url), 'utf8'));
  const sources = JSON.parse(readFileSync(new URL('../art/assets/source/landmarks/manifest.json', import.meta.url), 'utf8'));
  assert.equal(review.issue, 195);
  assert.equal(review.technicalDecision, 'accept');
  assert.equal(review.ownerTaste, 'pending', 'owner approval remains separate from the technical readability pass');
  assert.equal(review.entries.length, replacements.length);
  for (const expected of replacements) {
    const entry = review.entries.find(item => item.map === expected.map && item.landmarkId === expected.id);
    assert.ok(entry, `${expected.map}:${expected.id} has visual review evidence`);
    assert.equal(entry.sprite, expected.sprite);
    assert.equal(entry.decision, 'accept');
    const source = sources.assets.find(item => item.name === expected.sprite);
    assert.equal(entry.sourceSha256, source.sourceSha256);
    assert.equal(entry.runtimeSha256, sha256(readFileSync(new URL(`../dist/assets/props/${expected.sprite}.png`, import.meta.url))));
    const capture = readFileSync(new URL(`../${entry.capture}`, import.meta.url));
    assert.equal(entry.captureSha256, sha256(capture), `${entry.capture} stays pinned to reviewed pixels`);
    assert.equal(capture.subarray(1, 4).toString(), 'PNG');
    assert.equal(capture.readUInt32BE(16), 358, 'capture retains the phone viewport canvas width');
    assert.equal(capture.readUInt32BE(20), 340, 'capture retains the phone viewport canvas height');
  }
});
