// Eight-direction follower frame grid and path-motion preview (#90).
import {chromium} from 'playwright';
import http from 'node:http';
import {existsSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {species} from '../dist/src/data/species.js';

const root = new URL('../dist/', import.meta.url);
const types = {html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png'};
const server = http
  .createServer((request, response) => {
    const name = decodeURIComponent(request.url.split('?')[0].slice(1)) || 'index.html';
    const file = new URL(name, root);
    if (!existsSync(file)) return void response.writeHead(404).end();
    response.writeHead(200, {'content-type': types[name.split('.').pop()] || 'application/octet-stream'}).end(readFileSync(file));
  })
  .listen(0);
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
try {
  const page = await browser.newPage({viewport: {width: 1180, height: 900}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://localhost:${server.address().port}/creature-follower-preview.html`);
  await page.waitForFunction(() => document.querySelectorAll('.direction canvas').length === 40);
  assert.deepEqual(await page.locator('.direction h3').allTextContents(), [
    'north',
    'northeast',
    'east',
    'southeast',
    'south',
    'southwest',
    'west',
    'northwest',
  ]);
  assert.deepEqual(
    await page.locator('.direction canvas').evaluateAll(canvases =>
      canvases.every(canvas => {
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        return data.some((value, index) => index % 4 === 3 && value > 0);
      }),
    ),
    true,
  );
  for (const id of ['emberkin', 'fernling', 'duskwing', 'brooklet', 'hushram', 'voltkit']) {
    await page.selectOption('#species', id);
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('.direction canvas')].length === 40 &&
        [...document.querySelectorAll('.direction canvas')].every(canvas =>
          canvas
            .getContext('2d')
            .getImageData(0, 0, 80, 80)
            .data.some((v, i) => i % 4 === 3 && v > 0),
        ),
    );
  }
  await page.check('#calm');
  assert.equal(await page.evaluate(() => window.followerPreview.state().reducedMotion), true);
  await page.screenshot({path: join(tmpdir(), 'mossvale-creature-follower-preview.png'), fullPage: true});
  assert.deepEqual(errors, []);

  const game = await browser.newPage();
  game.on('pageerror', error => errors.push(error.message));
  await game.goto(`http://localhost:${server.address().port}/?debug&seed=3`);
  await game.waitForSelector('#loading', {state: 'hidden'});
  await game.locator('#game').click();
  for (const id of ['emberkin', 'fernling', 'duskwing', 'brooklet', 'hushram', 'voltkit']) {
    const speciesId = species.findIndex(entry => entry.id === id);
    assert.notEqual(speciesId, -1);
    await game.evaluate(value => {
      const save = window.mossvale.getState().save;
      save.caught = [value];
      save.party = [value];
      save.active = value;
      save.team = {[value]: {xp: 0, hp: 100}};
    }, speciesId);
    for (const key of ['ArrowUp', 'ArrowRight']) await game.keyboard.down(key);
    await game.waitForTimeout(550);
    for (const key of ['ArrowUp', 'ArrowRight']) await game.keyboard.up(key);
    await game.waitForTimeout(180);
    for (const key of ['ArrowDown', 'ArrowLeft']) await game.keyboard.down(key);
    await game.waitForTimeout(450);
    for (const key of ['ArrowDown', 'ArrowLeft']) await game.keyboard.up(key);
    assert.equal(await game.evaluate(() => window.mossvale.getState().save.active), speciesId);
  }
  assert.deepEqual(errors, []);
  console.log('ok follower preview displays all eight directions and five frames for six species; in-game path motion switches all six species');
} finally {
  await browser.close();
  server.close();
}
