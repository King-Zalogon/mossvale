// Eight-direction follower frame grid and path-motion preview (#90).
import {chromium} from 'playwright';
import http from 'node:http';
import {existsSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {species} from '../dist/src/data/species.js';
import {assets, spriteId} from '../dist/src/data/assets.js';
import {DIRECTIONS, directionPose, movementFacing} from '../dist/src/domain/exploration.js';

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
  for (const {id} of species) {
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
  // Record the actual stage draw calls, not just the atlas's static direction labels.
  await page.clock.install();
  await page.evaluate(() => {
    window.previewDraws = [];
    const original = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
      if (this.canvas.id === 'stage' && image.src?.includes('-follower.png')) {
        window.previewDraws.push({...window.followerPreview.state(), column: args[0] / args[2], sourceRow: args[1] / args[3]});
      }
      return original.call(this, image, ...args);
    };
  });
  for (const id of ['emberkin', 'brooklet', 'rillume']) {
    await page.selectOption('#species', id);
    await page.evaluate(() => {
      window.previewDraws = [];
    });
    await page.clock.runFor(25000);
    const draws = await page.evaluate(() => window.previewDraws);
    const frames = assets[spriteId(`creature-${id}-follower`)].frames;
    assert.deepEqual(
      [...new Set(draws.filter(d => d.moving).map(d => d.direction))].sort(),
      [...DIRECTIONS].sort(),
      `${id} visibly traverses all eight facings`,
    );
    assert.deepEqual([...new Set(draws.map(d => d.column))].sort(), [0, 1, 2, 3, 4], `${id} uses idle and all four walk cells`);
    for (let i = 1; i < draws.length; i++) {
      const previous = draws[i - 1],
        current = draws[i];
      const expected = movementFacing(current.x - previous.x, current.y - previous.y);
      if (expected !== null) assert.equal(current.row, expected, `${id} faces its own movement, including sub-unit deltas`);
      else assert.equal(current.row, previous.row, `${id} retains facing at rest`);
      assert.equal(current.sourceRow, directionPose(frames, current.row).row, `${id} draws the manifest's row order`);
      if (!current.moving) assert.equal(current.column, 0, 'stationary followers use idle');
    }
  }
  await page.locator('#play').click();
  const stopped = await page.evaluate(() => window.followerPreview.state());
  await page.clock.runFor(1000);
  assert.deepEqual(await page.evaluate(() => window.followerPreview.state()), stopped, 'pause freezes position and retained facing');
  assert.equal(stopped.moving, false);
  assert.equal(await page.evaluate(() => window.previewDraws.at(-1).column), 0);
  await page.locator('#play').click();
  await page.check('#calm');
  await page.evaluate(() => {
    window.previewDraws = [];
  });
  await page.clock.runFor(25000);
  const calmDraws = await page.evaluate(() => window.previewDraws);
  assert.deepEqual([...new Set(calmDraws.map(d => d.column))], [0], 'calm mode always uses idle');
  assert.deepEqual([...new Set(calmDraws.filter(d => d.moving).map(d => d.direction))].sort(), [...DIRECTIONS].sort(), 'calm mode keeps changing facing');
  await page.check('#calm');
  assert.equal(await page.evaluate(() => window.followerPreview.state().reducedMotion), true);
  await page.screenshot({path: join(tmpdir(), 'mossvale-creature-follower-preview.png'), fullPage: true});
  assert.deepEqual(errors, []);

  const game = await browser.newPage();
  game.on('pageerror', error => errors.push(error.message));
  await game.goto(`http://localhost:${server.address().port}/?debug&seed=3`);
  await game.waitForSelector('#loading', {state: 'hidden'});
  await game.locator('#game').click();
  for (const {id} of species) {
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
  console.log(`ok follower preview displays all eight directions and five frames for all ${species.length} species; in-game path motion switches all species`);
} finally {
  await browser.close();
  server.close();
}
