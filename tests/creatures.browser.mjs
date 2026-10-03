// Shared creature idle/travel/event animation states and reduced-motion behavior.
import {chromium} from 'playwright';
import http from 'node:http';
import {existsSync, readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../dist/', import.meta.url);
const types = {html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml'};
const server = http
  .createServer((request, response) => {
    const name = decodeURIComponent(request.url.split('?')[0].slice(1) || 'index.html');
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
  await page.goto(`http://localhost:${server.address().port}/?debug&seed=3`);
  await page.waitForSelector('#loading', {state: 'hidden'});
  await page.evaluate(() => window.mossvale.encounter(1));
  await page.waitForSelector('#fight-buddy');
  const idle = await page.evaluate(() => [
    document.querySelector('#fight-buddy').classList.contains('creature-idle'),
    getComputedStyle(document.querySelector('#fight-buddy')).animationName,
    getComputedStyle(document.querySelector('#fight-wild')).animationName,
  ]);
  assert.deepEqual(idle, [true, 'creature-breathe', 'creature-breathe']);

  await page.emulateMedia({reducedMotion: 'reduce'});
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#fight-buddy')).animationName), 'none');
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await page.waitForFunction(
    () =>
      !matchMedia('(prefers-reduced-motion: reduce)').matches && getComputedStyle(document.querySelector('#fight-buddy')).animationName === 'creature-breathe',
  );

  await page.click('#attack');
  await page.waitForFunction(
    () =>
      document.querySelector('#fight-buddy')?.classList.contains('attack') &&
      getComputedStyle(document.querySelector('#fight-buddy')).animationName === 'attack',
  );
  await page.waitForFunction(() => document.querySelector('#fight-wild')?.classList.contains('hit'));
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#fight-wild')).animationName), 'hit');

  await page.evaluate(() => (window.mossvale.getState().battle.hp = 1));
  await page.click('#catch');
  await page.waitForFunction(() => document.querySelector('#fight-wild')?.classList.contains('catching'));
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#fight-wild')).animationName), 'creature-capture');
  assert.deepEqual(errors, []);
  console.log('ok creature idle, strike, recoil and capture states respect reduced motion');
} finally {
  await browser.close();
  server.close();
}
