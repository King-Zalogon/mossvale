// Visit the second meadow map, reload there, return with touch controls and keep the local save in sync.
import {chromium} from 'playwright';
import http from 'node:http';
import {readFileSync, existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {codec, newSave} from './helpers.mjs';

const root = new URL('../dist/', import.meta.url);
const types = {html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', json: 'application/json', svg: 'image/svg+xml'};
const server = http
  .createServer((q, r) => {
    const name = q.url.split('?')[0].slice(1) || 'index.html';
    if (!existsSync(new URL(name, root))) return void r.writeHead(404).end();
    r.writeHead(200, {'content-type': types[name.split('.').pop()] ?? 'application/octet-stream'}).end(readFileSync(new URL(name, root)));
  })
  .listen(0);
const url = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
const ctx = await browser.newContext({viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true});
const initial = newSave();
initial.met = true;
await ctx.addInitScript(
  `if (!localStorage.getItem('mossvale-v3')) localStorage.setItem('mossvale-v3', ${JSON.stringify(codec.serialize(initial))}); localStorage.setItem('mossvale-settings', '{"motion":"reduced"}')`,
);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

try {
  await page.goto(url + '?debug&seed=51');
  await page.waitForSelector('#loading', {state: 'hidden'});
  const state = () => page.evaluate(() => window.mossvale.getState());
  assert.equal((await state()).save.mapId, 'meadow');

  // Walk the trail east with the keyboard, then use the real gate interaction.
  await page.keyboard.down('d');
  await page.keyboard.down('s');
  await page.waitForFunction(() => window.mossvale.getState().player.x >= 20.8, null, {timeout: 15000});
  await page.keyboard.up('d');
  await page.keyboard.up('s');
  await page.waitForFunction(() => document.querySelector('#interact').style.display === 'block');
  await page.locator('#interact').click();
  await page.waitForFunction(() => window.mossvale.getState().save.mapId === 'orchard-ruins');
  assert.equal(await page.textContent('#region-name'), 'The Ruined Orchard');
  const orchardRaw = await page.evaluate(() => JSON.parse(localStorage.getItem('mossvale-v3')));
  assert.deepEqual([orchardRaw.version, orchardRaw.mapId], [4, 'orchard-ruins']);
  assert.deepEqual(orchardRaw.visitedMaps, ['meadow', 'orchard-ruins']);

  // Reload proves that mapId, not just its shared biome, chooses the active world.
  await page.reload();
  await page.waitForSelector('#loading', {state: 'hidden'});
  assert.equal((await state()).world.map.id, 'orchard-ruins');
  assert.equal(await page.textContent('#region-name'), 'The Ruined Orchard');

  // Move toward the west portal with the touch pad and tap its interaction button.
  const west = page.locator('button[data-dir="-1,0"]');
  await west.waitFor({state: 'visible'});
  const box = await west.boundingBox();
  const before = (await state()).player.x;
  const touch = await ctx.newCDPSession(page);
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2}],
  });
  try {
    await page.waitForFunction(x => window.mossvale.getState().player.x < x - 0.35, before, {timeout: 5000});
  } finally {
    await touch.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  }
  assert.ok((await state()).player.x < before - 0.35, 'touch-pad taps move the player west');
  const interact = await page.locator('#touch-e').boundingBox();
  await page.touchscreen.tap(interact.x + interact.width / 2, interact.y + interact.height / 2);
  await page.waitForFunction(() => window.mossvale.getState().save.mapId === 'meadow');
  const returned = await state();
  assert.deepEqual([returned.player.x, returned.player.y], [20, 12], 'the return gate lands at the Meadow orchard spawn');
  assert.equal(await page.textContent('#region-name'), 'Sunlit Trail');

  // The onward portal stays locked until the Meadow shrine is earned.
  await page.evaluate(() => Object.assign(window.mossvale.getState().player, {x: 21, y: 12}));
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
  assert.equal((await state()).save.mapId, 'meadow');

  // The original Meadow chest still pays once and survives a reload after travelling back.
  await page.evaluate(() => Object.assign(window.mossvale.getState().player, {x: 17.2, y: 16}));
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.mossvale.getState().save.chests.includes(0));
  const reward = await state();
  assert.deepEqual([reward.save.coins, reward.save.potions, reward.save.orbs], [30, 5, 16]);
  await page.click('#result-continue');
  await page.waitForTimeout(300);
  await page.keyboard.press('e');
  await page.waitForTimeout(100);
  const afterSecondOpen = await state();
  assert.deepEqual([afterSecondOpen.save.coins, afterSecondOpen.save.potions, afterSecondOpen.save.orbs], [30, 5, 16]);

  await page.reload();
  await page.waitForSelector('#loading', {state: 'hidden'});
  const resumed = await state();
  assert.equal(resumed.world.map.id, 'meadow');
  assert.equal(resumed.save.mapId, 'meadow');
  assert.ok(resumed.save.chests.includes(0));
  assert.deepEqual([resumed.save.coins, resumed.save.potions, resumed.save.orbs], [30, 5, 16]);
  assert.deepEqual(errors, []);
  console.log('ok meadow/orchard portal travel, touch return, map reload and chest reward persistence');
} finally {
  await ctx.close();
  await browser.close();
  server.close();
}
