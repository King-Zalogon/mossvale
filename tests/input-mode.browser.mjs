// Actual input selects the movement HUD; touchscreen capability alone must not select it on a PC.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {gameHandler} from '../scripts/local-integration.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = createServer(gameHandler(root)).listen(0);
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
const url = `http://localhost:${server.address().port}/?debug&seed=241`;
const errors = [];
const load = async page => {
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.waitForSelector('#loading', {state: 'hidden'});
};
const padIsVisible = page => page.locator('.touchpad').isVisible();
const position = page => page.evaluate(() => ({...window.mossvale.getState().player}));
const capturePlayerAtlas = page =>
  page.addInitScript(() => {
    window.playerAtlasFrames = [];
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
      const result = drawImage.call(this, image, ...args);
      if (image?.src?.includes('/person-red-cap-motion.png') && args.length >= 8) {
        window.playerAtlasFrames.push({column: Math.round(args[0] / 160), row: Math.round(args[1] / 256), height: args[7]});
        if (window.playerAtlasFrames.length > 120) window.playerAtlasFrames.shift();
      }
      return result;
    };
  });
const review = async (page, name) => {
  if (!process.env.MOSSVALE_INPUT_REVIEW_DIR) return;
  mkdirSync(process.env.MOSSVALE_INPUT_REVIEW_DIR, {recursive: true});
  await page.locator('.game-frame').screenshot({path: join(process.env.MOSSVALE_INPUT_REVIEW_DIR, `${name}.png`)});
};
try {
  const desktop = await browser.newPage({viewport: {width: 1366, height: 1000}});
  await load(desktop);
  assert.equal(await desktop.evaluate(() => matchMedia('(pointer: fine)').matches), true);
  assert.equal(await padIsVisible(desktop), false);
  assert.equal(await desktop.locator('#touch-run').isVisible(), false);
  assert.equal(await desktop.locator('.keyboard-hint').first().isVisible(), true);
  await desktop.locator('#game').click();
  const start = await position(desktop);
  await desktop.keyboard.down('ArrowRight');
  await desktop.waitForFunction(p => Math.hypot(window.mossvale.getState().player.x - p.x, window.mossvale.getState().player.y - p.y) > 0.2, start);
  await desktop.keyboard.up('ArrowRight');
  assert.equal(await padIsVisible(desktop), false, 'real desktop movement retains an unobstructed playfield');
  await desktop.setViewportSize({width: 600, height: 800});
  assert.equal(await padIsVisible(desktop), false, 'narrow windows do not turn a mouse into a touch input');
  assert.equal(await desktop.locator('.keyboard-hint').first().isVisible(), true, 'narrow desktop keeps its movement instructions');

  // Chromium exposes one emulated primary pointer. Combine its real coarse CSS/touch
  // events with fine-primary capability reports to exercise a hybrid PC deliberately.
  const hybrid = await browser.newContext({viewport: {width: 1366, height: 1000}, hasTouch: true});
  await hybrid.addInitScript(() => {
    const match = window.matchMedia.bind(window);
    window.matchMedia = query => {
      const result = match(query);
      if (['(pointer: coarse)', '(pointer: fine)', '(any-pointer: fine)'].includes(query)) {
        Object.defineProperty(result, 'matches', {value: query !== '(pointer: coarse)'});
      }
      return result;
    };
  });
  const page = await hybrid.newPage();
  await load(page);
  assert.deepEqual(
    await page.evaluate(() => [matchMedia('(pointer: fine)').matches, matchMedia('(any-pointer: coarse)').matches, navigator.maxTouchPoints > 0]),
    [true, true, true],
  );
  assert.equal(await padIsVisible(page), false, 'available touch capability does not overlay a fine-pointer session');
  await review(page, 'desktop-after');
  await page.locator('#game').tap();
  assert.equal(await padIsVisible(page), true, 'actual touch use reveals movement');
  assert.equal(await page.locator('#touch-run').isVisible(), true);
  assert.equal(await page.locator('.touch-hint').isVisible(), true);
  assert.equal(await page.locator('.keyboard-hint').first().isVisible(), false);
  await page.evaluate(() => {
    const game = window.mossvale.getState();
    game.world.map.zones = [];
    const tile = game.world.tiles.find(t => [-1, 0, 1].every(dx => [-1, 0, 1].every(dy => window.mossvale.valid(t.x + 0.5 + dx, t.y + 0.5 + dy))));
    if (!tile) throw new Error('No clear movement fixture in the actual map');
    Object.assign(game.player, {x: tile.x + 0.5, y: tile.y + 0.5});
  });
  const cdp = await hybrid.newCDPSession(page);
  const center = async selector => {
    const box = await page.locator(selector).boundingBox();
    return {id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2};
  };
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [await center('[data-dir="1,0"]')]});
  await page.waitForFunction(() => window.mossvale.getState().player.dir === 2);
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [await center('[data-dir="0,-1"]')]});
  await page.waitForFunction(() => window.mossvale.getState().player.dir === 0);
  const dragged = await position(page);
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => document.body.dataset.inputMode === 'desktop');
  await page.waitForFunction(p => window.mossvale.getState().player.x !== p.x, dragged);
  await page.keyboard.up('ArrowRight');
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await page.waitForTimeout(150);
  const stopped = await position(page);
  await page.waitForTimeout(200);
  const afterStop = await position(page);
  assert.ok(Math.hypot(afterStop.x - stopped.x, afterStop.y - stopped.y) < 0.02, 'keyboard takeover releases captured touch without stuck movement');
  assert.equal(await padIsVisible(page), false);
  await page.locator('#game').tap();
  await page.locator('#touch-run').focus();
  await page.locator('#game').click();
  assert.equal(await padIsVisible(page), false, 'mouse click restores desktop controls');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'game', 'focus leaves the hidden Run control');
  await cdp.detach();

  const phone = await browser.newPage({viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true, reducedMotion: 'reduce'});
  await load(phone);
  assert.equal(await padIsVisible(phone), true, 'coarse-primary phones start with usable movement');
  for (const size of [
    {width: 390, height: 844},
    {width: 844, height: 390},
  ]) {
    await phone.setViewportSize(size);
    assert.equal(await padIsVisible(phone), true, 'orientation changes preserve touch mode');
    const bounds = await phone.locator('.touchpad').evaluate(node => {
      const p = node.getBoundingClientRect();
      const v = node.closest('.viewport').getBoundingClientRect();
      return {
        inside: p.left >= v.left && p.right <= v.right + 1 && p.top >= v.top && p.bottom <= v.bottom + 1,
        minTarget: Math.min(...[...node.querySelectorAll('button')].map(b => Math.min(b.offsetWidth, b.offsetHeight))),
      };
    });
    assert.equal(bounds.inside, true);
    assert.ok(bounds.minTarget >= 44);
    await review(phone, size.width === 390 ? 'phone-portrait' : 'phone-landscape');
  }

  const touchWalk = await browser.newPage({viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true});
  await capturePlayerAtlas(touchWalk);
  await load(touchWalk);
  assert.equal(await padIsVisible(touchWalk), true);
  await touchWalk.locator('#game').tap();
  assert.ok(
    Number(
      await touchWalk
        .locator('.touchpad [data-dir]')
        .first()
        .evaluate(node => getComputedStyle(node).opacity),
    ) < 0.6,
    'the touch pad stays discoverable but unobtrusive at rest',
  );
  const touchStart = await position(touchWalk);
  const touchCdp = await touchWalk.context().newCDPSession(touchWalk);
  const northButton = await touchWalk.locator('[data-dir="0,-1"]').boundingBox();
  const northPoint = {id: 1, x: northButton.x + northButton.width / 2, y: northButton.y + northButton.height / 2};
  await touchCdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [northPoint]});
  await touchWalk.waitForFunction(p => Math.hypot(window.mossvale.getState().player.x - p.x, window.mossvale.getState().player.y - p.y) > 0.2, touchStart);
  await touchWalk.waitForFunction(() => window.playerAtlasFrames.some(frame => frame.column > 0));
  await touchCdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await touchWalk.waitForTimeout(180);
  const touchStopped = await position(touchWalk);
  await touchWalk.waitForTimeout(180);
  const touchAfterStop = await position(touchWalk);
  assert.ok(Math.hypot(touchAfterStop.x - touchStopped.x, touchAfterStop.y - touchStopped.y) < 0.02, 'releasing touch stops movement');
  assert.deepEqual(
    await touchWalk.evaluate(() => {
      const {column, row} = window.playerAtlasFrames.at(-1);
      return {column, row};
    }),
    {column: 0, row: 0},
    'touch release returns to north idle',
  );
  const touchHeightDelta = await touchWalk.evaluate(() => {
    const frames = window.playerAtlasFrames.filter(frame => frame.row === 0);
    return Math.max(...frames.map(frame => frame.height)) - Math.min(...frames.map(frame => frame.height));
  });
  assert.ok(touchHeightDelta < 0.01, `touch walk-to-idle keeps a fixed sprite size (${touchHeightDelta})`);

  const touchDirections = [
    {name: 'northwest', vector: [-1, -1]},
    {name: 'north', vector: [0, -1]},
    {name: 'northeast', vector: [1, -1]},
    {name: 'west', vector: [-1, 0]},
    {name: 'east', vector: [1, 0]},
    {name: 'southwest', vector: [-1, 1]},
    {name: 'south', vector: [0, 1]},
    {name: 'southeast', vector: [1, 1]},
  ];
  const clearStart = async () =>
    touchWalk.evaluate(() => {
      const game = window.mossvale.getState();
      game.world.map.zones = [];
      const tile = game.world.tiles.find(t => [-1, 0, 1].every(dx => [-1, 0, 1].every(dy => window.mossvale.valid(t.x + 0.5 + dx, t.y + 0.5 + dy))));
      if (!tile) throw new Error('No eight-direction touch fixture in the actual map');
      Object.assign(game.player, {x: tile.x + 0.5, y: tile.y + 0.5, walkDistance: 0});
      return {x: game.player.x, y: game.player.y};
    });
  const assertTouchDirection = async ({name, vector}, pointerId = 2) => {
    const start = await clearStart();
    const selector = `[data-dir="${vector[0]},${vector[1]}"]`;
    const box = await touchWalk.locator(selector).boundingBox();
    assert.ok(box, `${name} target remains inside the short-screen control area`);
    const point = {id: pointerId, x: box.x + box.width / 2, y: box.y + box.height / 2};
    await touchCdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [point]});
    await touchWalk.waitForFunction(() => document.querySelector('.touchpad').dataset.engaged === 'true');
    assert.equal(await touchWalk.locator(selector).getAttribute('data-active'), 'true', `${name} reveals and presses on the first touch`);
    await touchWalk.waitForFunction(s => Number(getComputedStyle(document.querySelector(s)).opacity) > 0.9, selector);
    assert.ok(Number(await touchWalk.locator(selector).evaluate(node => getComputedStyle(node).opacity)) > 0.9, `${name} becomes visible on the same touch`);
    await touchWalk.waitForFunction(
      ({start, sx, sy}) => {
        const player = window.mossvale.getState().player;
        const dx = player.x - start.x;
        const dy = player.y - start.y;
        const screenX = dx - dy;
        const screenY = dx + dy;
        const sign = value => (Math.abs(value) < 0.06 ? 0 : Math.sign(value));
        return Math.hypot(dx, dy) > 0.12 && sign(screenX) === sx && sign(screenY) === sy;
      },
      {start, sx: vector[0], sy: vector[1]},
      {timeout: 3000},
    );
    await touchCdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    await touchWalk.waitForTimeout(100);
    const stopped = await position(touchWalk);
    await touchWalk.waitForTimeout(100);
    const afterStop = await position(touchWalk);
    assert.ok(Math.hypot(afterStop.x - stopped.x, afterStop.y - stopped.y) < 0.02, `${name} stops on release`);
  };

  for (const size of [
    {width: 390, height: 844},
    {width: 844, height: 390},
  ]) {
    await touchWalk.setViewportSize(size);
    await touchWalk.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
    await touchWalk.waitForFunction(() => document.body.dataset.inputMode === 'touch');
    assert.equal(await padIsVisible(touchWalk), true, `touch movement remains visible at ${size.width}×${size.height}`);
    const controlsInsideViewport = await touchWalk.locator('.touchpad').evaluate(node => {
      const viewport = node.closest('.viewport').getBoundingClientRect();
      return [...node.querySelectorAll('[data-dir]')].every(button => {
        const rect = button.getBoundingClientRect();
        return (
          rect.width >= 44 &&
          rect.height >= 44 &&
          rect.left >= viewport.left &&
          rect.right <= viewport.right &&
          rect.top >= viewport.top &&
          rect.bottom <= viewport.bottom
        );
      });
    });
    assert.equal(controlsInsideViewport, true, `all eight hit targets fit at ${size.width}×${size.height}`);
    for (const direction of touchDirections) await assertTouchDirection(direction);
  }

  // A canceled press releases immediately; the dim, discoverable pad returns after its idle fade.
  {
    const start = await clearStart();
    const box = await touchWalk.locator('[data-dir="0,1"]').boundingBox();
    await touchCdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{id: 4, x: box.x + box.width / 2, y: box.y + box.height / 2}]});
    await touchWalk.waitForFunction(p => Math.hypot(window.mossvale.getState().player.x - p.x, window.mossvale.getState().player.y - p.y) > 0.12, start);
    await touchCdp.send('Input.dispatchTouchEvent', {type: 'touchCancel', touchPoints: []});
    const stopped = await position(touchWalk);
    await touchWalk.waitForTimeout(150);
    const afterCancel = await position(touchWalk);
    assert.ok(Math.hypot(afterCancel.x - stopped.x, afterCancel.y - stopped.y) < 0.02, 'pointer cancellation cannot leave movement stuck');
    await touchWalk.waitForFunction(() => document.querySelector('.touchpad').dataset.engaged === 'false', null, {timeout: 1500});
    await touchWalk.waitForFunction(() => Number(getComputedStyle(document.querySelector('.touchpad [data-dir]')).opacity) < 0.6);
    assert.ok(
      Number(
        await touchWalk
          .locator('.touchpad [data-dir]')
          .first()
          .evaluate(node => getComputedStyle(node).opacity),
      ) < 0.6,
      'the arrows fade back to their unobtrusive resting state',
    );
  }

  // Rotating while a finger is held stops that pointer; controls remain usable afterwards.
  {
    const start = await clearStart();
    const box = await touchWalk.locator('[data-dir="1,1"]').boundingBox();
    await touchCdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{id: 5, x: box.x + box.width / 2, y: box.y + box.height / 2}]});
    await touchWalk.waitForFunction(p => Math.hypot(window.mossvale.getState().player.x - p.x, window.mossvale.getState().player.y - p.y) > 0.12, start);
    await touchWalk.setViewportSize({width: 390, height: 844});
    await touchWalk.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
    const stopped = await position(touchWalk);
    await touchWalk.waitForTimeout(150);
    const afterRotation = await position(touchWalk);
    assert.ok(Math.hypot(afterRotation.x - stopped.x, afterRotation.y - stopped.y) < 0.02, 'rotation releases the active movement pointer');
    assert.equal(await padIsVisible(touchWalk), true, 'touch controls survive rotation without a reload');
    await touchCdp.send('Input.dispatchTouchEvent', {type: 'touchCancel', touchPoints: []});
    await assertTouchDirection({name: 'south after rotation', vector: [0, 1]}, 6);
  }

  assert.equal(await touchWalk.locator('#touch-run').getAttribute('aria-pressed'), 'false');
  await touchWalk.locator('#touch-run').tap();
  assert.equal(await touchWalk.locator('#touch-run').getAttribute('aria-pressed'), 'true', 'Run still responds to touch');
  await touchWalk.locator('#touch-run').tap();
  assert.equal(await touchWalk.locator('#touch-run').getAttribute('aria-pressed'), 'false');
  await touchCdp.detach();
  assert.deepEqual(errors, []);
  console.log('ok all eight real touch directions in portrait/landscape, same-press reveal, release/cancel/rotation, Run and unobtrusive idle controls');
} finally {
  await browser.close();
  server.close();
}
