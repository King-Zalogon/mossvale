// Anchored dialogue rendering, viewport clamping, input lock and focus recovery for #84.
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
  const page = await browser.newPage({viewport: {width: 390, height: 844}, reducedMotion: 'reduce'});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://localhost:${server.address().port}/?debug`);
  await page.waitForFunction(() => window.mossvale && document.querySelector('#loading').hidden);
  await page.evaluate(() =>
    window.mossvale.previewSpeech([
      {speaker: 'ranger', text: 'The orchard path is open.'},
      {speaker: 'player', text: 'I will look for the old stone gate.'},
      {speaker: 'narrator', text: 'A long note follows. '.repeat(18)},
    ]),
  );
  const bounds = async () =>
    page.locator('#speech-bubble').evaluate(el => {
      const rect = el.getBoundingClientRect();
      const parent = el.parentElement.getBoundingClientRect();
      return {
        left: rect.left - parent.left,
        right: rect.right - parent.left,
        top: rect.top - parent.top,
        bottom: rect.bottom - parent.top,
        width: parent.width,
        height: parent.height,
      };
    });
  assert.equal(await page.locator('#speech-bubble').getAttribute('aria-live'), 'polite');
  assert.equal(await page.locator('#speech-speaker').textContent(), 'Ranger Iris');
  let box = await bounds();
  assert.ok(box.left >= 0 && box.right <= box.width, JSON.stringify(box));
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(180);
  const location = await page.evaluate(() => ({x: window.mossvale.getState().player.x, y: window.mossvale.getState().player.y}));
  assert.deepEqual(location, {x: 12, y: 13}, 'movement is locked while the speaker bubble is active');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#speech-speaker').textContent(), 'You');
  await page.keyboard.press('Enter');
  assert.ok((await page.locator('#speech-text').textContent()).length > 250, 'long dialogue remains readable in a small viewport');
  box = await bounds();
  assert.ok(box.left >= 0 && box.right <= box.width && box.top >= 0 && box.bottom <= box.height, JSON.stringify(box));
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'speech-bubble', 'keyboard can focus the scrollable reading area');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'speech-next', 'Tab stays within dialogue');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#speech-bubble').isHidden(), true, 'Escape dismisses and clears the line queue');
  await page.evaluate(() => {
    Object.assign(window.mossvale.getState().player, {x: 0, y: 0});
    window.mossvale.previewSpeech([{speaker: 'player', text: 'At the edge of the map.'}]);
  });
  await page.waitForTimeout(900);
  box = await bounds();
  assert.ok(box.left >= 0 && box.right <= box.width && box.top >= 0 && box.bottom <= box.height, JSON.stringify(box));
  await page.reload();
  assert.equal(await page.locator('#speech-bubble').isHidden(), true, 'a new pack page starts without stale dialogue');
  assert.deepEqual(errors, []);
  console.log('ok anchored dialogue, mobile bounds, reduced motion, movement lock and dismissal');
} finally {
  await browser.close();
  server.close();
}
