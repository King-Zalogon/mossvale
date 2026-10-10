// Desktop playfield: the game frame fits the window and shows more world as the window grows.
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

try {
  const initial = newSave();
  initial.met = true;
  const context = await browser.newContext({viewport: {width: 1280, height: 720}});
  await context.addInitScript(raw => {
    if (localStorage.getItem('mossvale-v3') === null) localStorage.setItem('mossvale-v3', raw);
  }, codec.serialize(initial));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url + '?debug&seed=3');
  await page.waitForSelector('#loading', {state: 'hidden'});
  const measure = () =>
    page.evaluate(() => {
      const frame = document.querySelector('.game-frame').getBoundingClientRect();
      const canvas = document.querySelector('#game');
      return {
        bottom: frame.bottom,
        viewport: innerHeight,
        width: canvas.width,
        height: canvas.height,
        ratio: canvas.width / canvas.height,
        css: canvas.getBoundingClientRect(),
      };
    });
  let seen = 0;
  for (const [w, h] of [
    [1280, 720],
    [1366, 768],
    [1920, 1080],
    [2560, 1440],
  ]) {
    await page.setViewportSize({width: w, height: h});
    await page.waitForTimeout(250);
    const m = await measure();
    assert.ok(m.bottom <= m.viewport + 1, `${w}x${h}: the whole game frame (controls included) fits without scrolling (${m.bottom} > ${m.viewport})`);
    assert.ok(Math.abs(m.ratio - m.css.width / m.css.height) < 0.02, `${w}x${h}: canvas keeps the on-screen aspect (no stretching)`);
    assert.ok(m.width >= seen - 40, `${w}x${h}: a wider window never shows less world`);
    seen = Math.max(seen, m.width);
  }
  assert.ok(seen > 960 && seen <= 1800, 'large windows render more world, within the cap');
  // Phone layout keeps the baseline resolution.
  await page.setViewportSize({width: 390, height: 780});
  await page.waitForTimeout(250);
  assert.equal((await measure()).width, 960);
  assert.deepEqual(errors, []);
  await context.close();
} finally {
  await browser.close();
  server.close();
}
