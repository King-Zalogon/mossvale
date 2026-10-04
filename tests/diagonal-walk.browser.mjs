// Exercise each diagonal through the real map renderer and record the red-cap atlas cells it draws.
import {chromium} from 'playwright';
import http from 'node:http';
import {existsSync, readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

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
  const page = await browser.newPage({viewport: {width: 1180, height: 820}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.playerAtlasDraws = [];
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
      if (image?.src?.includes('/person-red-cap-motion.png') && args.length >= 8) {
        window.playerAtlasDraws.push({column: Math.round(args[0] / 160), row: Math.round(args[1] / 256), flipped: this.getTransform().a < 0});
      }
      return drawImage.call(this, image, ...args);
    };
  });
  await page.goto(`http://localhost:${server.address().port}/?debug&seed=130`);
  await page.waitForSelector('#loading', {state: 'hidden'});
  await page.locator('#game').click();

  const diagonals = [
    {name: 'northwest', keys: ['ArrowUp', 'ArrowLeft'], dir: 7, sourceRow: 1, flipped: true},
    {name: 'northeast', keys: ['ArrowUp', 'ArrowRight'], dir: 1, sourceRow: 1, flipped: false},
    {name: 'southwest', keys: ['ArrowDown', 'ArrowLeft'], dir: 5, sourceRow: 5, flipped: false},
    {name: 'southeast', keys: ['ArrowDown', 'ArrowRight'], dir: 3, sourceRow: 3, flipped: false},
  ];
  const evidence = [];
  for (const diagonal of diagonals) {
    await page.evaluate(() => (window.playerAtlasDraws = []));
    const before = await page.evaluate(() => ({...window.mossvale.getState().player}));
    for (const key of diagonal.keys) await page.keyboard.down(key);
    await page.waitForTimeout(1050);
    const after = await page.evaluate(() => ({
      player: {...window.mossvale.getState().player},
      draws: window.playerAtlasDraws,
    }));
    for (const key of diagonal.keys) await page.keyboard.up(key);
    assert.equal(after.player.dir, diagonal.dir, `${diagonal.name} sets the matching world facing`);
    assert.ok(Math.hypot(after.player.x - before.x, after.player.y - before.y) > 0.5, `${diagonal.name} moves in the real map`);
    const playerCells = after.draws.filter(frame => frame.row === diagonal.sourceRow && frame.flipped === diagonal.flipped);
    const walkFrames = new Set(playerCells.map(frame => frame.column).filter(column => column > 0));
    assert.deepEqual([...walkFrames].sort(), [1, 2, 3, 4], `${diagonal.name} renders all four walk cells from its intended atlas pose`);
    evidence.push({direction: diagonal.name, cells: [...walkFrames].sort((a, b) => a - b)});
    await page.waitForTimeout(120);
  }

  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.evaluate(() => localStorage.setItem('mossvale-settings', JSON.stringify({motion: 'reduced'})));
  await page.reload();
  await page.waitForSelector('#loading', {state: 'hidden'});
  await page.locator('#game').click();
  await page.evaluate(() => (window.playerAtlasDraws = []));
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowDown');
  const reduced = await page.evaluate(() => ({
    dir: window.mossvale.getState().player.dir,
    columns: [...new Set(window.playerAtlasDraws.map(frame => frame.column))],
  }));
  assert.equal(reduced.dir, 4, 'reduced motion still updates facing');
  assert.deepEqual(reduced.columns, [0], 'reduced motion freezes the pose at idle');
  assert.deepEqual(errors, []);
  console.log(`ok real-map diagonal sprite cells ${JSON.stringify(evidence)}; reduced motion preserves facing and idle pose`);
} finally {
  await browser.close();
  server.close();
}
