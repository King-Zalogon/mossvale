// Exercise a real trigger through movement, dialogue and interruption in the shipped game.
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import http from 'node:http';
import {chromium} from 'playwright';

const root = new URL('../dist/', import.meta.url);
const types = {html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml'};
const server = http
  .createServer((request, response) => {
    const name = decodeURIComponent(request.url.split('?')[0].slice(1)) || 'index.html';
    const file = new URL(name, root);
    if (!existsSync(file)) return void response.writeHead(404).end();
    response.writeHead(200, {'content-type': types[name.split('.').pop()] || 'application/octet-stream'}).end(readFileSync(file));
  })
  .listen(0);
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));

function addEvent(page, {id, to, text, coins = 0}) {
  return page.evaluate(
    ({id, to, text, coins}) => {
      const state = window.mossvale.getState();
      const player = state.world.map.spawns.camp;
      const start = [player.x, player.y];
      const at = state.world.tiles
        .filter(tile => window.mossvale.valid(tile.x, tile.y))
        .filter(tile => Math.hypot(tile.x - start[0], tile.y - start[1]) > 2.2)
        .filter(tile => state.world.map.triggers.every(trigger => Math.hypot(tile.x - trigger.x, tile.y - trigger.y) > trigger.radius + 0.5))
        .filter(tile =>
          state.world.objects.every(
            object => !['ranger', 'sign', 'chest', 'shrine', 'gate'].includes(object.kind) || Math.hypot(tile.x - object.x, tile.y - object.y) > 2.3,
          ),
        )
        .sort((a, b) => Math.hypot(a.x - start[0], a.y - start[1]) - Math.hypot(b.x - start[0], b.y - start[1]))[0];
      if (!at) throw new Error('No open interaction tile in the map');
      Object.assign(state.player, {x: at.x, y: at.y});
      state.world.map.triggers.push({
        id: `test-${id}`,
        x: at.x,
        y: at.y,
        radius: 0.4,
        on: 'interact',
        once: true,
        actions: [],
        events: [
          {
            id,
            repeatable: false,
            actions: [
              {type: 'move', actor: 'player', to},
              {type: 'face', actor: 'player', target: state.world.objects.find(object => object.kind === 'ranger')?.ref ?? 'player'},
              {type: 'react', actor: 'player', pose: 'notice'},
              {type: 'wait', ms: 80},
              {type: 'reward', coins},
              {type: 'dialogue', speaker: 'player', text},
            ],
          },
        ],
      });
      return {start: {x: at.x, y: at.y}, mapId: state.world.map.id};
    },
    {id, to, text, coins},
  );
}

try {
  await page.goto(`http://localhost:${server.address().port}/?debug`);
  await page
    .waitForFunction(() => window.mossvale && document.querySelector('#loading').hidden, null, {timeout: 10000})
    .catch(async error => {
      console.error('game startup did not finish', errors, await page.locator('body').innerText());
      throw error;
    });
  if (await page.locator('#m-primary').isVisible()) await page.click('#m-primary');
  if (await page.locator('#story-ok').isVisible()) await page.click('#story-ok');
  const start = await page.evaluate(() => window.mossvale.getState().world.map.spawns.camp);
  const target = await page.evaluate(({x, y}) => {
    const state = window.mossvale.getState();
    return (
      state.world.tiles.find(tile => tile.x > x + 2 && tile.y === y && window.mossvale.valid(tile.x, tile.y)) ??
      state.world.tiles.find(tile => tile.x > x + 2 && window.mossvale.valid(tile.x, tile.y))
    );
  }, start);
  assert.ok(target, 'a walkable destination exists near camp');
  const initialCoins = await page.evaluate(() => window.mossvale.getState().save.coins);
  const first = await addEvent(page, {id: 'staging-arrives', to: [target.x, target.y], text: 'We made it.', coins: 2});
  await page.evaluate(() => window.mossvale.interact());
  await page.waitForFunction(() => document.querySelector('#speech-text')?.textContent.includes('We made it.'));
  assert.deepEqual(
    await page.evaluate(() => {
      const state = window.mossvale.getState();
      return [state.player.x, state.player.y, state.sceneBusy, state.save.coins];
    }),
    [target.x, target.y, false, initialCoins + 2],
  );
  await page.click('#speech-next');
  await page.waitForSelector('#speech-bubble[hidden]', {state: 'hidden'});
  await page.waitForTimeout(300); // interactions are intentionally debounced

  const far = await page.evaluate(({x, y}) => {
    const state = window.mossvale.getState();
    return state.world.tiles
      .filter(tile => window.mossvale.valid(tile.x, tile.y))
      .sort((a, b) => Math.hypot(b.x - x, b.y - y) - Math.hypot(a.x - x, a.y - y))[0];
  }, first.start);
  const beforeCancel = await page.evaluate(() => window.mossvale.getState().save.coins);
  const cancelled = await addEvent(page, {id: 'staging-cancelled', to: [far.x, far.y], text: 'This should not present.', coins: 3});
  await page.evaluate(() => window.mossvale.interact());
  await page
    .waitForFunction(() => window.mossvale.getState().sceneBusy, null, {timeout: 3000})
    .catch(async error => {
      console.error(
        'second event did not start',
        await page.evaluate(() => {
          const state = window.mossvale.getState();
          return {
            busy: state.sceneBusy,
            player: state.player,
            modal: state.modalMode,
            events: state.save.events,
            triggers: state.world.map.triggers.map(t => [t.id, t.x, t.y]),
          };
        }),
        cancelled,
      );
      throw error;
    });
  await page.click('#pause');
  await page.waitForFunction(() => window.mossvale.getState().paused);
  assert.equal(await page.evaluate(() => window.mossvale.getState().sceneBusy), false, 'pausing releases scene movement ownership');
  const stoppedAt = await page.evaluate(() => ({x: window.mossvale.getState().player.x, y: window.mossvale.getState().player.y}));
  await page.waitForTimeout(350);
  assert.deepEqual(
    await page.evaluate(() => ({x: window.mossvale.getState().player.x, y: window.mossvale.getState().player.y})),
    stoppedAt,
    'cancelled motion cannot update actors later',
  );
  assert.equal(await page.evaluate(() => window.mossvale.getState().save.coins), beforeCancel + 3, 'durable reward commits before presentation');
  assert.ok(await page.evaluate(({mapId}) => window.mossvale.getState().save.events.includes(`${mapId}/staging-cancelled`), cancelled));
  await page.reload();
  await page.waitForFunction(() => window.mossvale && document.querySelector('#loading').hidden);
  if (await page.locator('#m-primary').isVisible()) await page.click('#m-primary');
  if (await page.locator('#story-ok').isVisible()) await page.click('#story-ok');
  const afterReload = await page.evaluate(() => window.mossvale.getState().save.coins);
  assert.equal(afterReload, beforeCancel + 3, 'reload does not award an interrupted one-time scene twice');
  assert.deepEqual(errors, []);
  console.log('ok scene movement arrives, dialogue follows, and pause interruption releases locks without duplicate rewards');
} finally {
  await browser.close();
  server.close();
}
