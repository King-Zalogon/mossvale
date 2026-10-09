import test from 'node:test';
import assert from 'node:assert/strict';
import {burstMarkup, fxForEvent, hpPercent, popMarkup} from '../dist/src/ui/battle-fx.js';

test('hp percent is bounded and never hides a living creature', () => {
  assert.equal(hpPercent(0, 40), 0);
  assert.equal(hpPercent(40, 40), 100);
  assert.equal(hpPercent(1, 400), 3);
  assert.equal(hpPercent(-5, 40), 0);
  assert.equal(hpPercent(10, 0), 0);
});

test('player strikes pop damage on the foe, tinted by effectiveness', () => {
  assert.deepEqual(fxForEvent({type: 'strike', damage: 9, eff: 1, kind: 'quick'}), {pops: [{side: 'enemy', text: '-9', tone: 'hit'}], shake: 1, burst: null});
  const strong = fxForEvent({type: 'strike', damage: 20, eff: 1.5, kind: 'quick'});
  assert.equal(strong.pops[0].tone, 'super');
  assert.equal(strong.shake, 2);
  assert.equal(fxForEvent({type: 'strike', damage: 4, eff: 0.5, kind: 'quick'}).pops[0].tone, 'weak');
  assert.equal(fxForEvent({type: 'strike', damage: 12, eff: 1, kind: 'element'}).burst, 'enemy');
});

test('enemy blows pop on the ally; heavy blows shake harder; ripostes pop on the foe', () => {
  const light = fxForEvent({type: 'enemy', action: 'quick', damage: 5});
  assert.deepEqual(light.pops, [{side: 'ally', text: '-5', tone: 'hit'}]);
  assert.equal(light.shake, 1);
  const heavy = fxForEvent({type: 'enemy', action: 'heavy', damage: 18, counter: 6});
  assert.equal(heavy.shake, 2);
  assert.deepEqual(
    heavy.pops.map(p => [p.side, p.text]),
    [
      ['ally', '-18'],
      ['enemy', '-6'],
    ],
  );
});

test('healing shows a plus number and non-damage events show nothing', () => {
  assert.deepEqual(fxForEvent({type: 'potion', healed: 24}).pops, [{side: 'ally', text: '+24', tone: 'heal'}]);
  assert.deepEqual(fxForEvent({type: 'enemy', action: 'charge', recovered: 7}).pops, [{side: 'enemy', text: '+7', tone: 'heal'}]);
  for (const e of [{type: 'guard'}, {type: 'enemy', action: 'brace', damage: 0}, {type: 'throw'}, {type: 'strike', damage: 0}])
    assert.deepEqual(fxForEvent(e), {pops: [], shake: 0, burst: null});
});

test('markup only carries numbers for its own side and is hidden from assistive tech', () => {
  const fx = fxForEvent({type: 'enemy', action: 'heavy', damage: 18, counter: 6});
  assert.match(popMarkup(fx, 'ally'), /tone-heavy[^>]*aria-hidden="true">-18</);
  assert.doesNotMatch(popMarkup(fx, 'ally'), /-6/);
  assert.equal(popMarkup(null, 'ally'), '');
  assert.equal((burstMarkup('#ff0000').match(/<i /g) ?? []).length, 8);
});
