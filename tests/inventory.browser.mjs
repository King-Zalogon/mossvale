// Pack inventory can be bought at a ranger and moved into/out of the persistent stash.
import {chromium} from 'playwright';
import http from 'node:http';
import {readFileSync, existsSync} from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../dist/', import.meta.url);
const types = {html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', json: 'application/json', svg: 'image/svg+xml'};
const server = http
  .createServer((request, response) => {
    const name = request.url.split('?')[0].slice(1) || 'index.html';
    const file = new URL(name, root);
    if (!existsSync(file)) return void response.writeHead(404).end();
    response.writeHead(200, {'content-type': types[name.split('.').pop()] ?? 'application/octet-stream'}).end(readFileSync(file));
  })
  .listen(0);
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const url = `http://localhost:${server.address().port}/?debug&seed=7`;
  await page.goto(url);
  await page.waitForSelector('#loading', {state: 'hidden'});
  await page.waitForFunction(() => window.mossvale?.getState);
  await page.evaluate(() => {
    const save = window.mossvale.getState().save;
    save.coins = 10;
    save.inventory.coins = 10;
    Object.assign(window.mossvale.getState().player, {x: 10.3, y: 10.4});
    window.mossvale.interact();
  });
  await page.waitForSelector('#speech-next');
  await page.click('#speech-next');
  await page.waitForSelector('#speech-choices', {state: 'visible'});
  await page.click('#speech-next');
  await page.waitForSelector('#open-inventory');
  await page.click('#open-inventory');
  await page.waitForSelector('[data-stash="orb"]');
  await page.click('[data-pack-buy="potion"]');
  await page.waitForFunction(() => window.mossvale.getState().save.potions === 4);
  await page.click('[data-stash="orb"]');
  await page.waitForFunction(() => window.mossvale.getState().save.inventory.storage.orb === 1);
  assert.deepEqual(
    await page.evaluate(() => {
      const save = window.mossvale.getState().save;
      return [save.coins, save.potions, save.orbs, save.inventory.bag.potion, save.inventory.bag.orb, save.inventory.storage.orb];
    }),
    [0, 4, 11, 4, 11, 1],
  );
  await page.reload();
  await page.waitForSelector('#loading', {state: 'hidden'});
  await page.waitForFunction(() => window.mossvale?.getState);
  assert.deepEqual(
    await page.evaluate(() => {
      const save = window.mossvale.getState().save;
      return [save.coins, save.potions, save.orbs, save.inventory.bag.potion, save.inventory.bag.orb, save.inventory.storage.orb];
    }),
    [0, 4, 11, 4, 11, 1],
    'purchase and stash survive reload without disagreeing with battle supply fields',
  );
  assert.deepEqual(errors, []);
  await context.close();
} finally {
  await browser.close();
  server.close();
}
