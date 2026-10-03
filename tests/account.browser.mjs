import {chromium} from 'playwright';
import http from 'node:http';
import {existsSync, readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../dist/', import.meta.url);
const types = {html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml'};
const server = http
  .createServer((request, response) => {
    const file = new URL(request.url.split('?')[0].slice(1) || 'index.html', root);
    if (!existsSync(file)) return void response.writeHead(404).end();
    response.writeHead(200, {'content-type': types[file.pathname.split('.').pop()] || 'application/octet-stream'}).end(readFileSync(file));
  })
  .listen(0);
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
try {
  const page = await browser.newPage({viewport: {width: 390, height: 844}, reducedMotion: 'reduce'});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const account = {canReview: true, account: 'player@example.test', accountId: '4e566c44-4867-4cce-b322-d3490d2a285e'};
  const sends = [];
  let offline = true;
  let exhausted = false;
  let rejectAuth = false;
  await page.route('**/api/feedback', async route => {
    if (rejectAuth) return route.fulfill({status: 401, json: {error: 'Please sign in again.'}});
    if (route.request().method() === 'GET') return route.fulfill({json: {...account, remaining: exhausted ? 0 : 10, dailyLimit: 10, maxCharacters: 2000}});
    sends.push(route.request().postDataJSON());
    if (offline) return route.abort();
    await new Promise(resolve => setTimeout(resolve, 120));
    await route.fulfill({json: {remaining: 9, id: 'saved', createdAt: new Date().toISOString()}});
  });
  await page.route('**/api/feedback-review', route =>
    route.fulfill({json: {instructions: 'Review private feedback', feedback: [{id: 'source', message: 'Improve trails'}]}}),
  );
  let save = {revision: 0, backup: null, ...account};
  let conflict = false;
  await page.route('**/api/account-save?*', route => route.fulfill({json: save}));
  await page.route('**/api/account-save', route => {
    if (conflict) return route.fulfill({status: 409, json: {error: 'Another device changed your account save.'}});
    const body = route.request().postDataJSON();
    assert.equal(body.revision, save.revision);
    save = {...account, backup: body.backup, revision: save.revision + 1, updatedAt: '2026-10-03T12:00:00Z'};
    return route.fulfill({json: {revision: save.revision, updatedAt: save.updatedAt}});
  });
  await page.goto(`http://localhost:${server.address().port}/?debug`);
  await page.waitForFunction(() => window.mossvale && document.querySelector('#loading').hidden);
  await page.keyboard.press('Escape');
  await page.click('#m-feedback');
  await page.waitForSelector('#feedback-text');
  assert.equal(await page.locator('#feedback-send').isDisabled(), true);
  await page.fill('#feedback-text', 'a'.repeat(2001));
  assert.equal(await page.locator('#feedback-send').isDisabled(), true);
  await page.fill('#feedback-text', 'The orchard needs clearer paths. Also improve map shortcuts.');
  await page.keyboard.press('Shift+Tab'); // from textarea -> close button
  await page.keyboard.press('Shift+Tab'); // wraps from first control -> last control
  assert.equal(await page.evaluate(() => document.activeElement.id), 'f-back');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'feedback-text');
  await page.click('#feedback-send');
  await page.waitForFunction(() => document.querySelector('#feedback-status').textContent.includes('Could not confirm'));
  assert.ok((await page.inputValue('#feedback-text')).includes('orchard'));
  offline = false;
  await page.click('#feedback-send');
  assert.equal(await page.locator('#feedback-send').isDisabled(), true);
  await page.waitForFunction(() => document.querySelector('#feedback-status').textContent.includes('feedback was saved'));
  assert.equal(sends.length, 2);
  assert.equal(sends[0].requestId, sends[1].requestId, 'retry preserves idempotency key');
  assert.equal(sends[1].accountId, account.accountId);
  assert.equal(await page.inputValue('#feedback-text'), '');
  const downloadPromise = page.waitForEvent('download');
  await page.click('#f-review');
  assert.equal((await downloadPromise).suggestedFilename(), 'mossvale-private-feedback.json');
  await page.click('#f-back');
  exhausted = true;
  await page.click('#m-feedback');
  await page.waitForSelector('#feedback-text');
  await page.fill('#feedback-text', 'One more idea');
  assert.equal(await page.locator('#feedback-send').isDisabled(), true, 'quota cannot be bypassed by editing');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#modal').isHidden(), true);
  await page.keyboard.press('Escape');
  await page.click('#m-account-save');
  await page.waitForFunction(() => !document.querySelector('#account-upload').disabled);
  await page.click('#account-upload');
  await page.waitForFunction(() => document.querySelector('#account-status').textContent.includes('checkpoint saved'));
  assert.equal(save.backup.kind, 'mossvale-save-backup');
  const before = await page.evaluate(() => window.mossvale.getState().save.coins);
  await page.click('#account-restore');
  await page.waitForSelector('#account-confirm');
  assert.equal(await page.evaluate(() => window.mossvale.getState().save.coins), before, 'restore requires confirmation');
  await page.click('#account-cancel');
  await page.waitForFunction(() => !document.querySelector('#account-upload').disabled);
  conflict = true;
  await page.click('#account-upload');
  await page.waitForFunction(() => document.querySelector('#account-status').textContent.includes('Another device'));
  assert.equal(await page.locator('#account-upload').isDisabled(), true);
  await page.click('#account-back');
  conflict = false;
  await page.click('#m-account-save');
  await page.waitForFunction(() => !document.querySelector('#account-restore').disabled);
  await page.evaluate(() => {
    window.mossvale.getState().save.coins += 7;
  });
  await page.click('#account-restore');
  await page.waitForSelector('#account-confirm');
  const reload = page.waitForEvent('load');
  await page.click('#account-confirm');
  await reload;
  await page.waitForFunction(() => window.mossvale && document.querySelector('#loading').hidden);
  assert.equal(await page.evaluate(() => window.mossvale.getState().save.coins), save.backup.save.coins);
  assert.notEqual(await page.evaluate(() => localStorage.getItem('mossvale-archive')), null, 'restoring keeps a local archive');
  await page.keyboard.press('Escape');
  rejectAuth = true;
  await page.click('#m-feedback');
  await page.waitForSelector('[role="alert"]');
  assert.match(await page.textContent('#modal'), /sign in again/);
  assert.equal(await page.locator('#feedback-text').count(), 0);
  assert.deepEqual(errors, []);
  console.log('ok feedback keyboard, Unicode limits, retry/quota/auth and account checkpoint/conflict/confirmation');
} finally {
  await browser.close();
  server.close();
}
