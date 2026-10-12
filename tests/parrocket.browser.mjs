import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, mkdirSync} from 'node:fs';
import http from 'node:http';

const root = new URL('../dist/', import.meta.url);
const types = {html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', json: 'application/json'};
const server = http
  .createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
    const file = new URL(path, root);
    if (!existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, {'content-type': types[path.split('.').pop()] ?? 'application/octet-stream'}).end(readFileSync(file));
  })
  .listen(0);
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
try {
  const page = await browser.newPage({viewport: {width: 1300, height: 950}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://localhost:${server.address().port}/parrocket-preview.html`);
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Ready:'));
  assert.equal(await page.locator('#directions canvas').count(), 40);
  assert.equal(await page.locator('#states canvas').count(), 20);
  assert.ok(
    await page.evaluate(() =>
      [...document.querySelectorAll('[data-kind]')].every(canvas => {
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        return data.some((v, i) => i % 4 === 3 && v > 0);
      }),
    ),
    'every actual-scale pose renders through the shared renderer',
  );
  const shapes = await page.locator('#directions canvas[data-column="0"]').evaluateAll(canvases => canvases.map(canvas => canvas.toDataURL()));
  assert.equal(new Set(shapes).size, 8);
  assert.notEqual(shapes[6], shapes[7]);
  if (process.env.WRITE_PARROCKET_REVIEW === '1') {
    const folder = new URL('../art/characters/reviews/parrocket/', import.meta.url);
    mkdirSync(folder, {recursive: true});
    await page.locator('#directions').screenshot({path: new URL('directions.png', folder).pathname});
    await page.locator('#states').screenshot({path: new URL('combat.png', folder).pathname});
    await page.screenshot({path: new URL('page.png', folder).pathname, fullPage: true});
  }
  await page.locator('#action').selectOption('attack');
  await page.waitForFunction(() => document.querySelector('#playback').dataset.combatState === 'attack');
  await page.waitForFunction(() => document.querySelector('#playback').dataset.combatState === 'idle');
  await page.locator('#calm').check();
  for (const state of ['attack', 'hit', 'faint', 'capture']) {
    await page.locator('#action').selectOption(state);
    assert.equal(await page.locator('#playback').getAttribute('data-combat-state'), state);
    const frame = await page.locator('#playback').getAttribute('data-combat-frame');
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#playback').getAttribute('data-combat-frame'), frame, 'calm pose stays still');
  }
  await page.evaluate(async () => {
    const {sprites, drawCreatureAnimated} = await import('./src/render/sprites.js');
    const {spriteId} = await import('./src/data/assets.js');
    const {species} = await import('./src/data/species.js');
    sprites[spriteId('creature-parrocket-combat')] = null;
    drawCreatureAnimated(
      document.querySelector('#playback'),
      species.findIndex(s => s.id === 'parrocket'),
      115,
      'attack',
      true,
    );
  });
  assert.equal(await page.locator('#playback').getAttribute('data-combat-asset'), 'creature-parrocket');
  await page.setViewportSize({width: 390, height: 844});
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'preview stays within phone width');
  assert.deepEqual(errors, []);
  console.log('ok optional Parrocket resource: 60 actual-scale poses, distinct directions, attack playback, calm states, portrait fallback and mobile bounds');
} finally {
  await browser.close();
  server.close();
}
