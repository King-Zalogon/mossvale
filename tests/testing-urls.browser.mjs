// Menu navigation and every review URL work in a checkout and a packaged subdirectory.
import {chromium} from 'playwright';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {extname, join} from 'node:path';
import assert from 'node:assert/strict';
import {PREPARED_CREATURE_IDS} from '../dist/src/creature-preview-resources.js';

const build = mkdtempSync(join(tmpdir(), 'mossvale-testing-urls-'));
const dist = new URL('../dist/', import.meta.url);
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml'};
const server = http.createServer((req, res) => {
  const [mount, ...parts] = new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean);
  const name = parts.join('/') || 'index.html';
  const file = mount === 'game' ? join(build, name) : new URL(name, dist);
  if (!existsSync(file) || !statSync(file).isFile()) return void res.writeHead(404).end();
  res.writeHead(200, {'content-type': types[extname(name)] ?? 'application/octet-stream'}).end(readFileSync(file));
});
let browser;
try {
  execFileSync(process.execPath, ['scripts/build.mjs'], {env: {...process.env, BUILD_DIR: build}, stdio: 'pipe'});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
  const errors = [];
  for (const mount of ['source', 'game']) {
    const page = await browser.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/${mount}/`);
    await page.waitForSelector('#m-primary');
    const link = page.getByRole('link', {name: /^Testing URLs/});
    await link.focus();
    const opening = page.waitForEvent('popup');
    await page.keyboard.press('Enter');
    const index = await opening;
    await index.waitForLoadState();
    assert.equal(index.url(), `${base}/${mount}/testing.html`, 'relative navigation keeps the build prefix');
    assert.equal(await index.evaluate(() => window.opener === null), true, 'new tab has no opener access');
    assert.equal(page.url(), `${base}/${mount}/`, 'game remains open');
    assert.equal(await index.getByRole('heading', {name: 'Testing URLs'}).count(), 1);
    const links = index.getByRole('navigation', {name: 'Testing pages'}).getByRole('link');
    assert.equal(await links.count(), 7 + PREPARED_CREATURE_IDS.length);
    for (const id of PREPARED_CREATURE_IDS) assert.equal(await links.filter({hasText: new RegExp(id, 'i')}).count(), 1);
    for (const entry of await links.all()) {
      const href = await entry.getAttribute('href');
      const response = await index.request.get(new URL(href, index.url()).href);
      assert.equal(response.status(), 200, `${mount}/${href} is packaged and available`);
      await entry.focus();
      const opened = index.waitForEvent('popup');
      await index.keyboard.press('Enter');
      const preview = await opened;
      preview.on('pageerror', e => errors.push(e.message));
      await preview.waitForLoadState();
      assert.equal(preview.url(), `${base}/${mount}/${href}`);
      if (PREPARED_CREATURE_IDS.some(id => href === `${id}-preview.html`))
        await preview.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('Ready:'));
      if (href === 'creature-follower-preview.html')
        await preview.waitForFunction(
          ids => ids.every(id => [...document.querySelectorAll('#species option')].some(option => option.value === id)),
          PREPARED_CREATURE_IDS,
        );
      if (href === 'creature-combat-preview.html')
        await preview.waitForFunction(ids => ids.every(id => document.querySelectorAll(`canvas[data-species="${id}"]`).length === 20), PREPARED_CREATURE_IDS);
      await preview.close();
    }
    assert.equal(await page.evaluate(async () => (await import('./src/data/species.js')).species.length), 18, 'review tabs do not extend the adventure roster');
    await index.close();
    await page.close();
    const game = await browser.newPage({viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true});
    await game.goto(`${base}/${mount}/?debug&seed=3`);
    await game.waitForSelector('#loading', {state: 'hidden'});
    await game.keyboard.press('Escape');
    const touchLink = game.getByRole('link', {name: /^Testing URLs/});
    await touchLink.scrollIntoViewIfNeeded();
    const touchOpened = game.waitForEvent('popup');
    await touchLink.tap();
    const touchIndex = await touchOpened;
    await touchIndex.waitForLoadState();
    assert.equal(touchIndex.url(), `${base}/${mount}/testing.html`);
    await touchIndex.close();
    await game.close();
  }
  assert.deepEqual(errors, []);
  console.log('ok Testing URLs keyboard/title and touch/game-menu navigation, safe new tabs, all twelve pages in source and packaged subdirectories');
} finally {
  await browser?.close();
  server.close();
  rmSync(build, {recursive: true, force: true});
}
