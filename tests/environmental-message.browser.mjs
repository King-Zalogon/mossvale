// Authored exploration messages get a dedicated light card without changing ordinary status toasts.
import {chromium} from 'playwright';
import http from 'node:http';
import {readFileSync, existsSync} from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../dist/', import.meta.url);
const types = {html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml'};
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
  const context = await browser.newContext({viewport: {width: 1280, height: 900}, hasTouch: true, isMobile: true, reducedMotion: 'reduce'});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://localhost:${server.address().port}/?debug&seed=93`);
  await page.waitForSelector('#loading', {state: 'hidden'});
  await page.evaluate(() => {
    const game = window.mossvale.getState();
    game.save.badges.push(0);
    window.mossvale.travel('amber-ridge');
  });
  await page.waitForFunction(() => window.mossvale.getState().world.map.id === 'amber-ridge');
  await page.evaluate(() => Object.assign(window.mossvale.getState().player, {x: 24, y: 46}));
  await page.waitForSelector('#environment-message:not([hidden])');
  assert.match(await page.locator('#environment-message').textContent(), /Your footsteps echo/);
  assert.equal(await page.locator('#toast').getAttribute('data-active'), 'true', 'the generic travel toast remains on its original channel');
  assert.match(await page.locator('#toast').textContent(), /Amber Ridge/);
  assert.equal(await page.locator('#environment-message').getAttribute('aria-live'), 'polite');

  const geometry = async () =>
    page.evaluate(() => {
      const viewport = document.querySelector('.viewport');
      const box = selector => {
        const node = document.querySelector(selector);
        const rect = node.getBoundingClientRect();
        return {left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, display: getComputedStyle(node).display};
      };
      const message = box('#environment-message');
      const parent = viewport.getBoundingClientRect();
      const overlaps = other =>
        other.display !== 'none' && message.left < other.right && message.right > other.left && message.top < other.bottom && message.bottom > other.top;
      return {
        message: {
          ...message,
          left: message.left - parent.left,
          right: message.right - parent.left,
          top: message.top - parent.top,
          bottom: message.bottom - parent.top,
        },
        size: {width: parent.width, height: parent.height},
        obstacles: Object.fromEntries(
          ['#world-tag', '#objective-pin', '.minimap-box', '.zoom-controls', '#interact', '.touchpad', '#touch-run', '#speech-bubble'].map(selector => [
            selector,
            overlaps(box(selector)),
          ]),
        ),
        background: getComputedStyle(document.querySelector('#environment-message')).backgroundColor,
        color: getComputedStyle(document.querySelector('#environment-message')).color,
        border: getComputedStyle(document.querySelector('#environment-message')).borderTopColor,
      };
    });
  const assertClear = async (label, shouldHideHud) => {
    const result = await geometry();
    assert.ok(
      result.message.left >= 0 && result.message.top >= 0 && result.message.right <= result.size.width && result.message.bottom <= result.size.height,
      `${label}: ${JSON.stringify(result)}`,
    );
    assert.ok(
      Object.values(result.obstacles).every(value => !value),
      `${label}: message overlaps an active control: ${JSON.stringify(result.obstacles)}`,
    );
    assert.equal(result.background, 'rgb(255, 248, 220)', label + ': matches the dialogue light background');
    assert.equal(result.color, 'rgb(37, 56, 45)', label + ': uses dialogue text contrast');
    if (shouldHideHud) {
      for (const selector of ['.minimap-box', '.zoom-controls'])
        assert.equal(await page.locator(selector).evaluate(el => getComputedStyle(el).display), 'none', `${label}: temporary HUD placement is clear`);
    }
  };
  await assertClear('desktop', false);
  for (const viewport of [
    {width: 390, height: 844},
    {width: 320, height: 568},
    {width: 844, height: 390},
  ]) {
    await page.setViewportSize(viewport);
    await assertClear(`${viewport.width}x${viewport.height}`, viewport.width <= 600);
  }
  await page.evaluate(() => window.mossvale.previewSpeech([{speaker: 'ranger', text: 'A passing traveler joins the path.'}]));
  await page.waitForSelector('.viewport.speech-open');
  assert.equal(await page.locator('#environment-message').isVisible(), false, 'ambient copy yields to active NPC dialogue');
  assert.deepEqual(errors, []);
  await context.close();
  console.log('ok authored exploration message treatment, generic toast separation and desktop/mobile HUD spacing');
} finally {
  await browser.close();
  server.close();
}
