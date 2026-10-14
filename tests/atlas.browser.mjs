// Regional atlas: spoiler-safe disclosure through real play, keyboard and touch selection, phone layout, and the untouched Island cards.
import {chromium} from 'playwright';
import http from 'node:http';
import {readFileSync, existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {extname, join, resolve} from 'node:path';
import {codec, newSave} from './helpers.mjs';

const root = resolve('dist');
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml'};
const server = http
  .createServer((request, response) => {
    const name = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
    const file = join(root, name);
    if (!existsSync(file)) return response.writeHead(404).end();
    response.writeHead(200, {'content-type': types[extname(file)] ?? 'application/octet-stream'}).end(readFileSync(file));
  })
  .listen(0);
const url = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});

async function open(viewport = {width: 1280, height: 800}) {
  const initial = newSave();
  initial.met = true;
  const context = await browser.newContext({viewport});
  await context.addInitScript(raw => {
    if (localStorage.getItem('mossvale-v3') === null) localStorage.setItem('mossvale-v3', raw);
  }, codec.serialize(initial));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url + '?debug&seed=3');
  await page.waitForSelector('#loading', {state: 'hidden'});
  await page.waitForFunction(() => window.mossvale?.getState().world.map);
  return {page, errors, context};
}
const openAtlas = async page => {
  await page.keyboard.press('Escape').catch(() => {});
  await page.evaluate(() => document.querySelector('#modal .close')?.click());
  await page.keyboard.press('m');
  await page.click('#map-atlas');
  await page.waitForSelector('.atlas-graph');
};
const places = page => page.$$eval('.atlas-node', nodes => nodes.map(node => [node.dataset.atlas, node.getAttribute('aria-label')]));

try {
  const {page, errors, context} = await open();
  // A fresh adventure: one place, no hint of the others beyond a generic note.
  await openAtlas(page);
  assert.deepEqual(
    (await places(page)).map(([id]) => id),
    ['meadow'],
  );
  assert.match((await places(page))[0][1], /You are here/);
  assert.match(await page.textContent('.atlas-note'), /still unmarked/);
  const html = await page.innerHTML('.atlas');
  for (const secret of ['orchard', 'Orchard', 'Frostveil', 'Reedfen', 'Stilt', 'Stone Basin'])
    assert.ok(!html.includes(secret), `a fresh atlas must not mention ${secret}`);

  // The Island cards and their travel buttons are untouched by the new tab.
  await page.click('#map-islands');
  await page.waitForSelector('.region-card');
  assert.ok((await page.locator('.region-card').count()) >= 4);
  assert.ok((await page.locator('[data-travel]').count()) >= 1, 'the card travel contract is still offered');

  // Walking up to a trail sign discloses its destination: known, not visited, no travel from the atlas.
  await page.evaluate(() => document.querySelector('#modal .close')?.click());
  await page.evaluate(() => {
    const player = window.mossvale.getState().player;
    player.x = 66;
    player.y = 30;
  });
  await page.waitForFunction(() => window.mossvale.getState().save.explored?.meadow?.seen?.includes('east'), null, {timeout: 10000});
  await openAtlas(page);
  const afterSign = await places(page);
  assert.deepEqual(afterSign.map(([id]) => id).sort(), ['meadow', 'orchard-ruins']);
  assert.match(afterSign.find(([id]) => id === 'orchard-ruins')[1], /Known, not visited yet/);
  await page.click('[data-atlas="orchard-ruins"]');
  assert.equal(await page.locator('[data-atlas-travel]').count(), 0, 'a place you only know about cannot be travelled to from the atlas');
  assert.match(await page.textContent('#atlas-detail'), /Follow its trail/);

  // Reload: the disclosure is saved state, not session state.
  await page.reload();
  await page.waitForSelector('#loading', {state: 'hidden'});
  await page.waitForFunction(() => window.mossvale?.getState().world.map);
  await openAtlas(page);
  assert.deepEqual((await places(page)).map(([id]) => id).sort(), ['meadow', 'orchard-ruins']);

  // Visiting the orchard makes it travelable; the way back is explained and travel stays an explicit button.
  await page.evaluate(() => document.querySelector('#modal .close')?.click());
  await page.evaluate(() => window.mossvale.travel('orchard-ruins'));
  await page.waitForFunction(() => window.mossvale.getState().save.mapId === 'orchard-ruins');
  await openAtlas(page);
  assert.match((await places(page)).find(([id]) => id === 'orchard-ruins')[1], /You are here/);
  await page.click('[data-atlas="meadow"]');
  assert.match(await page.textContent('#atlas-detail'), /Travel to Sunlit Trail/);
  await page.click('[data-atlas-travel="meadow"]');
  await page.waitForFunction(() => window.mossvale.getState().save.mapId === 'meadow');

  // Keyboard: arrows move between places by direction, Enter selects, every place is a labelled button.
  await openAtlas(page);
  assert.ok((await page.locator('.atlas-node[role="button"][tabindex="0"]').count()) >= 2);
  await page.focus('[data-atlas="meadow"]');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.atlas), 'orchard-ruins');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.atlas), 'meadow');
  await page.keyboard.press('Enter');
  assert.match(await page.textContent('#atlas-detail'), /Sunlit Trail/);
  assert.ok((await page.locator('.atlas-routes li').count()) >= 2, 'the route list repeats the graph as text');

  // A concealed route stays off the atlas until it is discovered, even with its sign nearby.
  await page.evaluate(() => {
    const save = window.mossvale.getState().save;
    save.visitedMaps = ['meadow', 'orchard-ruins', 'amber-ridge', 'frostveil-grove', 'reedfen-wetlands'];
    save.mapId = 'reedfen-wetlands';
    save.badges = [0, 1, 2];
    save.explored = {'reedfen-wetlands': {cells: null, seen: ['shallow-water-cut'], rev: 0}};
    save.events = (save.events ?? []).filter(event => !event.includes('route-'));
  });
  await openAtlas(page);
  assert.ok(!(await places(page)).some(([id]) => id === 'stilt-isles'), 'the hidden route does not reveal its island');
  await page.evaluate(() => window.mossvale.getState().save.events.push('reedfen-wetlands/route-shallow-water-cut'));
  await openAtlas(page);
  assert.ok((await places(page)).some(([id]) => id === 'stilt-isles'));
  assert.ok((await page.locator('.atlas-edge.found-route').count()) >= 1);
  assert.deepEqual(errors, []);
  await context.close();

  // Phone portrait: vertical layout, everything inside the screen, text list available.
  const phone = await open({width: 390, height: 844});
  await phone.page.evaluate(() => {
    const save = window.mossvale.getState().save;
    save.visitedMaps = ['meadow', 'orchard-ruins'];
    save.explored = {meadow: {cells: null, seen: ['east'], rev: 0}, 'orchard-ruins': {cells: null, seen: ['east-to-ridge', 'back-to-meadow'], rev: 0}};
  });
  await openAtlas(phone.page);
  assert.equal(await phone.page.getAttribute('.atlas', 'data-orientation'), 'vertical');
  const fits = await phone.page.evaluate(() => {
    const modal = document.querySelector('#modal');
    const graph = document.querySelector('.atlas-graph').getBoundingClientRect();
    return {overflow: modal.scrollWidth - modal.clientWidth, inside: graph.left >= 0 && graph.right <= innerWidth};
  });
  assert.ok(fits.overflow <= 1 && fits.inside, `the atlas fits a phone (${JSON.stringify(fits)})`);
  assert.deepEqual(phone.errors, []);
  await phone.context.close();
} finally {
  await browser.close();
  server.close();
}
