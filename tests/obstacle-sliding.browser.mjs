// Reproduce owner-reported wall sticking on real Meadow house/tree collision geometry with keyboard and touch input.
import {chromium} from 'playwright';
import http from 'node:http';
import {existsSync, readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../dist/', import.meta.url);
const types = {html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png'};
const server = http
  .createServer((request, response) => {
    const name = decodeURIComponent(request.url.split('?')[0].slice(1)) || 'index.html';
    const file = new URL(name, root);
    if (!existsSync(file)) return void response.writeHead(404).end();
    response.writeHead(200, {'content-type': types[name.split('.').pop()] || 'application/octet-stream'}).end(readFileSync(file));
  })
  .listen(0);
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
const desktop = await browser.newPage({viewport: {width: 1180, height: 820}});
const mobile = await browser.newContext({viewport: {width: 844, height: 390}, hasTouch: true, isMobile: true});
const touchPage = await mobile.newPage();
const errors = [];
desktop.on('pageerror', error => errors.push(error.message));
touchPage.on('pageerror', error => errors.push(error.message));

try {
  await desktop.goto(`http://localhost:${server.address().port}/?debug&seed=171`);
  await desktop.waitForSelector('#loading', {state: 'hidden'});
  await desktop.locator('#game').click();
  await desktop.evaluate(() => Object.assign(window.mossvale.getState().player, {x: 11.8, y: 9.1}));
  const cottageStart = await desktop.evaluate(() => ({...window.mossvale.getState().player}));
  await desktop.keyboard.down('ArrowUp');
  await desktop.keyboard.down('ArrowRight');
  await desktop.waitForTimeout(400);
  await desktop.keyboard.up('ArrowUp');
  await desktop.keyboard.up('ArrowRight');
  const cottageEnd = await desktop.evaluate(() => {
    const state = window.mossvale.getState();
    const house = state.world.objects.find(object => object.kind === 'cottage');
    return {
      player: {...state.player},
      mapId: state.world.map.id,
      clearance: Math.hypot(state.player.x - house.x, state.player.y - house.y) - house.solid - 0.25,
    };
  });
  assert.equal(cottageEnd.mapId, 'meadow');
  assert.ok(
    Math.hypot(cottageEnd.player.x - cottageStart.x, cottageEnd.player.y - cottageStart.y) > 1,
    'keyboard up-right slides around the real Meadow cottage',
  );
  assert.ok(cottageEnd.clearance >= -1e-6, 'keyboard movement keeps the player footprint outside the cottage');

  await touchPage.goto(`http://localhost:${server.address().port}/?debug&seed=172`);
  await touchPage.waitForSelector('#loading', {state: 'hidden'});
  await touchPage.locator('#game').tap();
  await touchPage.evaluate(() => Object.assign(window.mossvale.getState().player, {x: 28.3, y: 29.3}));
  const treeStart = await touchPage.evaluate(() => ({...window.mossvale.getState().player}));
  const upRight = touchPage.locator('button[data-dir="1,-1"]');
  await upRight.waitFor({state: 'visible'});
  assert.notEqual(await touchPage.locator('.touchpad').evaluate(node => getComputedStyle(node).display), 'none');
  const box = await upRight.boundingBox();
  const cdp = await mobile.newCDPSession(touchPage);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2}],
  });
  try {
    await touchPage.waitForFunction(
      start => {
        const player = window.mossvale.getState().player;
        return Math.hypot(player.x - start.x, player.y - start.y) > 0.5;
      },
      treeStart,
      {timeout: 4000},
    );
  } finally {
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  }
  const treeEnd = await touchPage.evaluate(() => {
    const state = window.mossvale.getState();
    const tree = state.world.objects.find(object => object.kind === 'scenery' && Math.abs(object.x - 28.3) < 1e-6 && Math.abs(object.y - 30.4) < 1e-6);
    return {player: {...state.player}, mapId: state.world.map.id, clearance: Math.hypot(state.player.x - tree.x, state.player.y - tree.y) - tree.solid - 0.25};
  });
  assert.equal(treeEnd.mapId, 'meadow');
  assert.ok(Math.hypot(treeEnd.player.x - treeStart.x, treeEnd.player.y - treeStart.y) > 0.5, 'touch up-right slides along a real Meadow tree');
  assert.ok(treeEnd.clearance >= -1e-6, 'touch movement keeps the player footprint outside the tree');
  assert.deepEqual(errors, []);
  console.log('ok Meadow cottage keyboard sliding and oak touch sliding preserve real prop collisions');
} finally {
  await mobile.close();
  await browser.close();
  server.close();
}
