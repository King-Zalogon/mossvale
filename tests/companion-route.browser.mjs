// A companion-gated route unlocks once, survives reload, and never replaces the safe boardwalk.
import {chromium} from 'playwright';
import http from 'node:http';
import {readFileSync, existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {species} from '../dist/src/data/species.js';
import {regions} from '../dist/src/data/regions.js';
import {codec, newSave, rawMaps} from './helpers.mjs';

const root = new URL('../dist/', import.meta.url);
const types = {html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', json: 'application/json', svg: 'image/svg+xml'};
const server = http
  .createServer((request, response) => {
    const name = decodeURIComponent(request.url.split('?')[0].slice(1)) || 'index.html';
    const file = new URL(name, root);
    if (!existsSync(file)) return void response.writeHead(404).end();
    response.writeHead(200, {'content-type': types[name.split('.').pop()] ?? 'application/octet-stream'}).end(readFileSync(file));
  })
  .listen(0);
const source = rawMaps().find(map => map.id === 'reedfen-wetlands');
const destination = rawMaps().find(map => map.id === 'stilt-isles');
const route = source.exits.find(exit => exit.route?.id === 'shallow-water-cut');
const fernling = species.findIndex(entry => entry.id === 'fernling');
const brooklet = species.findIndex(entry => entry.id === 'brooklet');
const wetlandRegion = regions.findIndex(region => region.biome === 'wetland');
const eventKey = `${source.id}/route-${route.route.id}`;
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});

try {
  const initial = newSave();
  initial.met = true;
  initial.region = wetlandRegion;
  initial.badges = Array.from({length: wetlandRegion}, (_, index) => index);
  initial.visited = Array.from({length: wetlandRegion + 1}, (_, index) => index);
  initial.visitedMaps = [...new Set([...initial.visitedMaps, source.id])];
  initial.mapId = source.id;
  initial.x = source.spawns['shallow-cut-approach'][0];
  initial.y = source.spawns['shallow-cut-approach'][1];
  initial.caught = [...new Set([...initial.caught, brooklet])];
  initial.seen = [...new Set([...initial.seen, brooklet])];
  initial.party = [...new Set([...initial.party, brooklet])].slice(0, 3);
  initial.team[brooklet] = {xp: 0, hp: species[brooklet].stats.hp};
  initial.active = fernling;

  const context = await browser.newContext({viewport: {width: 1280, height: 800}});
  await context.addInitScript(
    `if (!localStorage.getItem('mossvale-v3')) localStorage.setItem('mossvale-v3', ${JSON.stringify(codec.serialize(initial))}); localStorage.setItem('mossvale-settings', '{"motion":"reduced"}')`,
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`http://localhost:${server.address().port}/?debug&seed=19`);
    await page.waitForSelector('#loading', {state: 'hidden'});
    const state = () => page.evaluate(() => window.mossvale.getState());
    assert.equal((await state()).world.map.id, source.id);
    assert.match(await page.locator('#interact').textContent(), /shallow-water cut/i, 'the route is visibly labeled before unlocking');

    await page.keyboard.press('e');
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('Brooklet'));
    assert.equal((await state()).save.mapId, source.id, 'an incompatible active companion cannot cross');
    assert.equal((await state()).save.events.includes(eventKey), false, 'a denied attempt does not unlock or pay');

    await page.evaluate(id => (window.mossvale.getState().save.active = id), brooklet);
    await page.waitForTimeout(300);
    await page.keyboard.press('e');
    await page.waitForFunction(id => window.mossvale.getState().save.mapId === id, destination.id);
    let current = await state();
    assert.deepEqual([current.player.x, current.player.y], destination.spawns[route.to.spawn]);
    assert.equal(current.save.coins, 12);
    assert.equal(current.save.events.filter(event => event === eventKey).length, 1);
    assert.match(await page.locator('#toast').textContent(), /route is now marked/i);
    const stored = () => page.evaluate(() => ({keys: Object.keys(localStorage), save: localStorage.getItem('mossvale-v3')}));
    const persisted = await stored();
    assert.ok(persisted.save?.includes(eventKey), `route unlock is written to the normal persistent save: ${JSON.stringify(persisted)}`);

    await page.reload();
    await page.waitForSelector('#loading', {state: 'hidden'});
    current = await state();
    assert.equal(current.save.mapId, destination.id);
    assert.equal(current.save.events.filter(event => event === eventKey).length, 1);
    assert.equal(current.save.coins, 12);

    await page.evaluate(id => (window.mossvale.getState().save.active = id), fernling);
    await page.evaluate(({mapId, spawn}) => window.mossvale.travel(mapId, spawn), {mapId: source.id, spawn: 'shallow-cut-approach'});
    await page.waitForFunction(id => window.mossvale.getState().save.mapId === id, source.id);
    await page.waitForTimeout(300);
    await page.evaluate(() => window.mossvale.interact());
    await page.waitForFunction(id => window.mossvale.getState().save.mapId === id, destination.id);
    current = await state();
    assert.equal(current.save.coins, 12, 'the saved route stays open for any companion without repeating its reward');
    assert.equal(current.save.events.filter(event => event === eventKey).length, 1);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
  console.log('ok Brooklet unlocks the optional shallow-water cut once; unlock/reward reload and every starter keeps the boardwalk');
} finally {
  await browser.close();
  server.close();
}
