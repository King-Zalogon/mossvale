// Number keys in battle trigger the button that carries that number (they once drifted from the labels).
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
  initial.orbs = 5;
  initial.potions = 3;
  initial.team[initial.active].hp = 5; // damaged, so the potion is available
  const context = await browser.newContext();
  await context.addInitScript(raw => {
    if (localStorage.getItem('mossvale-v3') === null) localStorage.setItem('mossvale-v3', raw);
  }, codec.serialize(initial));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url + '?debug&seed=8');
  await page.waitForSelector('#loading', {state: 'hidden'});
  await page.waitForFunction(() => window.mossvale?.getState().world.map);
  await page.evaluate(() => window.mossvale.encounter(1));
  await page.waitForSelector('#attack:not([disabled])');
  // Record which button each key reaches, without letting the action run.
  await page.evaluate(() => {
    window.__clicked = [];
    document.addEventListener(
      'click',
      event => {
        const button = event.target.closest?.('.battle-actions button');
        if (!button) return;
        window.__clicked.push(button.textContent.trim()[0]);
        event.stopImmediatePropagation();
      },
      true,
    );
  });
  const enabled = await page.$$eval('.battle-actions button', buttons => buttons.map(b => [b.textContent.trim()[0], !b.disabled, b.id]));
  assert.deepEqual(
    enabled.map(([digit]) => digit),
    ['1', '2', '3', '4', '5', '6', '7', '8'],
    'the eight actions are numbered 1-8 in order',
  );
  assert.deepEqual(
    enabled.map(([, , id]) => id),
    ['attack', 'element', 'setup', 'objective', 'catch', 'potion', 'guard', 'switch'],
  );
  for (const [digit, isEnabled] of enabled) {
    await page.evaluate(() => (window.__clicked.length = 0));
    await page.keyboard.press(digit);
    assert.deepEqual(await page.evaluate(() => window.__clicked), isEnabled ? [digit] : [], `key ${digit} reaches the button labelled ${digit}`);
  }
  assert.ok(enabled.find(([digit]) => digit === '5')[1], 'capture is available with orbs');
  assert.ok(enabled.find(([digit]) => digit === '6')[1], 'potion is available when the companion is hurt');
  assert.deepEqual(errors, []);
  await context.close();
} finally {
  await browser.close();
  server.close();
}
