// Traverse the new snowy biome-map pair and verify the active map survives a reload.
import {chromium} from 'playwright';
import http from 'node:http';
import {readFileSync, existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {codec, newSave, rawMaps} from './helpers.mjs';

const root = new URL('../dist/', import.meta.url);
const types = {html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', json: 'application/json', svg: 'image/svg+xml'};
const server = http
  .createServer((request, response) => {
    const name = decodeURIComponent(request.url.split('?')[0].slice(1)) || 'index.html';
    const file = new URL(name, root);
    if (!existsSync(file)) return void response.writeHead(404).end();
    response.writeHead(200, {'content-type': types[name.split('.').pop()] ?? 'application/octet-stream'}).end(readFileSync(file));
  })
  .listen(0);
const maps = new Map(rawMaps().map(map => [map.id, map]));
const pairs = [{hub: 'frostveil-grove', side: 'frostveil-pass', title: 'Blueglass Pass'}];
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});

try {
  for (const pair of pairs) {
    const hub = maps.get(pair.hub);
    const side = maps.get(pair.side);
    const region = 2;
    const outbound = hub.exits.find(exit => exit.to.map === pair.side);
    const inbound = side.exits.find(exit => exit.to.map === pair.hub);
    const initial = newSave();
    initial.met = true;
    initial.region = region;
    initial.badges = [region - 1];
    initial.visited = [...new Set([...initial.visited, region])];
    initial.mapId = pair.hub;
    initial.visitedMaps = [...new Set([...initial.visitedMaps, pair.hub])];

    const context = await browser.newContext({viewport: {width: 1280, height: 800}});
    await context.addInitScript(
      `if (!localStorage.getItem('mossvale-v3')) localStorage.setItem('mossvale-v3', ${JSON.stringify(codec.serialize(initial))}); localStorage.setItem('mossvale-settings', '{"motion":"reduced"}')`,
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(`http://localhost:${server.address().port}/?debug&seed=53`);
      await page.waitForSelector('#loading', {state: 'hidden'});
      const state = () => page.evaluate(() => window.mossvale.getState());
      assert.equal((await state()).world.map.id, pair.hub);

      await page.keyboard.down('d');
      await page.keyboard.down('s');
      await page.waitForFunction(x => window.mossvale.getState().player.x >= x - 1.1, outbound.at[0], {timeout: 15000});
      await page.keyboard.up('d');
      await page.keyboard.up('s');
      await page.keyboard.down('a');
      await page.keyboard.down('s');
      await page.waitForFunction(y => window.mossvale.getState().player.y >= y - 1.1, outbound.at[1], {timeout: 5000});
      await page.keyboard.up('a');
      await page.keyboard.up('s');
      await page.keyboard.press('e');
      await page.waitForFunction(id => window.mossvale.getState().save.mapId === id, pair.side);
      assert.equal((await state()).world.map.id, pair.side);
      assert.equal(await page.textContent('#region-name'), pair.title);
      assert.ok((await state()).save.visitedMaps.includes(pair.side));
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mossvale-v3')));
      assert.equal(saved.mapId, pair.side, 'the portal transition persists the selected map');

      await page.reload();
      await page.waitForSelector('#loading', {state: 'hidden'});
      assert.equal((await state()).world.map.id, pair.side, `${pair.side} restores as the active map`);
      assert.equal(await page.textContent('#region-name'), pair.title);

      await page.keyboard.down('w');
      await page.keyboard.down('a');
      await page.waitForFunction(x => window.mossvale.getState().player.x <= x + 0.2, inbound.at[0], {timeout: 5000});
      await page.keyboard.up('a');
      await page.keyboard.up('w');
      await page.keyboard.press('e');
      await page.waitForFunction(id => window.mossvale.getState().save.mapId === id, pair.hub);
      const returned = await state();
      assert.equal(returned.world.map.id, pair.hub);
      assert.deepEqual([returned.player.x, returned.player.y], hub.spawns[inbound.to.spawn]);
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }
  console.log('ok snowy map travel, reload restore, and return spawns');
} finally {
  await browser.close();
  server.close();
}
