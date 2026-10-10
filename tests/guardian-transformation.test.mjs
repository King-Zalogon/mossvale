import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const controller = readFileSync(new URL('../dist/src/controller.js', import.meta.url), 'utf8');
const battleView = readFileSync(new URL('../dist/src/ui/battle-view.js', import.meta.url), 'utf8');

test('guardian battles mark a transient intro and lock actions until the guardian form is revealed', () => {
  assert.match(controller, /Object\.defineProperty\(game\.battle, 'guardianIntro'/);
  assert.match(controller, /enumerable: false/);
  assert.match(battleView, /guardianTransforming/);
  assert.match(battleView, /b\.busy \|\| guardianTransforming/);
  assert.match(battleView, /guardianTransforming \? undefined : guardianSprite/);
});
