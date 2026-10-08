// Browser checks for character atlas previews, state transitions and the production world renderer.
import {chromium} from 'playwright';
import http from 'node:http';
import {existsSync, readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

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
  const idlePixels = await page.evaluate(async () => {
    const response = await fetch('./assets/people/person-red-cap-motion.png');
    const bitmap = await createImageBitmap(await response.blob());
    const sample = document.createElement('canvas');
    sample.width = 52;
    sample.height = 83;
    const context = sample.getContext('2d', {willReadFrequently: true});
    context.imageSmoothingEnabled = false;
    return Array.from({length: 8}, (_, row) => {
      context.clearRect(0, 0, sample.width, sample.height);
      context.drawImage(bitmap, 0, row * 256, 160, 256, 0, 0, sample.width, sample.height);
      const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
      let bottom = -1;
      let bootMin = sample.width;
      let bootMax = -1;
      for (let y = 0; y < sample.height; y++) {
        for (let x = 0; x < sample.width; x++) {
          const at = (y * sample.width + x) * 4;
          const [red, green, blue, alpha] = pixels.slice(at, at + 4);
          if (alpha > 8) bottom = y;
          if (y >= 69 && alpha > 80 && red > 70 && red > green * 1.25 && red > blue * 1.2) {
            bootMin = Math.min(bootMin, x);
            bootMax = Math.max(bootMax, x);
          }
        }
      }
      return {row, bottom, bootWidth: bootMax - bootMin + 1};
    });
  });
  assert.equal(idlePixels.length, 8);
  assert.ok(
    idlePixels.every(frame => frame.bottom === idlePixels[0].bottom),
    `idle feet share one ground line: ${JSON.stringify(idlePixels)}`,
  );
  assert.ok(
    idlePixels.every(frame => frame.bootWidth > 0 && frame.bootWidth <= 28),
    `neutral idle boots stay close at the 52 px gameplay scale: ${JSON.stringify(idlePixels)}`,
  );
  assert.deepEqual(
    await page.evaluate(() => [
      window.characterPreview.frameFor(0, false),
      window.characterPreview.frameFor(0, true),
      window.characterPreview.frameFor(0.56, true),
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
  await page.screenshot({path: join(tmpdir(), 'mossvale-character-preview.png'), fullPage: true});
  await page.goto(`http://localhost:${server.address().port}/player-idle-review.html`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  assert.equal(await page.locator('.comparison').count(), 8, 'before/after evidence shows all runtime facings');
  assert.equal(await page.locator('.comparison canvas').count(), 16, 'before/after evidence compares each facing at game scale');
  if (process.env.MOSSVALE_PLAYER_IDLE_REVIEW_DIR)
    await page.screenshot({path: join(process.env.MOSSVALE_PLAYER_IDLE_REVIEW_DIR, '239-player-idle-before-after.png'), fullPage: true});
  assert.deepEqual(errors, []);
  console.log('ok character atlas preview, distance cadence, idle/reduced-motion state, renderer depth order and foreground occlusion');
} finally {
  await browser.close();
  server.close();
}
