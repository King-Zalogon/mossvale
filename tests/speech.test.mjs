// Speech bubbles (#84), the pure parts: pagination, speakers, placement inside the viewport, and data validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {conversationSteps, PAGE_CHARS, paginate, placeBubble, speakerProblem} from '../dist/src/domain/speech.js';
import {applySceneActions, validateSceneEvent} from '../dist/src/domain/scenes.js';
import {pickLineEntry} from '../dist/src/domain/objectives.js';
import {validateMaps} from '../dist/src/domain/mapdata.js';
import {assets} from '../dist/src/data/assets.js';
import {species} from '../dist/src/data/species.js';
import {newSave, objCtx, rawMaps} from './helpers.mjs';

const names = new Set(assets.map(a => a.name));
const speciesIds = new Set(species.map(s => s.id));

test('short lines stay whole; long lines split at sentence ends into readable pages', () => {
  assert.deepEqual(paginate('Hello there.'), ['Hello there.']);
  assert.deepEqual(paginate('   '), []);
  const long =
    'The shrines have been quiet for years. Perhaps a new friend from the tall grass could help wake them. Take the eastern trail whenever you are ready, and mind the water.';
  const pages = paginate(long);
  assert.ok(pages.length >= 2);
  for (const page of pages) assert.ok(page.length <= PAGE_CHARS, page);
  assert.equal(pages.join(' '), long, 'nothing is lost or reordered');
  assert.ok(pages[0].endsWith('.'), 'pages end at a sentence');
  const word = 'x'.repeat(400);
  assert.ok(
    paginate(word).every(page => page.length <= PAGE_CHARS),
    'an unbroken run still splits',
  );
  assert.equal(paginate(word).join(''), word);
});

test('conversation steps keep each speaker, fall back to the character spoken to, and paginate per line', () => {
  const steps = conversationSteps([{speaker: 'villager', text: 'Hi.'}, {text: 'Welcome.'}, {speaker: 'player', text: 'a '.repeat(200)}], 'ranger');
  assert.deepEqual(steps.slice(0, 2), [
    {speaker: 'villager', text: 'Hi.'},
    {speaker: 'ranger', text: 'Welcome.'},
  ]);
  assert.ok(steps.filter(s => s.speaker === 'player').length > 1);
  assert.deepEqual(conversationSteps([{text: 'Only the narrator.'}]), [{speaker: 'narrator', text: 'Only the narrator.'}]);
  assert.deepEqual(conversationSteps(undefined), []);
});

test('speakers are keywords or landmark ids of the same map', () => {
  const ids = new Set(['ranger', 'sign']);
  for (const ok of ['player', 'companion', 'narrator', 'ranger']) assert.equal(speakerProblem(ok, ids), null);
  assert.match(speakerProblem('ghost', ids), /unknown speaker "ghost"/);
  assert.match(speakerProblem('', ids), /must be text/);
  assert.match(speakerProblem(7, ids), /must be text/);
});

const bounds = {w: 700, h: 480};
const size = {w: 300, h: 110};
test('a bubble sits above its speaker with the tail pointing at them', () => {
  const spot = placeBubble({anchor: {x: 350, headY: 300, feetY: 360}, size, bounds});
  assert.equal(spot.side, 'above');
  assert.ok(spot.top + size.h <= 300, 'bottom edge is above the speaker');
  assert.equal(spot.left + spot.tail, 350, 'the tail is under the speaker');
});

test('near the edges the bubble stays inside the viewport and the tail keeps pointing at the speaker', () => {
  const left = placeBubble({anchor: {x: 20, headY: 300, feetY: 360}, size, bounds});
  assert.equal(left.left, 8);
  assert.equal(left.tail, 18, 'the tail is held inside the bubble, at its nearest corner');
  const right = placeBubble({anchor: {x: 690, headY: 300, feetY: 360}, size, bounds});
  assert.equal(right.left + size.w, bounds.w - 8);
  assert.equal(right.tail, size.w - 18);
  const offscreen = placeBubble({anchor: {x: -500, headY: 300, feetY: 360}, size, bounds});
  assert.equal(offscreen.left, 8);
  assert.equal(offscreen.tail, 18);
});

test('with no room above, the bubble goes below the speaker; with no room at all it stays on screen', () => {
  const below = placeBubble({anchor: {x: 350, headY: 40, feetY: 100}, size, bounds});
  assert.equal(below.side, 'below');
  assert.ok(below.top >= 100, 'under the feet');
  const cramped = placeBubble({anchor: {x: 350, headY: 60, feetY: 400}, size: {w: 300, h: 300}, bounds: {w: 700, h: 480}});
  assert.ok(cramped.top >= 8 && cramped.top + 300 <= 480 - 8);
});

test('a bubble wider than the viewport pins to the left margin; a narrator has no tail', () => {
  const tiny = placeBubble({anchor: {x: 100, headY: 200, feetY: 260}, size: {w: 320, h: 100}, bounds: {w: 300, h: 400}});
  assert.equal(tiny.left, 8);
  const narrator = placeBubble({anchor: null, size, bounds});
  assert.equal(narrator.side, 'none');
  assert.equal(narrator.left, (bounds.w - size.w) / 2);
});

test('lines and scene dialogue can name a speaker; unknown speakers are rejected with a field path', () => {
  const lineEntry = pickLineEntry([{text: 'Hello', speaker: 'player'}], newSave(), objCtx);
  assert.deepEqual(lineEntry, {text: 'Hello', speaker: 'player'});
  assert.deepEqual(pickLineEntry([{text: 'Plain'}], newSave(), objCtx), {text: 'Plain'});
  const raw = structuredClone(rawMaps());
  const ranger = raw[0].landmarks.find(l => l.kind === 'ranger');
  ranger.lines = [{text: 'Hi', speaker: 'ghost'}];
  raw[0].triggers = [
    {
      id: 'talk',
      at: [12, 12],
      on: 'interact',
      events: [{id: 'talk', repeatable: true, actions: [{type: 'dialogue', speaker: 'nobody', text: 'x'}]}],
    },
  ];
  const errors = validateMaps(raw, {spriteNames: names, speciesIds}).join('\n');
  assert.match(errors, /lines\[0\]\.speaker: unknown speaker "ghost"/);
  assert.match(errors, /actions\[0\]\.speaker: unknown speaker "nobody"/);
  raw[0].landmarks.find(l => l.kind === 'ranger').lines = [{text: 'Hi', speaker: 'player'}];
  raw[0].triggers[0].events[0].actions[0].speaker = ranger.id;
  assert.deepEqual(validateMaps(raw, {spriteNames: names, speciesIds}), []);
});

test('a scene with only events needs no actions; dialogue keeps order and speakers', () => {
  const raw = structuredClone(rawMaps());
  raw[0].triggers = [{id: 'chat', at: [12, 12], on: 'interact', events: [{id: 'chat', repeatable: true, actions: [{type: 'dialogue', text: 'x'}]}]}];
  assert.deepEqual(validateMaps(raw, {spriteNames: names, speciesIds}), []);
  const event = {
    id: 'e',
    repeatable: true,
    actions: [
      {type: 'dialogue', speaker: 'a', text: 'one'},
      {type: 'dialogue', text: 'two'},
    ],
  };
  const result = applySceneActions(newSave(), event, {setFlag() {}});
  assert.deepEqual(result.speech, [{speaker: 'a', text: 'one'}, {text: 'two'}]);
  assert.deepEqual(result.dialogue, ['one', 'two']);
  assert.deepEqual(validateSceneEvent(event, {speciesIds, mapId: 'm', mapIds: new Set(['m']), landmarkIds: new Set(['a']), where: 'e'}), []);
  assert.match(validateSceneEvent(event, {speciesIds, mapId: 'm', mapIds: new Set(['m']), where: 'e'}).join(), /unknown speaker "a"/);
});

test('engine code never branches on a story character name', () => {
  const walk = dir => readdirSync(dir).flatMap(f => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
  const source = walk(new URL('../dist/src/', import.meta.url).pathname).filter(f => f.endsWith('.js'));
  for (const file of source) {
    const text = readFileSync(file, 'utf8');
    assert.equal(/(?:[=!]==?|case|includes\()\s*['"`](?:Iris|Wren|Pim)\b/.test(text), false, `${file} branches on a story character`);
  }
});
