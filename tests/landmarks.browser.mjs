// Real renderer coverage for #195. Set SAVE_LANDMARK_REVIEW=1 to retain phone-sized QA captures.
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, readFileSync} from 'node:fs';
import {extname, join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import http from 'node:http';
import {chromium} from 'playwright';
import {codec, newSave} from './helpers.mjs';

const root = new URL('../dist/', import.meta.url);
const targets = [
  {map: 'meadow', id: 'old-well', asset: 'prop-well-ruined', label: 'Inspect the old well', at: [60.4, 26.8]},
  {map: 'meadow', id: 'hollow-note', asset: 'tree-oak-hollow', label: 'Inspect the hollow oak', at: [44.2, 56.4]},
  {map: 'orchard-ruins', id: 'cider-press', asset: 'prop-cider-press', label: 'Inspect the cider press', at: [30.4, 44.4]},
  {map: 'orchard-ruins', id: 'fallen-wall', asset: 'prop-orchard-wall-broken', label: 'Inspect the broken orchard wall', at: [56.4, 27.4]},
  {map: 'reedfen-wetlands', id: 'heron-blind', asset: 'prop-heron-blind', label: 'Look through the heron hide', at: [16.4, 8.2]},
  {map: 'stone-basin', id: 'quarry-note', asset: 'prop-quarry-alcove', label: 'Inspect the quarry alcove', at: [6.6, 21.4]},
  {map: 'stone-basin', id: 'vista-note', asset: 'prop-rim-overlook', label: 'Look over the basin', at: [47.4, 8.6]},
  {map: 'frostveil-grove', id: 'icefall-note', asset: 'prop-icefall-ledge', label: 'Inspect the icefall ledge', at: [50.4, 38.2]},
  {map: 'stilt-isles', id: 'lantern-note', asset: 'prop-hanging-lantern', label: 'Inspect the hanging lantern', at: [40.3, 39.2]},
  {map: 'amber-ridge', id: 'lookout-note', asset: 'prop-sunstone-lookout', label: 'Look from the Sunstone shelf', at: [10.8, 11.6]},
];
targets.push({map: 'frostveil-pass', id: 'cache', asset: 'chest-wooden', label: 'Open the hidden blueglass cache', at: [52, 35]});
const reviewOffsets = [
  [1, -1],
  [-1, 1],
  [1, -0.5],
  [0.5, -1],
  [-1, 0.5],
  [-0.5, 1],
  [-1.3, -1.3],
  [1.3, 1.3],
  [1, 0],
  [-1, 0],
  [0, -1],
  [0, 1],
];
const regionFor = {
  meadow: 0,
  'orchard-ruins': 0,
  'amber-ridge': 1,
  'stone-basin': 1,
  'frostveil-grove': 2,
  'frostveil-pass': 2,
  'reedfen-wetlands': 3,
  'stilt-isles': 3,
};
const saveFor = mapId => {
  const save = newSave();
  save.met = true;
  save.region = regionFor[mapId];
  save.badges = Array.from({length: save.region}, (_, index) => index);
  save.visited = Array.from({length: save.region + 1}, (_, index) => index);
  save.mapId = mapId;
  save.visitedMaps = [mapId];
  return codec.serialize(save);
};
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml'};
const server = http
  .createServer((request, response) => {
    const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html');
    const file = new URL(name, root);
    if (!existsSync(file)) return void response.writeHead(404).end();
    response.writeHead(200, {'content-type': types[extname(name)] ?? 'application/octet-stream'}).end(readFileSync(file));
  })
  .listen(0);
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
const reviewDir = process.env.SAVE_LANDMARK_REVIEW ? resolve('art/assets/reviews/landmarks') : join(tmpdir(), 'mossvale-landmark-review');
mkdirSync(reviewDir, {recursive: true});

try {
  for (const viewport of [
    {width: 390, height: 844},
    {width: 1100, height: 900},
  ]) {
    const context = await browser.newContext({viewport, deviceScaleFactor: 1});
    await context.addInitScript(() => {
      const save = new URL(location.href).searchParams.get('landmarkSave');
      if (save) localStorage.setItem('mossvale-v3', save);
      const drawImage = CanvasRenderingContext2D.prototype.drawImage;
      window.__drawnProps = new Set();
      CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
        if (image?.src) {
          const path = new URL(image.src, location.href).pathname;
          if (path.startsWith('/assets/props/')) window.__drawnProps.add(path);
        }
        return drawImage.call(this, image, ...args);
      };
    });
    const page = await context.newPage();
    const errors = [];
    const responses = new Set();
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.ok()) responses.add(new URL(response.url()).pathname);
    });

    for (const target of targets) {
      await page.goto(`http://localhost:${server.address().port}/?debug&seed=2&landmarkSave=${encodeURIComponent(saveFor(target.map))}`);
      await page.waitForFunction(() => window.mossvale);
      await page.waitForSelector('#loading', {state: 'hidden'});
      await page.waitForFunction(mapId => window.mossvale.getState().world.map.id === mapId, target.map);
      const stand = await page.evaluate(
        ({at, offsets}) => {
          for (const [dx, dy] of offsets) {
            const candidate = [at[0] + dx, at[1] + dy];
            if (window.mossvale.valid(...candidate)) return candidate;
          }
          return null;
        },
        {at: target.at, offsets: reviewOffsets},
      );
      assert.ok(stand, `${target.id} has a walkable review position`);
      await page.evaluate(([x, y]) => Object.assign(window.mossvale.getState().player, {x, y}), stand);
      const authored = JSON.parse(readFileSync(new URL(`maps/${target.map}.json`, root), 'utf8')).landmarks.find(item => item.id === target.id);
      await page.waitForFunction(text => document.querySelector('#toast')?.textContent === text, authored.discoveryText);
      assert.equal(await page.locator('#toast').textContent(), authored.discoveryText);
      const notice = await page.locator('#toast').boundingBox();
      assert.ok(notice.x >= 0 && notice.x + notice.width <= viewport.width + 1, `${target.id} fits the viewport`);
      await page.waitForFunction(() => document.querySelector('#toast')?.dataset.active !== 'true', null, {timeout: 7000});
      await page.waitForFunction(
        label => {
          const interaction = document.querySelector('#interact');
          return interaction && interaction.style.display !== 'none' && interaction.textContent.includes(label);
        },
        target.label,
        {timeout: 5000},
      );
      await page.waitForTimeout(800); // let the discovery toast fade before inspecting object readability
      assert.ok(responses.has(`/assets/props/${target.asset}.png`), `${target.asset} was loaded by the real renderer`);
      assert.equal(
        await page.evaluate(path => window.__drawnProps.has(path), `/assets/props/${target.asset}.png`),
        true,
        `${target.asset} was drawn in the real gameplay canvas`,
      );
      await page.evaluate(() => document.querySelectorAll('.viewport > :not(#game)').forEach(element => (element.style.visibility = 'hidden')));
      await page.locator('#game').screenshot({path: join(reviewDir, `${viewport.width}-${target.id}.png`)});
      await page.evaluate(() => document.querySelectorAll('.viewport > :not(#game)').forEach(element => (element.style.visibility = '')));
      console.log(`ok ${viewport.width}px discovery ${target.map}:${target.id}`);
    }

    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(`ok all ${targets.length} secret props render and expose their matching interaction labels on desktop and phone`);
  if (process.env.SAVE_LANDMARK_REVIEW) console.log(`saved phone-sized visual reviews under ${reviewDir}`);
} finally {
  await browser.close();
  server.close();
}
