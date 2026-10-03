import test from 'node:test';
import assert from 'node:assert/strict';
import {KEYS} from '../dist/src/save.js';
import {species} from '../dist/src/data/species.js';
import {hasProgress, readArchive, restoreArchive, startOver, summarize} from '../dist/src/services/profile.js';
import {DEFAULTS, loadSettings, normalizeSettings, saveSettings, SETTINGS_KEY, ZOOM_MAX, ZOOM_MIN} from '../dist/src/services/settings.js';
import {codec, newSave} from './helpers.mjs';

const store = (init = {}) => {
  const m = new Map(Object.entries(init));
  return {m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k)};
};
const played = () => {
  const save = newSave();
  save.coins = 40;
  save.wins = 3;
  save.badges = [0];
  save.caught.push(1);
  save.team[1] = {xp: 0, hp: 40};
  save.playTime = 600;
  return save;
};

test('a fresh save has no progress; playing creates it', () => {
  assert.equal(hasProgress(newSave()), false);
  assert.equal(hasProgress(played()), true);
  assert.match(summarize(played(), species), /2 of 8 friends · 1 seal · 10 min played/);
});

test('starting over archives the adventure first and resets the save and checkpoint', () => {
  const save = played();
  const s = store({[KEYS.v3]: codec.serialize(save), [KEYS.backup]: codec.serialize(save)});
  const result = startOver({storage: s, codec, save});
  assert.equal(result.ok, true);
  const archived = readArchive(s, codec);
  assert.deepEqual([archived.save.badges, archived.save.caught], [[0], [0, 1]]);
  assert.equal(codec.load(s).save.caught.length, 1); // the current save is new
  assert.equal(codec.load(s).status, 'ok');
  assert.equal(JSON.parse(s.m.get(KEYS.backup)).caught.length, 1); // corruption recovery cannot resurrect it silently
});

test('starting over from an empty save does not overwrite a real backup', () => {
  const real = played();
  const s = store({[KEYS.archive]: JSON.stringify({at: 'x', raw: codec.serialize(real)})});
  startOver({storage: s, codec, save: newSave()});
  assert.equal(readArchive(s, codec).save.badges.length, 1);
});

test('replacing an older backup is reported so the menu can warn about it', () => {
  const s = store({[KEYS.archive]: JSON.stringify({at: 'x', raw: codec.serialize(newSave())})});
  assert.equal(startOver({storage: s, codec, save: played()}).replacedArchive, true);
});

test('restore swaps the archive and the current adventure so nothing is lost', () => {
  const old = played();
  const current = newSave();
  current.coins = 5;
  current.met = true;
  const s = store({[KEYS.v3]: codec.serialize(current), [KEYS.archive]: JSON.stringify({at: 'x', raw: codec.serialize(old)})});
  assert.equal(restoreArchive({storage: s, codec, save: current}).ok, true);
  assert.equal(codec.load(s).save.badges.length, 1);
  assert.equal(readArchive(s, codec).save.coins, 5);
});

test('a failed write changes nothing and is reported', () => {
  const save = played();
  const original = codec.serialize(save);
  const s = store({[KEYS.v3]: original});
  s.setItem = () => {
    throw new Error('quota');
  };
  assert.equal(startOver({storage: s, codec, save}).ok, false);
  assert.equal(s.m.get(KEYS.v3), original);
  assert.equal(restoreArchive({storage: s, codec, save}).ok, false);
});

test('a corrupt archive is ignored, not trusted', () => {
  assert.equal(readArchive(store({[KEYS.archive]: '{oops'}), codec), null);
  assert.equal(readArchive(store({[KEYS.archive]: JSON.stringify({at: 'x', raw: '[]'})}), codec), null);
  assert.equal(readArchive(store(), codec), null);
});

test('settings validate, clamp and fall back', () => {
  assert.deepEqual(normalizeSettings(undefined), DEFAULTS);
  assert.deepEqual(normalizeSettings({sound: 'yes', motion: 'wild', zoom: 'big', run: 1, text: 'huge'}), DEFAULTS);
  assert.equal(normalizeSettings({zoom: 99}).zoom, ZOOM_MAX);
  assert.equal(normalizeSettings({zoom: -3}).zoom, ZOOM_MIN);
  assert.equal(normalizeSettings({zoom: NaN}).zoom, null);
});

test('settings persist separately from the save and survive start over', () => {
  const s = store({[KEYS.v3]: codec.serialize(played())});
  saveSettings(s, {sound: true, motion: 'reduced', zoom: 1.8, run: true, text: 'large'});
  startOver({storage: s, codec, save: played()});
  assert.deepEqual(loadSettings(s), {sound: true, volume: 'medium', ambience: true, motion: 'reduced', zoom: 1.8, run: true, text: 'large'});
  assert.equal(s.m.has(SETTINGS_KEY), true);
  assert.deepEqual(loadSettings(store({[SETTINGS_KEY]: '{broken'})), DEFAULTS);
  assert.deepEqual(
    loadSettings({
      getItem() {
        throw new Error('denied');
      },
    }),
    DEFAULTS,
  );
});
