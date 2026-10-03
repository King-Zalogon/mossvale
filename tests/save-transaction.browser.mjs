// Browser recovery checks for interrupted save operations. Run: node tests/save-transaction.browser.mjs
import {chromium} from 'playwright';
import http from 'node:http';
import {readFileSync, existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {exportBackup} from '../dist/src/services/backup.js';
import {KEYS} from '../dist/src/save.js';
import {codec, newSave} from './helpers.mjs';

const root = new URL('../dist/', import.meta.url);
const types = {html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', json: 'application/json', svg: 'image/svg+xml'};
const server = http
  .createServer((req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
    const file = new URL(name, root);
    if (!existsSync(file)) return void res.writeHead(404).end();
    res.writeHead(200, {'content-type': types[name.split('.').pop()] ?? 'application/octet-stream'}).end(readFileSync(file));
  })
  .listen(0);
const url = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});

const played = coins => {
  const save = newSave();
  Object.assign(save, {coins, wins: 2, met: true, playTime: 120, badges: [0]});
  save.caught.push(1);
  save.team[1] = {xp: 0, hp: 40};
  return save;
};

const faultAndSeed = async ({archive = played(15), current = played(40)} = {}) => {
  const context = await browser.newContext();
  await context.addInitScript(
    ({initial}) => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (this === window.localStorage && key === sessionStorage.getItem('__fault_key') && sessionStorage.getItem('__fault_used') !== '1') {
          originalSetItem.call(sessionStorage, '__fault_used', '1');
          throw new DOMException('quota exceeded', 'QuotaExceededError');
        }
        return originalSetItem.call(this, key, value);
      };
      for (const [key, value] of Object.entries(initial)) if (localStorage.getItem(key) === null) originalSetItem.call(localStorage, key, value);
    },
    {
      initial: {
        [KEYS.v3]: codec.serialize(current),
        [KEYS.backup]: codec.serialize(current),
        [KEYS.archive]: JSON.stringify({at: 'before', raw: codec.serialize(archive)}),
      },
    },
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const failedRequests = [];
  page.on('requestfailed', request => failedRequests.push(`${request.url()}: ${request.failure()?.errorText}`));
  await page.goto(url, {waitUntil: 'domcontentloaded'});
  try {
    await page.waitForSelector('#m-primary', {timeout: 20000});
  } catch (error) {
    console.error(
      'startup failed:',
      await page.locator('#load-title').textContent(),
      await page.locator('#load-status').textContent(),
      await page.locator('#load-detail').textContent(),
      await page.locator('#load-bar').getAttribute('value'),
      errors,
      failedRequests,
    );
    throw error;
  }
  return {context, page, errors};
};

const arm = (page, key) => page.evaluate(value => sessionStorage.setItem('__fault_key', value), key);
const reloadAfterClick = (page, selector) => Promise.all([page.waitForEvent('load'), page.click(selector)]);
const storedCoins = (page, key) =>
  page.evaluate(name => {
    const value = JSON.parse(localStorage.getItem(name));
    return name === 'mossvale-archive' ? JSON.parse(value.raw).coins : value.coins;
  }, key);
const assertRecoveredNotice = async page => {
  await page.click('#m-primary');
  if (await page.locator('#story-ok').count()) await page.click('#story-ok');
  await page.waitForFunction(() => document.querySelector('#modal')?.textContent.includes('Save recovery finished'));
  assert.match(await page.textContent('#modal'), /now synchronized/);
};

try {
  {
    const {context, page, errors} = await faultAndSeed();
    await arm(page, KEYS.v3);
    await page.click('#m-new');
    await reloadAfterClick(page, '#m-confirm-new');
    await page.waitForSelector('#m-primary');
    assert.equal(await page.textContent('#m-primary'), 'Start adventure');
    assert.equal(await storedCoins(page, KEYS.v3), 0);
    assert.equal(await storedCoins(page, KEYS.backup), 0);
    assert.equal(await storedCoins(page, KEYS.archive), 40);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), KEYS.transaction), null);
    await assertRecoveredNotice(page);
    assert.deepEqual(errors, []);
    await context.close();
    console.log('ok new adventure recovers a primary-write failure after reload');
  }
  {
    const {context, page, errors} = await faultAndSeed();
    await arm(page, KEYS.archive);
    await page.click('#m-restore');
    await reloadAfterClick(page, '#m-confirm-restore');
    await page.waitForSelector('#m-primary');
    assert.equal(await page.textContent('#m-primary'), 'Continue');
    assert.equal(await storedCoins(page, KEYS.v3), 15);
    assert.equal(await storedCoins(page, KEYS.backup), 15);
    assert.equal(await storedCoins(page, KEYS.archive), 40);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), KEYS.transaction), null);
    await assertRecoveredNotice(page);
    assert.deepEqual(errors, []);
    await context.close();
    console.log('ok archive restore keeps both adventures through an archive-write failure and reload');
  }
  {
    const {context, page, errors} = await faultAndSeed();
    await page.click('#m-backup');
    await page.click('#b-import');
    await page.setInputFiles('#b-file', {
      name: 'incoming.json',
      mimeType: 'application/json',
      buffer: Buffer.from(exportBackup(codec, played(7))),
    });
    await page.waitForSelector('#b-confirm');
    await arm(page, KEYS.backup);
    await reloadAfterClick(page, '#b-confirm');
    await page.waitForSelector('#m-primary');
    assert.equal(await page.textContent('#m-primary'), 'Continue');
    assert.equal(await storedCoins(page, KEYS.v3), 7);
    assert.equal(await storedCoins(page, KEYS.backup), 7);
    assert.equal(await storedCoins(page, KEYS.archive), 40);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), KEYS.transaction), null);
    await assertRecoveredNotice(page);
    assert.deepEqual(errors, []);
    await context.close();
    console.log('ok import recovers a checkpoint-write failure and reloads the imported adventure');
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
