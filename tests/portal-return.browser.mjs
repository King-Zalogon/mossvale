// Verifies that a configured private portal return saves before same-tab navigation,
// while a standalone build has no portal control. Run with the browser suite.
import {chromium} from 'playwright';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';

const build = mkdtempSync(join(tmpdir(), 'mossvale portal browser '));
let browser;
const contentTypes = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript',
  css: 'text/css',
  png: 'image/png',
  json: 'application/json',
  svg: 'image/svg+xml',
};
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/dashboard') {
    res.writeHead(200, {'content-type': contentTypes.html}).end('<!doctype html><title>Zalonline workspace</title><main>Workspace dashboard</main>');
    return;
  }
  const [mount, ...parts] = pathname.split('/').filter(Boolean);
  const root = mount === 'configured' ? build : new URL('../dist/', import.meta.url);
  const name = parts.join('/') || 'index.html';
  const file = typeof root === 'string' ? join(root, name) : new URL(name, root);
  if (!existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {'content-type': contentTypes[name.split('.').pop()] ?? 'application/octet-stream'}).end(readFileSync(file));
});

try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  execFileSync('node', ['scripts/build.mjs'], {
    env: {...process.env, BUILD_DIR: build, MOSSVALE_PORTAL_RETURN_URL: `${base}/dashboard`},
    stdio: 'pipe',
  });
  browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});

  const plain = await browser.newPage();
  await plain.goto(`${base}/plain/`);
  await plain.waitForSelector('#m-primary');
  assert.equal(await plain.locator('#m-return-dashboard').count(), 0, 'standalone title menu has no portal link');
  await plain.goto(`${base}/plain/?debug`);
  await plain.waitForSelector('#loading', {state: 'hidden'});
  await plain.keyboard.press('Escape');
  await plain.waitForSelector('#modal:not([hidden])');
  assert.equal(await plain.locator('#m-return-dashboard').count(), 0, 'standalone in-game menu has no portal link');

  const configuredTitle = await browser.newPage();
  await configuredTitle.goto(`${base}/configured/`);
  await configuredTitle.waitForSelector('#m-primary');
  assert.equal(await configuredTitle.locator('#m-return-dashboard').count(), 0, 'the action is only in the in-game menu');
  await configuredTitle.close();

  const ctx = await browser.newContext({viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true});
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/configured/?debug`);
  await page.waitForSelector('#loading', {state: 'hidden'});
  await page.evaluate(() => (window.mossvale.getState().save.coins = 731));
  await page.keyboard.press('Escape');
  await page.waitForSelector('#m-return-dashboard');
  assert.equal(await page.locator('#m-return-dashboard').isVisible(), true, 'configured in-game menu offers a touchable return button');
  await page.locator('#m-return-dashboard').tap();
  await page.waitForURL(`${base}/dashboard`);
  assert.match(await page.textContent('main'), /Workspace dashboard/, 'return opens in this tab');
  const savedCoins = await page.evaluate(() => JSON.parse(localStorage.getItem('mossvale-v3')).coins);
  assert.equal(savedCoins, 731, 'latest progress is saved before leaving');
  await page.goto(`${base}/configured/?debug`);
  await page.waitForSelector('#loading', {state: 'hidden'});
  await page.waitForFunction(() => window.mossvale?.getState().save.coins === 731);
  assert.deepEqual(errors, []);
  await ctx.close();

  const blockedCtx = await browser.newContext();
  const blockedPage = await blockedCtx.newPage();
  await blockedPage.goto(`${base}/configured/?debug`);
  await blockedPage.waitForSelector('#loading', {state: 'hidden'});
  const storageBlocked = await blockedPage.evaluate(() => {
    window.mossvale.getState().save.coins = 900;
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'mossvale-v3') throw new Error('storage denied');
      return originalSetItem.call(this, key, value);
    };
    try {
      localStorage.setItem('mossvale-v3', 'blocked write probe');
      return false;
    } catch {
      return true;
    }
  });
  assert.equal(storageBlocked, true, 'the storage failure is armed');
  await blockedPage.keyboard.press('Escape');
  await blockedPage.waitForSelector('#m-return-dashboard');
  await blockedPage.locator('#m-return-dashboard').focus();
  await blockedPage.keyboard.press('Enter');
  await blockedPage.waitForTimeout(100);
  assert.equal(blockedPage.url(), `${base}/configured/?debug`, 'failed persistence keeps the player in the game');
  assert.match(await blockedPage.locator('#toast').evaluate(node => node.textContent), /could not be saved/i);
  await blockedCtx.close();
  await plain.close();
  console.log('ok configured dashboard return saves, reloads and stays keyboard/touch accessible');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  rmSync(build, {recursive: true, force: true});
}
