import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {mkdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {gameHandler} from '../scripts/local-integration.mjs';
import {codec, newSave, mapsById} from './helpers.mjs';
import {buildWorld, isWalkable} from '../dist/src/domain/world.js';
import {inputForWorldTarget} from './action-script.mjs';
let world = buildWorld(mapsById['orchard-ruins']);
const server = createServer(gameHandler(fileURLToPath(new URL('../', import.meta.url)))).listen(0);
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
const report = [];
// Collision-aware planning chooses ordinary movement targets; it never changes game state.
function path(start, target) {
  const key = (x, y) => `${x},${y}`,
    step = 0.5;
  const sx = Math.round(start.x / step),
    sy = Math.round(start.y / step);
  const queue = [[sx, sy]],
    parents = new Map([[key(sx, sy), null]]);
  let end;
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    if (Math.hypot(x * step - target[0], y * step - target[1]) < 0.55) {
      end = key(x, y);
      break;
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        ny = y + dy,
        k = key(nx, ny);
      if (parents.has(k) || !isWalkable(world, nx * step, ny * step)) continue;
      parents.set(k, key(x, y));
      queue.push([nx, ny]);
    }
  }
  assert.ok(end, `reachable ${target}`);
  const result = [];
  while (parents.get(end) !== null) {
    result.push(end.split(',').map(n => Number(n) * step));
    end = parents.get(end);
  }
  return result.reverse();
}
try {
  for (const touch of [false, true]) {
    world = buildWorld(mapsById['orchard-ruins']);
    const context = await browser.newContext({
      viewport: touch ? {width: 844, height: 390} : {width: 1280, height: 820},
      hasTouch: touch,
      reducedMotion: 'reduce',
    });
    const initial = newSave();
    initial.met = true;
    initial.badges = [0];
    initial.mapId = 'orchard-ruins';
    [initial.x, initial.y] = world.map.spawns.camp ? [world.map.spawns.camp.x, world.map.spawns.camp.y] : [3, 12];
    initial.visitedMaps.push('orchard-ruins');
    await context.addInitScript(raw => {
      if (!localStorage.getItem('mossvale-v3')) localStorage.setItem('mossvale-v3', raw);
      localStorage.setItem('mossvale-settings', '{"motion":"reduced"}');
    }, codec.serialize(initial));
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://localhost:${server.address().port}/?debug&seed=2`);
    await page.waitForSelector('#loading', {state: 'hidden'});
    if (touch) await page.locator('#game').tap();
    const state = () =>
      page.evaluate(() => {
        const {player, save} = window.mossvale.getState();
        return {player: {x: player.x, y: player.y}, save};
      });
    const finish = async () => {
      for (let i = 0; i < 15; i++) {
        const active = await page.locator('#speech-bubble').isVisible();
        if (!active) break;
        if (touch) await page.locator('#speech-next').tap();
        else await page.keyboard.press('e');
        await page.waitForTimeout(90);
      }
    };
    const started = Date.now();
    let distance = 0,
      observedDistance = 0,
      repeatedEdges = 0;
    const edges = new Set();
    const walk = async target => {
      console.log(touch ? 'touch' : 'keyboard', 'walk', target);
      let previous = (await state()).player;
      const route = path(previous, target);
      let from = [Math.round(previous.x * 2), Math.round(previous.y * 2)].join(',');
      for (const point of route) {
        const to = point.map(n => Math.round(n * 2)).join(',');
        const edge = [from, to].sort().join('|');
        if (edges.has(edge)) repeatedEdges++;
        edges.add(edge);
        from = to;
      }
      distance += route.length * 0.5;
      for (const [x, y] of route) {
        for (let n = 0; n < 60; n++) {
          const p = (await state()).player;
          observedDistance += Math.hypot(p.x - previous.x, p.y - previous.y);
          previous = p;
          if (Math.hypot(p.x - x, p.y - y) < 0.22) break;
          const input = inputForWorldTarget(p, {x, y});
          if (touch) {
            const b = await page.locator(`[data-dir="${input.sx},${input.sy}"]`).boundingBox();
            assert.ok(b);
            const session = await context.newCDPSession(page);
            await session.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: b.x + b.width / 2, y: b.y + b.height / 2}]});
            await page.waitForTimeout(35);
            await session.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
            await session.detach();
          } else {
            for (const k of input.keys) await page.keyboard.down(k);
            await page.waitForTimeout(35);
            for (const k of input.keys) await page.keyboard.up(k);
          }
          if (n === 59) assert.fail(`movement stuck ${x},${y} at ${JSON.stringify(p)}`);
        }
      }
    };
    const interact = async id => {
      if (touch) await page.locator('#touch-e').tap();
      else await page.keyboard.press('e');
      await page.waitForFunction(id => window.mossvale.getState().save.events.includes(`orchard-ruins/${id}`), id);
      await finish();
      await page.waitForTimeout(280);
    };
    await walk([7, 15]);
    await interact('mara-water-loss');
    const clue = touch ? 'press-repair-record' : 'sluice-old-mark';
    await walk(touch ? [30, 44] : [56, 27]);
    await interact(clue);
    if (touch) {
      await walk([33, 47]); // Leave the one-time trigger before inspecting the press again.
      await walk([30, 44]);
      await page.locator('#touch-e').tap();
      await page.waitForSelector('#speech-bubble');
      assert.match(
        await page.locator('#speech-bubble').innerText(),
        /water fell first.*follow the damp marks northeast.*low hollow among the roots/is,
        'the inspected press repeats its clue and gives a concrete next destination',
      );
      await finish();
    }
    const capture = async label => {
      if (process.env.ORCHARD_REVIEW) {
        mkdirSync('docs/scene-quality/265', {recursive: true});
        await page.screenshot({path: `docs/scene-quality/265/${touch ? 'phone' : 'desktop'}-${label}.png`});
      }
    };
    await capture('evidence');
    await page.reload();
    await page.waitForSelector('#loading', {state: 'hidden'});
    assert.ok((await state()).save.events.includes(`orchard-ruins/${clue}`));
    if (touch) await page.locator('#game').tap();
    await walk([42, 36]);
    await interact('den-family-seen');
    await capture('hollow');
    const coins = (await state()).save.coins;
    await walk(touch ? [44, 34] : [49, 41]);
    assert.match(
      await page.evaluate(() => window.mossvale.nearest().label),
      touch ? /Guide the family/ : /Open the water bypass/,
      'choice intent is explicit before pressing Interact',
    );
    let expected = coins + 10;
    if (touch) {
      // Family-first is a repeatable, non-capture rescue: survive two turns, then the objective pays once when the battle ends.
      await page.locator('#touch-e').tap();
      await page.waitForFunction(() => window.mossvale.getState().battle?.objective?.id === 'orchard-family');
      const complete = page.locator('.battle-actions button', {hasText: 'Complete objective'});
      const guard = page.locator('.battle-actions button', {hasText: 'Guard'});
      for (let turn = 0; turn < 12 && (await page.evaluate(() => !!window.mossvale.getState().battle)); turn++) {
        await page.waitForFunction(() => !window.mossvale.getState().battle?.busy);
        // Guarding keeps the adult busy without ending the fight; the explicit Complete objective button commits the reward.
        await ((await complete.isEnabled()) ? complete : guard).tap();
        await page.waitForTimeout(900);
      }
      await page.waitForSelector('#result-continue');
      await page.locator('#result-continue').tap();
      await page.waitForFunction(() => !window.mossvale.getState().battle && !window.mossvale.getState().modalMode);
      expected = (await state()).save.coins;
      assert.ok(expected >= coins + 10, 'finishing the rescue pays its reward');
    } else await interact('outcome-water-first');
    assert.equal((await state()).save.coins, expected);
    await page.reload();
    await page.waitForSelector('#loading', {state: 'hidden'});
    assert.equal((await state()).save.coins, expected);
    if (touch) await page.locator('#game').tap();
    await walk(touch ? [47, 34] : [52, 41]); // Leave the resolved interaction radius before returning.
    await walk(touch ? [44, 34] : [49, 41]);
    if (touch) await page.locator('#touch-e').tap();
    else await page.keyboard.press('e');
    await finish();
    const savedStatePrompt = await page.evaluate(() => window.mossvale.nearest().label);
    assert.match(
      savedStatePrompt,
      touch ? /family is safe in the dry hollow/i : /water flows; family safe above/i,
      'the revisited map object exposes the persisted outcome after re-entry',
    );
    await capture(touch ? 'family-first' : 'water-first');
    assert.equal((await state()).save.coins, expected, 're-entering the resolved interaction after reload cannot duplicate its reward');
    if (touch) assert.ok((await state()).save.events.includes('orchard-ruins/outcome-family-first'), 're-entry records the saved family-first resolution');
    assert.equal(new Set((await state()).save.events).size, (await state()).save.events.length);

    await page.evaluate(() => window.mossvale.travel('orchard-ruins'));
    await page.waitForFunction(() => window.mossvale.getState().save.mapId === 'orchard-ruins');
    world = buildWorld(mapsById['orchard-ruins']);
    if (touch) await page.locator('#game').tap();
    await walk([5.2, 14]);
    assert.match(await page.evaluate(() => window.mossvale.nearest().label), /Talk to Orchard Keeper Mara/);
    if (touch) await page.locator('#touch-e').tap();
    else await page.keyboard.press('e');
    await page.waitForSelector('#speech-bubble:not([hidden])');
    const maraMemory = await page.locator('#speech-bubble').innerText();
    assert.match(maraMemory, touch ? /young are safe above the waterline/i : /water is reaching the lower row again/i);
    const maraReaction = await page.evaluate(() => window.mossvale.getState().world.objects.find(object => object.ref === 'orchard-ranger')?.sceneReaction);
    assert.equal(maraReaction, 'happy', 'Mara reacts when she remembers the saved choice');
    await capture(touch ? 'mara-family-first' : 'mara-water-first');
    await finish();

    await page.evaluate(() => window.mossvale.travel('amber-ridge'));
    await page.waitForFunction(() => window.mossvale.getState().save.mapId === 'amber-ridge');
    world = buildWorld(mapsById['amber-ridge']);
    if (touch) await page.locator('#game').tap();
    await walk([9.5, 25.4]);
    assert.match(await page.evaluate(() => window.mossvale.nearest().label), /Talk to Ranger Rowan/);
    if (touch) await page.locator('#touch-e').tap();
    else await page.keyboard.press('e');
    await page.waitForSelector('#speech-bubble:not([hidden])');
    const rowanMemory = await page.locator('#speech-bubble').innerText();
    assert.match(rowanMemory, touch ? /young are safe in the dry hollow/i : /lower row is flowing again/i);
    await capture(touch ? 'rowan-family-first' : 'rowan-water-first');
    await finish();

    assert.deepEqual(errors, []);
    report.push({
      input: touch ? 'touch' : 'keyboard',
      clue,
      plannedDistanceTiles: distance,
      observedDistanceTiles: Math.round(observedDistance * 100) / 100,
      repeatedHalfTileEdges: repeatedEdges,
      wallSeconds: (Date.now() - started) / 1000,
    });
    await context.close();
  }
  if (process.env.ORCHARD_REVIEW) writeFileSync('docs/scene-quality/265/routes.json', JSON.stringify(report, null, 2) + '\n');
  console.log('ok orchard independent real keyboard/touch routes, prop interactions, midway reload and once-only outcomes', report);
} finally {
  await browser.close();
  server.close();
}
