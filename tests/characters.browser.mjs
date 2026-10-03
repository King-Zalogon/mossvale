// Browser checks for character atlas previews, state transitions and the production world renderer.
import {chromium} from 'playwright';
import http from 'node:http';
import {existsSync, readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../dist/', import.meta.url);
const types = {html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml'};
const server = http
  .createServer((request, response) => {
    const name = decodeURIComponent(request.url.split('?')[0].slice(1));
    const file = new URL(name, root);
    if (!existsSync(file)) return void response.writeHead(404).end();
    response.writeHead(200, {'content-type': types[name.split('.').pop()] || 'application/octet-stream'}).end(readFileSync(file));
  })
  .listen(0);
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
try {
  const page = await browser.newPage({viewport: {width: 1400, height: 1000}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://localhost:${server.address().port}/character-preview.html`);
  await page.waitForFunction(
    () => window.characterPreview && document.querySelectorAll('.pose-row').length === 8 && document.querySelectorAll('#npc-grid canvas').length === 8,
  );
  assert.equal(await page.locator('.pose-row').count(), 8);
  assert.equal(await page.locator('.pose-row canvas').count(), 48, 'idle, four walk frames and a loop per direction');
  assert.equal(await page.locator('#npc-grid canvas').count(), 8, 'four facings for each NPC');
  assert.deepEqual(
    await page.evaluate(() =>
      ['person-red-cap-motion', 'person-traveler', 'person-gardener'].map(name => Object.values(window.characterPreview.assets).includes(name)),
    ),
    [true, true, true],
  );
  assert.deepEqual(
    await page.evaluate(() => [
      window.characterPreview.frameFor(0, false),
      window.characterPreview.frameFor(0, true),
      window.characterPreview.frameFor(0.42, true),
      window.characterPreview.frameFor(2, true, true),
    ]),
    [0, 1, 2, 0],
  );

  await page.waitForFunction(() => window.characterPreview.rendererOrder().length > 0);
  const drawOrder = await page.evaluate(() => window.characterPreview.rendererOrder());
  const names = drawOrder.map(item => item.name);
  assert.ok(names.indexOf('person-traveler') < names.indexOf('person-red-cap-motion'), names.join(', '));
  assert.ok(names.indexOf('person-red-cap-motion') < names.indexOf('tree-oak'), names.join(', '));
  assert.ok(names.indexOf('tree-oak') < names.indexOf('person-gardener'), names.join(', '));
  assert.ok(drawOrder.find(item => item.name === 'tree-oak').alpha < 0.3, 'foreground tree is translucent over the player');

  await page.click('#toggle-walk');
  await page.waitForFunction(() => window.characterPreview.rendererState().frame === 0);
  await page.check('#reduced-motion');
  await page.waitForFunction(() => window.characterPreview.rendererState().reducedMotion === 'true' && window.characterPreview.rendererState().frame === 0);
  await page.uncheck('#reduced-motion');
  await page.click('#toggle-walk');
  await page.screenshot({path: '/tmp/mossvale-character-preview.png', fullPage: true});
  assert.deepEqual(errors, []);
  console.log('ok character atlas preview, distance cadence, idle/reduced-motion state, renderer depth order and foreground occlusion');
} finally {
  await browser.close();
  server.close();
}
