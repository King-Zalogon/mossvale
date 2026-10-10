import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const controller = readFileSync(new URL('../dist/src/controller.js', import.meta.url), 'utf8');
const menus = readFileSync(new URL('../dist/src/ui/menus.js', import.meta.url), 'utf8');

test('shrine victory results use the configured guardian combat atlas in faint pose', () => {
  assert.match(controller, /combatSprite:\s*b\.boss \? guardianCombatSprite\(game\.world\.map, b\)/);
  assert.match(controller, /combatState:\s*'faint'/);
  assert.match(menus, /drawCreatureAnimated\(\$\('#result-art'\), id, 110, combatState/);
  assert.match(menus, /combatSprite !== undefined/);
});
