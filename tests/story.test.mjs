import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAdventure} from '../dist/src/domain/adventure.js';
import {endingDue, HINT_EVENTS, markSeen, MAX_HINTS, pendingHint, validateStory} from '../dist/src/domain/story.js';
import {codec, content, newSave, objCtx, rawMaps, rawObjectives} from './helpers.mjs';
import {readFileSync} from 'node:fs';

const story = () => JSON.parse(readFileSync(new URL('../dist/maps/story.json', import.meta.url), 'utf8'));
const build = fn => {
  const s = story();
  fn?.(s);
  return buildAdventure(rawMaps(), content, rawObjectives(), s);
};
const has = (errors, text) =>
  assert.ok(
    errors.some(e => e.includes(text)),
    `expected "${text}" in:\n${errors.join('\n')}`,
  );

test('the shipped story validates', () => assert.deepEqual(build().errors, []));

test('the ending needs every seal, and flags the maps cannot award are rejected', () => {
  const s = story();
  const save = newSave();
  assert.equal(endingDue(s, save, objCtx), null);
  save.badges = [0, 1];
  assert.equal(endingDue(s, save, objCtx), null);
  save.badges = [0, 1, 2];
  assert.equal(endingDue(s, save, objCtx).title, s.ending.title);
  save.completed = true;
  assert.equal(endingDue(s, save, objCtx), null); // once
  has(build(x => (x.ending.when = {all: [{flag: 'swamp.seal'}]})).errors, 'swamp');
  has(build(x => delete x.ending.when).errors, 'ending.when');
});

test('story data errors are specific', () => {
  has(build(x => (x.premise.paragraphs = [])).errors, 'premise.paragraphs');
  has(build(x => delete x.ending.title).errors, 'ending.title');
  has(build(x => (x.hints[0].event = 'sneeze')).errors, 'hints[0].event');
  has(build(x => (x.hints[1].id = x.hints[0].id)).errors, 'hints[1].id');
  has(validateStory({format: 2}, {mapIds: new Set()}), 'format');
});

test('tips appear once each and cover capture, healing and switching', () => {
  const s = story();
  const save = newSave();
  assert.deepEqual([...new Set(s.hints.map(h => h.event))].sort(), [...HINT_EVENTS].sort());
  const first = pendingHint(s, 'first-battle', save);
  assert.match(first.text, /capture orb/);
  markSeen(save, first.id);
  assert.equal(pendingHint(s, 'first-battle', save), null);
  assert.match(pendingHint(s, 'low-health', save).text, /potion/);
  assert.match(pendingHint(s, 'can-switch', save).text, /switch/);
});

test('seen tips are bounded and unique', () => {
  const save = newSave();
  for (let i = 0; i < 100; i++) markSeen(save, `tip-${i}`);
  markSeen(save, 'tip-0');
  assert.equal(save.hints.length, MAX_HINTS);
  assert.equal(new Set(save.hints).size, MAX_HINTS);
});

test('tips and completion persist; junk is dropped', () => {
  const save = newSave();
  save.hints = ['premise', 'capture'];
  save.completed = true;
  const back = codec.normalize(JSON.parse(codec.serialize(save)), false);
  assert.deepEqual([back.hints, back.completed], [['premise', 'capture'], true]);
  const raw = JSON.parse(codec.serialize(save));
  const bad = codec.normalize({...raw, hints: ['ok', 'ok', 5, 'Bad Id', 'x'.repeat(40), null], completed: 'yes'}, false);
  assert.deepEqual([bad.hints, bad.completed], [['ok'], false]);
  assert.deepEqual(codec.normalize({...raw, hints: 'nope'}, false).hints, []);
});
