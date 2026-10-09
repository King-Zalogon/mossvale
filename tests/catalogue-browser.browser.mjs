import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, relative, resolve, sep} from 'node:path';
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {startCatalogueServer} from '../scripts/catalogue-visual.mjs';
import {ROOT} from '../scripts/lib/catalogue.mjs';
import {writePortableContext} from '../scripts/lib/catalogue-visuals.mjs';

const catalogue = JSON.parse(readFileSync(new URL('../content/catalogue/catalogue.json', import.meta.url), 'utf8'));
const visualCount = catalogue.entries.filter(entry => entry.kind === 'visual').length;
const server = await startCatalogueServer({port: 0});
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await page.request.get(`${origin}/fiche?id=actor%3Anot-a-visual`)).status(), 404);
  assert.equal((await page.request.get(`${origin}/asset?path=docs%2FFEEDBACK.md`)).status(), 404);
  assert.equal((await page.request.post(origin, {data: 'unexpected'})).status(), 405);
  await page.waitForFunction(count => document.querySelectorAll('.card').length === count, visualCount);
  assert.equal(await page.locator('#result-count').textContent(), `${visualCount} of ${visualCount} visual resources`);
  assert.equal(await page.locator('#element option').count(), 13);
  await page.locator('#element').selectOption({label: 'Fire'});
  await page.waitForFunction(() => document.querySelectorAll('.card').length === 6);
  assert.deepEqual(await page.locator('.card-title').allTextContents(), [
    'creature-cindercurl',
    'creature-cindercurl-combat',
    'creature-cindercurl-follower',
    'creature-emberkin',
    'creature-emberkin-combat',
    'creature-emberkin-follower',
  ]);
  await page.locator('#search').fill('flame-shaped curled tail');
  await page.waitForFunction(() => document.querySelectorAll('.card').length === 3);
  await page.locator('#search').fill('creature-emberkin-follower');
  await page.waitForFunction(() => document.querySelectorAll('.card').length === 1);
  const follower = page.locator('.card').first();
  await follower.focus();
  await page.keyboard.press('Enter');
  assert.match(await page.locator('#details h2').textContent(), /creature-emberkin-follower/);
  assert.match(await page.locator('#details').textContent(), /idle \/ south/);
  assert.match(await page.locator('#details').textContent(), /37-pixel game scale/);
  assert.equal(await page.locator('#details figure img').count(), 1);
  const detailImage = page.locator('#details img.full-preview').first();
  await detailImage.waitFor();
  await page.waitForFunction(() => document.querySelector('#details img.full-preview')?.naturalWidth > 0);
  await page.locator('#details input[type=checkbox]').check();
  assert.match(await page.locator('#copy-status').textContent(), /1 visual ID/);
  await page.locator('#search').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'kind', 'filters are reachable in a predictable keyboard order');
  await page.keyboard.press('Escape');
  assert.match(await page.locator('#details').textContent(), /Select a resource/);
  const preview = page.locator('.card img').first();
  assert.equal(await preview.getAttribute('loading'), 'lazy');
  assert.deepEqual(errors, []);
  const temp = mkdtempSync(join(tmpdir(), 'mossvale-catalogue-file-'));
  let fileNavigationBlocked = false;
  try {
    const portable = join(temp, 'context');
    writePortableContext({
      root: ROOT,
      output: portable,
      catalogue: JSON.parse(readFileSync(new URL('../content/catalogue/catalogue.json', import.meta.url), 'utf8')),
      facts: JSON.parse(readFileSync(new URL('../content/catalogue/facts.json', import.meta.url), 'utf8')),
      ids: ['visual:tree-oak', 'visual:creature-emberkin-follower'],
      appScript: readFileSync(new URL('../scripts/catalogue-browser/app.js', import.meta.url), 'utf8'),
      stylesheet: readFileSync(new URL('../scripts/catalogue-browser/styles.css', import.meta.url), 'utf8'),
    });
    let offline = await browser.newPage();
    offline.on('pageerror', error => errors.push(error.message));
    try {
      await offline.goto(pathToFileURL(join(portable, 'index.html')).href);
    } catch (error) {
      if (!error.message.includes('ERR_BLOCKED_BY_ADMINISTRATOR')) throw error;
      // Some managed Chromium builds prohibit file:// navigation. Serve only the temporary export locally so its
      // self-contained routes/assets can still be exercised without falling back to the repository catalogue.
      fileNavigationBlocked = true;
      await offline.close();
      offline = await browser.newPage();
      offline.on('pageerror', error => errors.push(error.message));
      const mime = {html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png'};
      const offlineServer = http
        .createServer((request, response) => {
          const path = resolve(portable, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
          const rel = relative(resolve(portable), path);
          if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || !existsSync(path)) return void response.writeHead(404).end();
          response.writeHead(200, {'content-type': mime[path.split('.').pop()] ?? 'application/octet-stream'}).end(readFileSync(path));
        })
        .listen(0);
      offline.once('close', () => offlineServer.close());
      await offline.goto(`http://127.0.0.1:${offlineServer.address().port}/index.html`);
    }
    await offline.waitForFunction(count => document.querySelectorAll('.card').length === count, visualCount);
    await offline.locator('#search').fill('tree oak');
    await offline.waitForFunction(() => document.querySelectorAll('.card').length >= 1);
    assert.equal(await offline.locator('#search').inputValue(), 'tree oak');
    assert.ok(errors.length === 0, errors.join('; '));
    await offline.close();
  } finally {
    rmSync(temp, {recursive: true, force: true});
  }
  console.log(
    'ok local visual catalogue filters, accessible selection/details, cropped atlas previews, lazy loading and portable browsing' +
      (fileNavigationBlocked ? ' (local static fallback: file:// blocked by browser policy)' : ' (file://)'),
  );
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
