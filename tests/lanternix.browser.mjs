// Real UI capture into reserve, activation, reload and the shared setup/switch/strike relay (#289).
import {chromium} from 'playwright';
import http from 'node:http';
import {existsSync, readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {species} from '../dist/src/data/species.js';

const root = new URL('../dist/', import.meta.url);
const types = {html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml'};
const server = http
  .createServer((req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
    const file = new URL(name, root);
    if (!existsSync(file)) return void res.writeHead(404).end();
    res.writeHead(200, {'content-type': types[name.split('.').pop()] ?? 'application/octet-stream'}).end(readFileSync(file));
  })
  .listen(0);
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
const id = species.findIndex(s => s.id === 'lanternix');
try {
  const page = await browser.newPage({reducedMotion: 'reduce'});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/?debug&seed=42`);
  await page.waitForSelector('#loading', {state: 'hidden'});
  await page.evaluate(id => {
    const {save} = window.mossvale.getState();
    save.caught = [0, 1, 2];
    save.party = [0, 1, 2];
    save.active = 0;
    for (const friend of save.party) save.team[friend] = {xp: 0, hp: 100};
    save.badges = [0, 1, 2, 3];
    window.mossvale.travel('amber-ridge');
    window.mossvale.encounter(id);
    window.mossvale.getState().battle.hp = 1;
  }, id);
  await page.waitForSelector('#fight-wild');
  assert.equal(await page.locator('#fight-wild').getAttribute('data-combat-asset'), 'creature-lanternix-combat');
  for (let attempt = 0; attempt < 6; attempt++) {
    if (await page.evaluate(id => window.mossvale.getState().save.caught.includes(id), id)) break;
    await page.waitForFunction(() => !window.mossvale.getState().battle.busy);
    await page.click('#catch');
    await page.waitForFunction(id => window.mossvale.getState().save.caught.includes(id) || !window.mossvale.getState().battle?.busy, id);
  }
  assert.ok(await page.evaluate(id => window.mossvale.getState().save.caught.includes(id), id));
  assert.equal(await page.evaluate(id => window.mossvale.getState().save.party.includes(id), id), false, 'a full party keeps the capture in reserve');
  await page.waitForSelector('#result-continue');
  await page.click('#result-continue');
  if (await page.locator('#story-ok').isVisible()) await page.click('#story-ok');
  await page.click('#party');
  await page.waitForSelector(`[data-select="${id}"]`);
  await page.click(`[data-select="${id}"]`);
  await page.waitForFunction(id => window.mossvale.getState().save.active === id, id);
  await page.reload();
  await page.waitForSelector('#loading', {state: 'hidden'});
  assert.equal(await page.evaluate(() => window.mossvale.getState().save.active), id);
  assert.ok(await page.evaluate(id => window.mossvale.getState().save.party.includes(id), id));
  await page.evaluate(() => window.mossvale.encounter(7));
  await page.waitForSelector('#setup');
  assert.equal(await page.locator('#fight-buddy').getAttribute('data-combat-asset'), 'creature-lanternix-combat');
  await page.click('#setup');
  await page.waitForFunction(() => !window.mossvale.getState().battle.busy);
  assert.deepEqual(
    await page.evaluate(() => {
      const b = window.mossvale.getState().battle;
      return [b.condition.source, b.condition.remaining, b.relayReady];
    }),
    [id, 1, false],
  );
  await page.reload();
  await page.waitForSelector('#loading', {state: 'hidden'});
  assert.equal(await page.evaluate(() => window.mossvale.getState().battle.condition.source), id, 'the setup source survives a real save/reload');
  await page.click('#switch');
  await page.waitForSelector('[data-select="2"]');
  await page.click('[data-select="2"]');
  await page.waitForFunction(() => !window.mossvale.getState().battle.busy && window.mossvale.getState().save.active === 2);
  assert.equal(await page.evaluate(() => window.mossvale.getState().battle.relayReady), true);
  await page.click('#element');
  await page.waitForFunction(() => !window.mossvale.getState().battle.busy);
  assert.deepEqual(
    await page.evaluate(() => {
      const b = window.mossvale.getState().battle;
      return [b.condition, b.relayReady];
    }),
    [null, false],
    'the next elemental strike consumes the relay',
  );
  assert.deepEqual(errors, []);
  console.log('ok Lanternix capture into reserve, activation/reload and shared relay setup/reload/switch/element consumption');
} finally {
  await browser.close();
  server.close();
}
