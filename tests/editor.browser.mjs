// Browser authoring regression for the map workshop (#74).
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
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://localhost:${server.address().port}/map-editor.html`);
  await page.waitForFunction(() => document.querySelector('#map-name')?.textContent.includes('25 × 25'));
  assert.match(await page.locator('#validation').textContent(), /Valid map data/);
  await page.selectOption('#terrain', 'p');
  await page.locator('#map-canvas').click({position: {x: 560, y: 250}});
  assert.match(await page.locator('#dirty').textContent(), /Unsaved/);
  await page.click('#undo');
  assert.equal(await page.locator('#dirty').textContent(), 'Saved');
  await page.click('#redo');
  await page.selectOption('#add-kind', 'landmark');
  await page.click('#add-content');
  const record = JSON.parse(await page.locator('#record').inputValue());
  record.role = 'optional-guide';
  await page.locator('#record').fill(JSON.stringify(record, null, 2));
  await page.click('#apply-record');
  assert.match(await page.locator('#validation').textContent(), /Valid map data/);
  const downloadPromise = page.waitForEvent('download');
  await page.click('#export');
  const download = await downloadPromise;
  const bytes = await readFileSync(await download.path(), 'utf8');
  const exported = JSON.parse(bytes);
  assert.equal(exported.id, 'meadow');
  assert.deepEqual(exported.size, {w: 25, h: 25});
  assert.ok(exported.terrain.every(row => row.length === exported.size.w));
  assert.ok(
    exported.landmarks.some(entity => entity.role === 'optional-guide'),
    `arbitrary runtime fields survive the JSON round trip: ${JSON.stringify(exported.landmarks.map(entity => ({id: entity.id, role: entity.role})))}`,
  );
  const large = structuredClone(exported);
  large.id = 'author-large-test';
  large.name = 'Author Large Test';
  large.size = {w: 64, h: 64};
  large.terrain = Array.from({length: 64}, () => 'g'.repeat(64));
  large.terrain = Array.from({length: 64}, () => 't'.repeat(64));
  large.authoring = {opaqueId: 'keep-this-field'};
  await page.locator('#file').setInputFiles({name: 'author-large-test.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(large))});
  await page.waitForFunction(() => document.querySelector('#map-name')?.textContent.includes('64 × 64'));
  assert.match(await page.locator('#validation').textContent(), /Valid map data/);
  const largeDownloadPromise = page.waitForEvent('download');
  await page.click('#export');
  const largeDownload = await largeDownloadPromise;
  const largeRoundTrip = JSON.parse(await readFileSync(await largeDownload.path(), 'utf8'));
  assert.deepEqual(largeRoundTrip.size, {w: 64, h: 64});
  assert.equal(largeRoundTrip.authoring.opaqueId, 'keep-this-field');
  assert.equal(largeRoundTrip.exits[0].id, large.exits[0].id);
  assert.deepEqual(errors, []);
  console.log('ok map painting, undo/redo, validation, role editing and JSON round trip');
} finally {
  await browser.close();
  server.close();
}
