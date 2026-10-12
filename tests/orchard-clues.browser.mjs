import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {mkdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {gameHandler} from '../scripts/local-integration.mjs';
import {codec, newSave, mapsById} from './helpers.mjs';
import {buildWorld, isWalkable} from '../dist/src/domain/world.js';
import {inputForWorldTarget} from './action-script.mjs';
const world = buildWorld(mapsById['orchard-ruins']);
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
    let distance = 0;
    const walk = async target => {
      console.log(touch ? 'touch' : 'keyboard', 'walk', target);
      const route = path((await state()).player, target);
      distance += route.length * 0.5;
      for (const [x, y] of route) {
        for (let n = 0; n < 60; n++) {
          const p = (await state()).player;
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
    const capture = async label => {
      if (process.env.ORCHARD_REVIEW) {
        mkdirSync('docs/scene-quality/260', {recursive: true});
        await page.screenshot({path: `docs/scene-quality/260/${touch ? 'phone' : 'desktop'}-${label}.png`});
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
    await interact(touch ? 'outcome-family-first' : 'outcome-water-first');
    assert.equal((await state()).save.coins, coins + 10);
    await page.reload();
    await page.waitForSelector('#loading', {state: 'hidden'});
    assert.equal((await state()).save.coins, coins + 10);
    if (touch) await page.locator('#game').tap();
    await walk(touch ? [47, 34] : [52, 41]); // Leave the resolved interaction radius before returning.
    await walk(touch ? [44, 34] : [49, 41]);
    if (touch) await page.locator('#touch-e').tap();
    else await page.keyboard.press('e');
    await finish();
    assert.equal((await state()).save.coins, coins + 10, 're-entering the resolved interaction after reload cannot duplicate its reward');
    assert.equal(new Set((await state()).save.events).size, (await state()).save.events.length);
    assert.deepEqual(errors, []);
    report.push({input: touch ? 'touch' : 'keyboard', clue, distanceTiles: distance, wallSeconds: (Date.now() - started) / 1000});
    await context.close();
  }
  if (process.env.ORCHARD_REVIEW) writeFileSync('docs/scene-quality/260/routes.json', JSON.stringify(report, null, 2) + '\n');
  console.log('ok orchard independent real keyboard/touch routes, prop interactions, midway reload and once-only outcomes', report);
} finally {
  await browser.close();
  server.close();
}
