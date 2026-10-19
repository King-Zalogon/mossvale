// Actual Reedfen encounter, battle-art resolution, capture/save and follower reload proof for #292.
import {chromium} from 'playwright';
import http from 'node:http';
import {existsSync, mkdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {species} from '../dist/src/data/species.js';

const root = new URL('../dist/', import.meta.url);
const review = fileURLToPath(new URL('../art/characters/reviews/293/', import.meta.url));
mkdirSync(review, {recursive: true});

const types = {html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml'};
const server = http
  .createServer((request, response) => {
    const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html');
    const file = new URL(name, root);
    if (!existsSync(file)) return void response.writeHead(404).end();
    response.writeHead(200, {'content-type': types[name.split('.').pop()] || 'application/octet-stream'}).end(readFileSync(file));
  })
  .listen(0);
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
const id = species.findIndex(entry => entry.id === 'reedstilt');
assert.notEqual(id, -1);
try {
  const page = await browser.newPage({viewport: {width: 1320, height: 940}, reducedMotion: 'reduce'});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://localhost:${server.address().port}/?debug&seed=42`);
  await page.waitForSelector('#loading', {state: 'hidden'});
  await page.evaluate(id => {
    const save = window.mossvale.getState().save;
    save.caught = [0, 1, 2];
    save.party = [0, 1, 2];
    save.active = 0;
    save.team = {0: {xp: 0, hp: 100}, 1: {xp: 0, hp: 100}, 2: {xp: 0, hp: 100}};
    save.badges = [0, 1, 2];
    window.mossvale.travel('reedfen-wetlands');
    window.mossvale.encounter(id);
    window.mossvale.getState().battle.hp = 1;
  }, id);
  await page.waitForSelector('#fight-wild');
  assert.equal(await page.locator('#fight-wild').getAttribute('data-combat-asset'), 'creature-reedstilt-combat');
  await page.screenshot({path: join(review, 'reedstilt-battle.png'), fullPage: true});

  for (let attempt = 0; attempt < 8; attempt++) {
    if (await page.evaluate(id => window.mossvale.getState().save.caught.includes(id), id)) break;
    await page.waitForFunction(() => !window.mossvale.getState().battle?.busy);
    await page.click('#catch');
    await page.waitForFunction(() => !window.mossvale.getState().battle?.busy || !window.mossvale.getState().battle);
  }
  assert.ok(await page.evaluate(id => window.mossvale.getState().save.caught.includes(id), id), 'Reedstilt can be caught');
  assert.equal(await page.evaluate(id => window.mossvale.getState().save.party.includes(id), id), false, 'a full party keeps the capture in reserve');
  await page.waitForSelector('#result-continue');
  await page.click('#result-continue');
  if (await page.locator('#story-ok').isVisible()) await page.click('#story-ok');
  await page.evaluate(id => window.mossvale.selectCompanion(id), id);
  await page.reload();
  await page.waitForSelector('#loading', {state: 'hidden'});
  assert.equal(await page.evaluate(() => window.mossvale.getState().save.active), id, 'the selected species survives reload');
  assert.equal(await page.evaluate(() => window.mossvale.getState().save.mapId), 'reedfen-wetlands');
  await page.screenshot({path: join(review, 'reedstilt-reedfen.png'), fullPage: true});
  assert.deepEqual(errors, []);
  console.log('ok Reedfen Reedstilt battle asset, optional capture into reserve, active party selection and saved reload');
} finally {
  await browser.close();
  server.close();
}
