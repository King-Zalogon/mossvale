import test from 'node:test';
import assert from 'node:assert/strict';
import {nextHint, hintState, validateHints, hintKey} from '../dist/src/domain/hints.js';
import {newSave, mapsById, codec, content, objCtx, rawMaps} from './helpers.mjs';
import {markSceneRun, validateSceneGraph} from '../dist/src/domain/scenes.js';
const map = mapsById['orchard-ruins'],
  context = {...objCtx, species: content.species};
const seen = (save, id) => markSceneRun(save, map.id, id);
test('every starter gets spoiler-safe optional help at two investigation states and none at start/completion', () => {
  for (let active = 0; active < content.species.length; active++) {
    let save = newSave();
    save.active = active;
    save.party = [active];
    save.caught = [active];
    save.team[active] = {hp: 20, xp: 0};
    assert.equal(nextHint(map, save, context), null);
    seen(save, 'mara-water-loss');
    let hint = nextHint(map, save, context);
    assert.equal(hint.id, 'old-water');
    assert.equal(hint.level, 0);
    assert.doesNotMatch(hint.text, /family|den|hollow|Bramblebuck/);
    seen(save, `hint-${hint.id}-${hint.level}`);
    hint = nextHint(map, save, context);
    assert.equal(hint.level, 1);
    save = codec.normalize(JSON.parse(codec.serialize(save)));
    assert.equal(nextHint(map, save, context).level, 1);
    seen(save, 'press-repair-record');
    hint = nextHint(map, save, context);
    assert.equal(hint.id, 'returning-tracks');
    assert.doesNotMatch(hint.text, /family|Bramblebuck/);
    seen(save, 'den-family-seen');
    assert.equal(nextHint(map, save, context).id, 'two-priorities');
    seen(save, 'outcome-water-first');
    assert.equal(nextHint(map, save, context), null);
    assert.ok(hintState(map.hints[0], map.id, save, context).resolved);
  }
});
test('required ability uses the actually active owned healthy companion, not reserve or past ownership', () => {
  const hint = {
    id: 'wet-ground',
    when: {met: true},
    resolved: {event: 'orchard-ruins/den-family-seen'},
    requires: {ability: 'cross-shallow-water', habitat: 'wetland'},
    disclosure: 'lead',
    levels: ['Follow the already discovered wet ground.'],
  };
  const sample = {id: map.id, hints: [hint]},
    save = newSave();
  save.met = true;
  const brooklet = content.species.findIndex(s => s.id === 'brooklet');
  save.active = brooklet;
  save.caught = [brooklet];
  save.party = [brooklet];
  save.team[brooklet] = {hp: 20, xp: 0};
  assert.ok(nextHint(sample, save, context));
  save.active = 0;
  assert.equal(nextHint(sample, save, context), null);
  save.active = brooklet;
  save.team[brooklet].hp = 0;
  assert.equal(nextHint(sample, save, context), null);
  save.team[brooklet].hp = 20;
  save.party = [];
  assert.equal(nextHint(sample, save, context), null);
  assert.deepEqual(validateHints([hint], {mapIds: new Set([map.id]), species: content.species}), []);
  const bad = structuredClone(hint);
  bad.requires.ability = 'invented-ability';
  assert.match(validateHints([bad], {mapIds: new Set([map.id]), species: content.species}).join('\n'), /registered ability/);
});
test('older/imported saves preserve canonical heard event identities and missing history does not reveal facts', () => {
  const save = newSave();
  save.events = [];
  assert.equal(nextHint(map, save, context), null);
  const old = JSON.parse(codec.serialize(save));
  old.version = 4;
  delete old.events;
  const migrated = codec.normalize(old);
  assert.equal(nextHint(map, migrated, context), null);
  seen(save, 'mara-water-loss');
  seen(save, 'hint-old-water-0');
  const imported = codec.normalize(JSON.parse(codec.serialize(save)));
  assert.ok(imported.events.includes(hintKey(map.id, 'old-water', 0)));
  assert.equal(nextHint(map, imported, context).level, 1);
  const raw = rawMaps();
  raw.find(m => m.id === map.id).hints[0].when = {event: 'orchard-ruins/phantom-clue'};
  assert.match(validateSceneGraph(raw).join('\n'), /unknown evidence/);
});

test('invalid capability shapes and collisions with real scene IDs are refused', () => {
  const hint = structuredClone(map.hints[0]);
  hint.requires = null;
  assert.match(validateHints([hint], {mapIds: new Set([map.id]), species: content.species}).join('\n'), /capability object/);
  const raw = rawMaps();
  raw.find(m => m.id === map.id).triggers.push({events: [{id: 'hint-old-water-0'}]});
  assert.match(validateSceneGraph(raw).join('\n'), /collides/);
});

test('sparse imported heard history keeps the clearest known level and identifies repeats', () => {
  const save = newSave();
  seen(save, 'mara-water-loss');
  seen(save, 'hint-old-water-1');
  const hint = nextHint(map, save, context);
  assert.equal(hint.level, 1);
  assert.equal(hint.repeat, true);
});
