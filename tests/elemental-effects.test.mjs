import test from 'node:test';
import assert from 'node:assert/strict';
import {elementalBeats} from '../dist/src/ui/elemental-beats.js';
import {effectPose} from '../dist/src/render/elemental-effects.js';
import {assets} from '../dist/src/data/assets.js';
import {species} from '../dist/src/data/species.js';

test('every canonical element has six authored poses without changing creature atlas contracts', () => {
  const atlas = assets.find(asset => asset.name === 'effect-elemental-materials');
  assert.equal(atlas.required, false);
  assert.deepEqual(new Set(atlas.frames.rowOrder), new Set(species.map(entry => entry.type)));
  assert.equal(atlas.frames.columns, 6);
  assert.equal(atlas.frames.effectPivots.length, 12);
  for (const asset of assets.filter(asset => asset.name.startsWith('creature-') && asset.name.endsWith('-combat')))
    assert.deepEqual(asset.frames.rowOrder, ['idle', 'attack', 'hit', 'faint', 'capture']);
});

test('both sides keep pre-hit HP, damage feedback and audio until contact, with unchanged total turn durations', () => {
  const previous = {active: 0, mine: 40, enemy: 60, focus: 2};
  for (const side of ['ally', 'enemy']) {
    const event = {
      type: side === 'ally' ? 'strike' : 'enemy',
      kind: 'element',
      element: true,
      damage: 10,
      eff: 1,
      after: {...previous, mine: side === 'enemy' ? 30 : 40, enemy: side === 'ally' ? 50 : 60, focus: 1},
    };
    const input = {event, type: 'Fire', side, previous, message: '10 damage', introduction: 'Ember spark…'};
    const frames = elementalBeats(input);
    assert.deepEqual(
      frames.map(frame => frame.fx.elemental.stage),
      ['prepare', 'travel', 'impact'],
    );
    assert.equal(
      frames.reduce((sum, frame) => sum + frame.wait, 0),
      side === 'ally' ? 650 : 700,
    );
    for (const frame of frames.slice(0, 2)) {
      assert.equal(frame.after.mine, previous.mine);
      assert.equal(frame.after.enemy, previous.enemy);
      assert.equal(frame.after.focus, 1);
      assert.equal(frame.sfx, undefined);
      assert.equal(frame.fx.pops.length, 0);
      assert.equal(frame.fx.shake, 0);
      assert.equal(frame.message, input.introduction);
    }
    assert.deepEqual(frames[2].after, event.after);
    assert.equal(frames[2].fx.pops[0].side, side === 'ally' ? 'enemy' : 'ally');
    const calm = elementalBeats({...input, calm: true});
    assert.equal(calm.length, 1);
    assert.equal(calm[0].wait, 250);
    assert.equal(calm[0].fx.elemental.stage, 'impact');
    assert.deepEqual(previous, {active: 0, mine: 40, enemy: 60, focus: 2}, 'presentation does not mutate snapshots');
  }
});

test('projectiles cross from the actual source to actual target and mirror for enemies', () => {
  for (const flip of [false, true]) {
    const source = {x: flip ? 300 : 50, y: 80};
    const target = {x: flip ? 50 : 300, y: 80};
    const pose = progress => effectPose({source, target, stage: 'travel', progress});
    assert.equal(pose(-1).x, source.x, 'queued RAF timestamps are clamped');
    assert.equal(pose(0).x, source.x);
    assert.equal(pose(1).x, target.x);
    assert.equal(pose(2).x, target.x);
    assert.equal(pose(0.5).flip, flip);
    assert.equal(pose(0.5).x, 175);
    assert.ok(pose(0.5).y < 80);
    const bolt = effectPose({source, target, stage: 'travel', progress: 0.5, beam: true});
    assert.equal(bolt.span, 250);
    assert.equal(bolt.x, 175);
    assert.equal(bolt.y, 80);
    const settled = effectPose({source, target, stage: 'impact', progress: 1});
    assert.equal(settled.column, 5);
    assert.equal(settled.alpha, 0);
  }
});
