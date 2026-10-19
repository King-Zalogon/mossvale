import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {rawMaps} from './helpers.mjs';

const root = new URL('../dist/', import.meta.url);
const types = {html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml'};
const server = http.createServer((request, response) => {
  const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname.slice(1)) || 'index.html';
  let bytes;
  try {
    bytes = readFileSync(new URL(name, root));
  } catch {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {'content-type': types[name.split('.').pop()] ?? 'application/octet-stream'}).end(bytes);
});
server.listen(0);
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
const maps = rawMaps();

try {
  const context = await browser.newContext({viewport: {width: 1100, height: 820}});
  await context.addInitScript(() => {
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    window.chestDraws = [];
    CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
      if (this.canvas.id === 'game' && image?.src?.includes('/chest-')) {
        window.chestDraws.push(image.src.split('/').pop());
        if (window.chestDraws.length > 80) window.chestDraws.shift();
      }
      return draw.call(this, image, ...args);
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://localhost:${server.address().port}/?debug&seed=336`);
  await page.waitForSelector('#loading', {state: 'hidden'});

  for (const map of maps) {
    const caches = map.landmarks.filter(landmark => landmark.kind === 'chest' && landmark.flag.includes(':'));
    assert.equal(caches.length, 2, `${map.id} has two new caches`);
    await page.evaluate(id => {
      const game = window.mossvale.getState();
      game.save.badges = [0, 1, 2, 3];
      window.mossvale.travel(id);
    }, map.id);
    await page.waitForFunction(id => window.mossvale.getState().world.map.id === id, map.id);

    for (const cache of caches) {
      const sprite = {meadow: 'chest-wooden', wetland: 'chest-reed-rope', badlands: 'chest-sandstone-iron', 'snowy-forest': 'chest-pine-frost'}[map.biome];
      const before = await page.evaluate(
        ({mapId, flag}) => {
          const state = window.mossvale.getState();
          const cache = state.world.map.objects.find(object => object.flag === flag);
          if (!cache) throw new Error(`missing ${mapId}/${flag}`);
          const approach = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
          ]
            .map(([dx, dy]) => ({x: cache.x + dx, y: cache.y + dy}))
            .find(point => window.mossvale.valid(point.x, point.y) && Math.hypot(point.x - cache.x, point.y - cache.y) < 1.95);
          if (!approach) throw new Error(`no walkable interaction point beside ${mapId}/${flag}`);
          Object.assign(state.player, approach);
          return {supplies: [state.save.coins, state.save.potions, state.save.orbs], flags: [...(state.save.mapFlags ?? [])]};
        },
        {mapId: map.id, flag: cache.flag},
      );
      await page.waitForFunction(label => document.querySelector('#toast')?.textContent.includes(label), cache.mapLabel);
      await page.waitForTimeout(400);
      await page.evaluate(() => window.mossvale.interact());
      try {
        await page.waitForSelector('#result-continue', {timeout: 3000});
      } catch {
        const state = await page.evaluate(() => {
          const game = window.mossvale.getState();
          return {
            phase: game.phase,
            player: game.player,
            mapId: game.world.map.id,
            toast: document.querySelector('#toast')?.textContent,
            saveFlags: game.save.mapFlags,
          };
        });
        throw new Error(`interaction failed for ${map.id}/${cache.id}: ${JSON.stringify(state)}`);
      }
      const after = await page.evaluate(() => {
        const state = window.mossvale.getState();
        return {supplies: [state.save.coins, state.save.potions, state.save.orbs], flags: [...(state.save.mapFlags ?? [])]};
      });
      assert.deepEqual(
        after.supplies,
        [before.supplies[0] + 6, before.supplies[1], before.supplies[2] + 1],
        `${map.id}/${cache.id} grants only its authored reward`,
      );
      assert.ok(after.flags.includes(cache.flag), `${map.id}/${cache.id} saves its unique claim flag`);
      assert.equal(
        after.flags.filter(flag => flag.startsWith(`${map.id}.chest:`)).length,
        before.flags.filter(flag => flag.startsWith(`${map.id}.chest:`)).length + 1,
      );
      for (const sibling of caches.filter(candidate => candidate.id !== cache.id && !before.flags.includes(candidate.flag)))
        assert.ok(!after.flags.includes(sibling.flag), 'claiming one cache does not claim an unopened sibling cache');
      await page.click('#result-continue');
      await page.reload();
      await page.waitForSelector('#loading', {state: 'hidden'});
      await page.waitForFunction(name => window.chestDraws.includes(name + '-open-empty.png'), sprite);

      const reloaded = await page.evaluate(
        ({mapId, flag}) => {
          const state = window.mossvale.getState();
          const cache = state.world.map.objects.find(object => object.flag === flag);
          const approach = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
          ]
            .map(([dx, dy]) => ({x: cache.x + dx, y: cache.y + dy}))
            .find(point => window.mossvale.valid(point.x, point.y) && Math.hypot(point.x - cache.x, point.y - cache.y) < 1.95);
          if (!approach) throw new Error(`no walkable interaction point beside ${mapId}/${flag}`);
          Object.assign(state.player, approach);
          return {supplies: [state.save.coins, state.save.potions, state.save.orbs], flags: [...(state.save.mapFlags ?? [])], mapId: state.world.map.id};
        },
        {mapId: map.id, flag: cache.flag},
      );
      assert.equal(reloaded.mapId, map.id, 'the active map remains selected after reload');
      assert.ok(reloaded.flags.includes(cache.flag), `${map.id}/${cache.id} remains claimed after reload`);
      await page.evaluate(() => window.mossvale.interact());
      await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('chest is empty'));
      assert.deepEqual(
        await page.evaluate(() => {
          const save = window.mossvale.getState().save;
          return [save.coins, save.potions, save.orbs];
        }),
        reloaded.supplies,
        `${map.id}/${cache.id} never rewards twice`,
      );
    }
  }
  assert.deepEqual(errors, []);
  await context.close();
  console.log('ok all 18 optional caches are separately claimable, render open/empty and stay empty across reload');
} finally {
  await browser.close();
  server.close();
}
