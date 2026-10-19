// Playable smoke proof for the optional Rootglass route, its Brooklet reveal and responsive map view.
import {chromium} from 'playwright';
import http from 'node:http';
import {readFileSync, existsSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {species} from '../dist/src/data/species.js';
import {codec, newSave, rawMaps} from './helpers.mjs';

const root = new URL('../dist/', import.meta.url);
const captures = new URL('../docs/map-design/278/', import.meta.url);
const captureDir = join(captures.pathname);
mkdirSync(captureDir, {recursive: true});
const types = {html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', json: 'application/json', svg: 'image/svg+xml'};
const server = http
  .createServer((request, response) => {
    const name = decodeURIComponent(request.url.split('?')[0].slice(1)) || 'index.html';
    const file = new URL(name, root);
    if (!existsSync(file)) return void response.writeHead(404).end();
    response.writeHead(200, {'content-type': types[name.split('.').pop()] ?? 'application/octet-stream'}).end(readFileSync(file));
  })
  .listen(0);
const pass = rawMaps().find(map => map.id === 'frostveil-pass');
const canopy = rawMaps().find(map => map.id === 'rootglass-canopy');
const hollow = rawMaps().find(map => map.id === 'rootglass-hollow');
const passExit = pass.exits.find(exit => exit.to.map === canopy.id);
const mainExit = canopy.exits.find(exit => exit.id === 'hollow-stair');
const canopyReturn = hollow.exits.find(exit => exit.id === 'canopy-return');
const passReturn = canopy.exits.find(exit => exit.id === 'frostveil-return');
const seep = canopy.exits.find(exit => exit.route?.id === 'rootglass-seep');
const brooklet = species.findIndex(entry => entry.id === 'brooklet');
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});

function saveAt(mapId, position, withBrooklet = false) {
  const save = newSave();
  save.met = true;
  save.region = 2;
  save.badges = [0, 1];
  save.visited = [0, 1, 2];
  save.visitedMaps = [...new Set([...save.visitedMaps, mapId])];
  save.mapId = mapId;
  [save.x, save.y] = position;
  if (withBrooklet) {
    save.caught = [...new Set([...save.caught, brooklet])];
    save.seen = [...new Set([...save.seen, brooklet])];
    save.party = [...new Set([...save.party, brooklet])].slice(0, 3);
    save.team[brooklet] = {xp: 0, hp: species[brooklet].stats.hp};
    save.active = brooklet;
  }
  return save;
}

try {
  const initial = saveAt(pass.id, [54, 16]);
  const context = await browser.newContext({viewport: {width: 1365, height: 900}});
  await context.addInitScript(
    `if (!localStorage.getItem('mossvale-v3')) localStorage.setItem('mossvale-v3', ${JSON.stringify(codec.serialize(initial))}); localStorage.setItem('mossvale-settings', '{"motion":"reduced"}')`,
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://localhost:${server.address().port}/?debug&seed=278`);
  await page.waitForSelector('#loading', {state: 'hidden'});
  const state = () => page.evaluate(() => window.mossvale.getState());
  assert.equal((await state()).world.map.id, pass.id);
  // Map topology validation proves the full path from Frostveil Pass. Place the player at
  // its validated exit here so the browser regression stays focused on real gate behavior.
  await page.evaluate(({x, y}) => Object.assign(window.mossvale.getState().player, {x, y}), {x: passExit.at[0], y: passExit.at[1]});
  await page.evaluate(() => window.mossvale.interact());
  await page.waitForFunction(id => window.mossvale.getState().save.mapId === id, canopy.id);
  assert.equal((await state()).world.map.id, canopy.id, 'a normal starter can enter the optional map');
  await page.waitForTimeout(5900); // Let the normal arrival toast finish before retaining visual review evidence.
  await page.screenshot({path: join(captureDir, 'desktop-canopy.png'), fullPage: true});

  await page.evaluate(({x, y}) => Object.assign(window.mossvale.getState().player, {x, y}), {x: mainExit.at[0], y: mainExit.at[1]});
  await page.evaluate(() => window.mossvale.interact());
  await page.waitForFunction(id => window.mossvale.getState().save.mapId === id, hollow.id);
  assert.equal((await state()).world.map.id, hollow.id, 'the ordinary descent does not require Brooklet');
  await page.waitForTimeout(5900);
  await page.screenshot({path: join(captureDir, 'desktop-hollow.png'), fullPage: true});
  await page.reload();
  await page.waitForSelector('#loading', {state: 'hidden'});
  assert.equal((await state()).world.map.id, hollow.id, 'the selected side map restores after reload');
  await page.evaluate(({x, y}) => Object.assign(window.mossvale.getState().player, {x, y}), {x: canopyReturn.at[0], y: canopyReturn.at[1]});
  await page.evaluate(() => window.mossvale.interact());
  await page.waitForFunction(id => window.mossvale.getState().save.mapId === id, canopy.id);
  await page.evaluate(({x, y}) => Object.assign(window.mossvale.getState().player, {x, y}), {x: passReturn.at[0], y: passReturn.at[1]});
  await page.waitForTimeout(300);
  await page.evaluate(() => window.mossvale.interact());
  await page.waitForFunction(id => window.mossvale.getState().save.mapId === id, pass.id);
  assert.equal((await state()).world.map.id, pass.id, 'backtracking returns through both maps without losing the active map');
  assert.deepEqual(errors, []);
  await context.close();

  // Approach the hidden route with Fernling first: it stays concealed. Switch to Brooklet, then walk into range.
  const routeSave = saveAt(canopy.id, [seep.at[0] - 3, seep.at[1]], true);
  routeSave.active = species.findIndex(entry => entry.id === 'fernling');
  const routeContext = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  await routeContext.addInitScript(
    `localStorage.setItem('mossvale-v3', ${JSON.stringify(codec.serialize(routeSave))}); localStorage.setItem('mossvale-settings', '{"motion":"reduced"}')`,
  );
  const phone = await routeContext.newPage();
  phone.on('pageerror', error => errors.push(error.message));
  await phone.goto(`http://localhost:${server.address().port}/?debug&seed=279`);
  await phone.waitForSelector('#loading', {state: 'hidden'});
  assert.equal(await phone.evaluate(() => window.mossvale.nearest()), null, 'the shortcut remains hidden before discovery');
  await phone.evaluate(x => {
    window.mossvale.getState().player.x = x;
    window.mossvale.explore();
  }, seep.at[0] - 2);
  await phone.evaluate(id => window.mossvale.selectCompanion(id), brooklet);
  assert.equal((await phone.evaluate(() => window.mossvale.getState())).save.events.includes(`${canopy.id}/route-${seep.route.id}`), false);
  await phone.evaluate(x => {
    window.mossvale.getState().player.x = x;
    window.mossvale.explore();
  }, seep.at[0] - 1.7);
  await phone.waitForFunction(key => window.mossvale.getState().save.events.includes(key), `${canopy.id}/route-${seep.route.id}`);
  assert.match(await phone.locator('#toast').textContent(), /Brooklet finds a narrow water path/i);
  await phone.screenshot({path: join(captureDir, 'phone-seep-discovered.png'), fullPage: true});
  assert.deepEqual(errors, []);
  await routeContext.close();
  console.log('ok Rootglass optional entry, ordinary descent, persisted map, Brooklet-only seep and desktop/phone captures');
} finally {
  await browser.close();
  server.close();
}
