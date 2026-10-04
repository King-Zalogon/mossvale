// Exercise the 12-entry habitat journal and touch interruption in portrait and landscape emulation.
import {chromium} from 'playwright';
import http from 'node:http';
import {readFileSync, existsSync} from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../dist/', import.meta.url);
const types = {html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', json: 'application/json', svg: 'image/svg+xml'};
const server = http
  .createServer((request, response) => {
    const name = decodeURIComponent(request.url.split('?')[0].slice(1) || 'index.html');
    const file = new URL(name, root);
    if (!existsSync(file)) return void response.writeHead(404).end();
    response.writeHead(200, {'content-type': types[name.split('.').pop()] ?? 'application/octet-stream'}).end(readFileSync(file));
  })
  .listen(0);
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
try {
  // Start in phone landscape to cover the orientation where the width-only
  // responsive breakpoint previously hid every movement control.
  const context = await browser.newContext({viewport: {width: 844, height: 390}, hasTouch: true, isMobile: true});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://localhost:${server.address().port}/?debug&seed=31`);
  await page.waitForSelector('#loading', {state: 'hidden'});
  assert.equal(await page.locator('.touchpad').evaluate(node => getComputedStyle(node).display), 'grid', 'landscape startup exposes touch movement');
  assert.equal(await page.locator('#touch-run').evaluate(node => getComputedStyle(node).display), 'block', 'landscape startup exposes touch run');
  for (const viewport of [
    {width: 390, height: 844},
    {width: 844, height: 390},
    {width: 320, height: 568},
  ]) {
    await page.setViewportSize(viewport);
    await page.keyboard.press('j');
    await page.waitForSelector('#modal[aria-modal="true"]');
    const journal = await page.evaluate(() => {
      const modal = document.querySelector('#modal');
      const cards = [...modal.querySelectorAll('.journal-grid .species')];
      return {
        count: cards.length,
        unknown: cards.filter(card => !card.querySelector('h3')?.textContent.trim()).length,
        missingHint: cards.filter(
          card =>
            ![...card.querySelectorAll('small')].some(small =>
              /field clue|try the tall grass|start in the|look where|search|listen|watch|follow|check|look for/i.test(small.textContent),
            ),
        ).length,
        overflowX: Math.max(modal.scrollWidth - modal.clientWidth, document.documentElement.scrollWidth - innerWidth),
      };
    });
    assert.deepEqual(journal, {count: 12, unknown: 0, missingHint: 0, overflowX: 0}, `${viewport.width}×${viewport.height}`);
    await page.keyboard.press('Escape');
    await page.waitForSelector('#modal', {state: 'hidden'});
  }

  const pad = page.locator('button[data-dir="1,0"]');
  await pad.waitFor({state: 'visible'});
  const box = await pad.boundingBox();
  const cdp = await context.newCDPSession(page);
  const before = await page.evaluate(() => window.mossvale.getState().player);
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2}]});
  await page.waitForFunction(p => Math.hypot(window.mossvale.getState().player.x - p.x, window.mossvale.getState().player.y - p.y) > 0.2, before, {
    timeout: 5000,
  });
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchCancel', touchPoints: []});
  await page.waitForTimeout(400);
  const stopped = await page.evaluate(() => window.mossvale.getState().player);
  await page.waitForTimeout(300);
  const stillStopped = await page.evaluate(() => window.mossvale.getState().player);
  assert.ok(Math.hypot(stopped.x - stillStopped.x, stopped.y - stillStopped.y) < 0.02, 'pointer cancellation releases touch movement');

  const landscapeInterruptStart = await page.evaluate(() => window.mossvale.getState().player);
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{id: 2, x: box.x + box.width / 2, y: box.y + box.height / 2}]});
  await page.waitForFunction(
    p => Math.hypot(window.mossvale.getState().player.x - p.x, window.mossvale.getState().player.y - p.y) > 0.2,
    landscapeInterruptStart,
    {
      timeout: 5000,
    },
  );
  await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
  await page.waitForTimeout(300);
  const orientationStopped = await page.evaluate(() => window.mossvale.getState().player);
  await page.waitForTimeout(300);
  const orientationStillStopped = await page.evaluate(() => window.mossvale.getState().player);
  assert.ok(
    Math.hypot(orientationStopped.x - orientationStillStopped.x, orientationStopped.y - orientationStillStopped.y) < 0.02,
    'orientation change releases touch movement',
  );
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchCancel', touchPoints: []});

  const stateBeforeResize = await page.evaluate(() => ({mapId: window.mossvale.getState().save.mapId, coins: window.mossvale.getState().save.coins}));
  await page.setViewportSize({width: 667, height: 390});
  const safeBounds = await page.evaluate(() => {
    const viewport = document.querySelector('.viewport').getBoundingClientRect();
    const east = document.querySelector('#touch-run').getBoundingClientRect();
    return {viewportWidth: viewport.width, eastRight: east.right, windowWidth: innerWidth, xOverflow: document.documentElement.scrollWidth - innerWidth};
  });
  assert.ok(safeBounds.eastRight <= safeBounds.windowWidth + 1, 'run control remains inside the landscape viewport');
  assert.ok(safeBounds.xOverflow <= 1, 'landscape layout has no horizontal page overflow');
  assert.deepEqual(
    await page.evaluate(() => ({mapId: window.mossvale.getState().save.mapId, coins: window.mossvale.getState().save.coins})),
    stateBeforeResize,
  );

  // Exercise movement and run by touch in landscape, not by locator click.
  const landscapePad = page.locator('button[data-dir="1,0"]');
  const landscapePadBox = await landscapePad.boundingBox();
  const landscapeStart = await page.evaluate(() => window.mossvale.getState().player);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{id: 3, x: landscapePadBox.x + landscapePadBox.width / 2, y: landscapePadBox.y + landscapePadBox.height / 2}],
  });
  await page.waitForFunction(p => Math.hypot(window.mossvale.getState().player.x - p.x, window.mossvale.getState().player.y - p.y) > 0.2, landscapeStart, {
    timeout: 5000,
  });
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  const run = await page.locator('#touch-run').boundingBox();
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{id: 4, x: run.x + run.width / 2, y: run.y + run.height / 2}],
  });
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  assert.equal(await page.locator('#touch-run').getAttribute('aria-pressed'), 'true', 'landscape touch toggles run');
  assert.deepEqual(errors, []);
  await context.close();
  console.log('ok 12-creature journal hints and touch interruption across portrait/landscape sizes');
} finally {
  await browser.close();
  server.close();
}
