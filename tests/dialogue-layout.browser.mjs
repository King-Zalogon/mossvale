// Responsive placement, safe-area clearance, scrolling and progression for #236.
import {chromium} from 'playwright';
import http from 'node:http';
import {existsSync, readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

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

try {
  const page = await browser.newPage({viewport: {width: 1280, height: 820}, reducedMotion: 'reduce', hasTouch: true});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://localhost:${server.address().port}/?debug`);
  await page.waitForFunction(() => window.mossvale && document.querySelector('#loading').hidden);

  const activeRanger = await page.evaluate(() => window.mossvale.getState().world.objects.find(object => object.kind === 'ranger'));
  assert.ok(activeRanger, 'the starting map provides a real NPC anchor');
  const report = async (label, speaker, text) => {
    await page.evaluate(
      ({speaker, text}) => window.mossvale.previewSpeech([{speaker, name: speaker === 'narrator' ? 'Old cider press' : 'Ranger Iris', text}]),
      {speaker, text},
    );
    await page.waitForSelector('#speech-bubble:not([hidden])');
    await page.waitForTimeout(80);
    const result = await page.evaluate(() => {
      const bubble = document.querySelector('#speech-bubble');
      const viewport = bubble.parentElement.getBoundingClientRect();
      const box = bubble.getBoundingClientRect();
      const canvas = document.querySelector('#game');
      const map = canvas.getBoundingClientRect();
      const state = window.mossvale.getState();
      const target =
        bubble.querySelector('#speech-speaker').textContent === 'Ranger Iris' ? state.world.objects.find(object => object.kind === 'ranger') : null;
      let targetBox = null;
      if (target) {
        // The reduced-motion browser case keeps the camera centered on the stationary player.
        const {player, zoom} = state;
        const x = canvas.width / 2 + (target.x - target.y - (player.x - player.y)) * 28 * zoom;
        const y = canvas.height * 0.49 + (target.x + target.y - (player.x + player.y)) * 14 * zoom;
        const px = map.left - viewport.left + (x / canvas.width) * map.width;
        const py = map.top - viewport.top + (y / canvas.height) * map.height;
        targetBox = {left: px - 24, right: px + 24, top: py - 58, bottom: py + 18};
      }
      const controlRects = ['.touchpad', '#touch-run', '.game-footer']
        .map(selector => document.querySelector(selector))
        .filter(node => node)
        .filter(node => getComputedStyle(node).display !== 'none')
        .map(node => node.getBoundingClientRect())
        .filter(rect => rect.top < viewport.bottom && rect.bottom > viewport.top);
      const controlsAbove = controlRects.every(
        rect => box.bottom <= rect.top + 1 || box.top >= rect.bottom - 1 || box.right <= rect.left + 1 || box.left >= rect.right - 1,
      );
      const targetVisible =
        !targetBox || box.bottom <= targetBox.top || box.top >= targetBox.bottom || box.right <= targetBox.left || box.left >= targetBox.right;
      return {
        left: box.left - viewport.left,
        right: box.right - viewport.left,
        top: box.top - viewport.top,
        bottom: box.bottom - viewport.top,
        width: viewport.width,
        height: viewport.height,
        scrollHeight: bubble.scrollHeight,
        clientHeight: bubble.clientHeight,
        overflowY: getComputedStyle(bubble).overflowY,
        targetVisible,
        targetBox,
        controlsAbove,
        hasTail: getComputedStyle(bubble, '::after').display !== 'none' && getComputedStyle(bubble, '::after').content !== 'none',
        touchControlsHidden: ['.touchpad', '#touch-run'].every(selector => getComputedStyle(document.querySelector(selector)).display === 'none'),
        nextText: document.querySelector('#speech-next').textContent,
      };
    });
    assert.ok(result.left >= -1 && result.right <= result.width + 1, `${label}: within map bounds ${JSON.stringify(result)}`);
    assert.ok(Math.abs((result.left + result.right) / 2 - result.width / 2) <= 1, `${label}: horizontally centered ${JSON.stringify(result)}`);
    assert.ok(result.targetVisible, `${label}: speaker remains visible ${JSON.stringify(result)}`);
    assert.ok(result.controlsAbove, `${label}: panel clears touch controls ${JSON.stringify(result)}`);
    assert.equal(result.hasTail, false, `${label}: no decorative arrow competes with the advance button`);
    if (text.length < 80) assert.ok(result.scrollHeight <= result.clientHeight, `${label}: short text has no overflow ${JSON.stringify(result)}`);
    assert.equal(result.nextText, 'Done', `${label}: the single advance action is clear`);
    return result;
  };

  const dismiss = async () => {
    await page.locator('#speech-next').click();
    await page.waitForSelector('#speech-bubble[hidden]', {state: 'hidden'});
  };
  const short = await report('desktop NPC', activeRanger.ref, 'Welcome to the old orchard trail.');
  assert.ok(short.bottom > short.height * 0.45, `desktop NPC panel stays in the lower map area ${JSON.stringify(short)}`);
  await dismiss();

  const long = await report(
    'desktop landmark',
    'narrator',
    'The old cider press. The last pressing was a good year; the apples here never stopped falling. '.repeat(18),
  );
  assert.ok(long.scrollHeight > long.clientHeight, `long landmark prose scrolls only when needed ${JSON.stringify(long)}`);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'speech-bubble', 'reader can focus and scroll the long panel');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'speech-next', 'keyboard focus reaches the sole advance action');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#speech-bubble[hidden]', {state: 'hidden'});

  await page.setViewportSize({width: 390, height: 844});
  await page.evaluate(() => {
    document.body.dataset.inputMode = 'touch';
  });
  const portrait = await report('phone portrait NPC', activeRanger.ref, 'A short field note beside the path.');
  await page.locator('#speech-next').tap();
  await page.waitForSelector('#speech-bubble[hidden]', {state: 'hidden'});
  const portraitLong = await report(
    'phone portrait landmark',
    'narrator',
    'A longer landmark description, with a clue about who used this place and why the trail bends toward the water. '.repeat(12),
  );
  assert.ok(portraitLong.scrollHeight > portraitLong.clientHeight, `portrait limits and scrolls long copy ${JSON.stringify(portraitLong)}`);
  await page.locator('#speech-next').tap();
  await page.waitForSelector('#speech-bubble[hidden]', {state: 'hidden'});

  await page.setViewportSize({width: 844, height: 390});
  await page.evaluate(() => {
    document.body.dataset.inputMode = 'touch';
  });
  const landscape = await report('phone landscape NPC', activeRanger.ref, 'The wetland path begins just beyond the reeds.');
  assert.ok(landscape.touchControlsHidden, `movement controls pause while dialogue owns input ${JSON.stringify(landscape)}`);
  await dismiss();

  await page.setViewportSize({width: 1280, height: 820});
  await page.evaluate(() => {
    delete document.body.dataset.inputMode;
  });
  await page.locator('#fullscreen').click();
  await page.waitForFunction(() => document.fullscreenElement);
  const fullscreen = await report('fullscreen NPC', activeRanger.ref, 'The ranger is still clear of this lower map caption.');
  assert.ok(fullscreen.bottom > fullscreen.height * 0.45, `fullscreen panel remains lower-centered ${JSON.stringify(fullscreen)}`);
  await dismiss();
  await page.evaluate(() => document.exitFullscreen());
  assert.deepEqual(errors, []);
  console.log(
    `ok #236 dialogue layout: desktop, phone portrait (${portrait.width}×${portrait.height}), landscape, fullscreen; NPC and landmark short/long, focus and touch/keyboard advance`,
  );
} finally {
  await browser.close();
  server.close();
}
