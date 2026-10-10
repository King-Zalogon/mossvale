// Visual frame preview plus in-battle state wiring for the combat-art batches (#85).
import {chromium} from 'playwright';
import http from 'node:http';
import {existsSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {species} from '../dist/src/data/species.js';

const root = new URL('../dist/', import.meta.url);
const types = {html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml'};
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
  const page = await browser.newPage({viewport: {width: 1500, height: 1100}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://localhost:${server.address().port}/creature-combat-preview.html`);
  await page.waitForFunction(
    expectedCount =>
      document.querySelectorAll('.creature canvas').length === expectedCount &&
      [...document.querySelectorAll('.creature canvas')].every(canvas =>
        [...canvas.getContext('2d').getImageData(0, 0, 160, 160).data].some((value, index) => index % 4 === 3 && value > 0),
      ),
    species.length * 20,
  );
  assert.deepEqual(
    await page.locator('.creature h2').allTextContents(),
    species.map(entry => entry.name),
  );
  assert.equal(await page.locator('.reference img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), true);
  assert.deepEqual(
    await page.evaluate(() =>
      [...document.querySelectorAll('.creature canvas')].reduce((counts, canvas) => {
        const state = canvas.dataset.state;
        counts[state] = (counts[state] ?? 0) + 1;
        return counts;
      }, {}),
    ),
    Object.fromEntries(['idle', 'attack', 'hit', 'faint', 'capture'].map(state => [state, species.length * 4])),
  );
  assert.deepEqual(await page.locator('.frame figcaption').allTextContents(), Array.from({length: species.length * 5}, () => ['1', '2', '3', '4']).flat());
  assert.equal(
    await page.evaluate(() =>
      [...document.querySelectorAll('.creature canvas')].every(canvas =>
        [...canvas.getContext('2d').getImageData(0, 0, 160, 160).data].some((value, index) => index % 4 === 3 && value > 0),
      ),
    ),
    true,
  );
  await page.screenshot({path: join(tmpdir(), 'mossvale-creature-combat-preview.png'), fullPage: true});
  await page.check('#calm');
  assert.ok(await page.locator('canvas[data-state="attack"][data-frame="3"]').count());

  const battle = await browser.newPage({viewport: {width: 1300, height: 950}});
  battle.on('pageerror', error => errors.push(error.message));
  await battle.goto(`http://localhost:${server.address().port}/?debug&seed=3`);
  await battle.waitForSelector('#loading', {state: 'hidden'});
  const lanternix = species.findIndex(entry => entry.id === 'lanternix');
  const rillume = species.findIndex(entry => entry.id === 'rillume');
  const emberkin = species.findIndex(entry => entry.id === 'emberkin');
  assert.notEqual(lanternix, -1);
  assert.notEqual(rillume, -1);
  await battle.evaluate(
    ({starter, teammate, foe}) => {
      const save = window.mossvale.getState().save;
      save.caught = [starter, teammate];
      save.party = [starter, teammate];
      save.active = starter;
      save.team = {[starter]: {xp: 0, hp: 100}, [teammate]: {xp: 0, hp: 100}};
      window.mossvale.encounter(foe);
    },
    {starter: lanternix, teammate: rillume, foe: emberkin},
  );
  await battle.waitForSelector('#fight-wild');
  assert.equal(await battle.locator('#fight-buddy').getAttribute('data-combat-state'), 'idle');
  assert.equal(await battle.locator('#fight-wild').getAttribute('data-combat-state'), 'idle');
  await battle.evaluate(() => (window.mossvale.getState().battle.hp = 9999));
  await battle.click('#setup');
  await battle.waitForFunction(() => document.querySelector('.battle-intent[role="status"]')?.textContent.includes('Relay prepared'));
  await battle.click('#switch');
  await battle.click(`[data-select="${rillume}"]`);
  await battle.waitForFunction(() => document.querySelector('.battle-log')?.textContent.includes('joined the encounter'));
  assert.equal(await battle.locator('#fight-buddy').getAttribute('data-combat-state'), 'idle');
  await battle.click('#element');
  await battle.waitForFunction(() => document.querySelector('.battle-log')?.textContent.includes('relay amplified'));
  await battle.evaluate(() => (window.mossvale.getState().battle.hp = 9999));
  await battle.click('#attack');
  await battle.waitForFunction(() => document.querySelector('#fight-buddy')?.dataset.combatState === 'attack');
  assert.equal(await battle.locator('#fight-buddy').getAttribute('data-combat-state'), 'attack');
  await battle.waitForFunction(() => document.querySelector('#fight-buddy')?.dataset.combatState === 'idle');
  await battle.emulateMedia({reducedMotion: 'reduce'});
  await battle.evaluate(() => (window.mossvale.getState().battle.hp = 1));
  await battle.click('#element');
  await battle.waitForFunction(() => document.querySelector('#fight-buddy')?.dataset.combatState === 'element');
  assert.equal(await battle.locator('#fight-buddy').getAttribute('data-combat-frame'), '3');
  assert.match(await battle.locator('#fight-buddy').getAttribute('class'), /element/);
  await battle.waitForSelector('#result-continue');
  assert.deepEqual(errors, []);
  console.log(`ok all ${species.length} transparent combat atlases preview every state and battle playback attacks/faints without changing rules`);
} finally {
  await browser.close();
  server.close();
}
