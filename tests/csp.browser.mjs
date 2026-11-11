// The real game must run under the production CSP with no violations (#443). Serves dist/ with the exact header
// from next.config.mjs and drives a battle and the menu, the paths that build markup at runtime.
import {chromium} from 'playwright';
import http from 'node:http';
import {readFileSync, existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {extname, join, resolve} from 'node:path';
import {GAME_CSP} from '../next.config.mjs';
import {codec, newSave} from './helpers.mjs';

const root = resolve('dist');
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml'};
const server = http
  .createServer((request, response) => {
    const name = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
    const file = join(root, name);
    if (!existsSync(file)) return response.writeHead(404).end();
    response.writeHead(200, {'content-type': types[extname(file)] ?? 'application/octet-stream', 'content-security-policy': GAME_CSP}).end(readFileSync(file));
  })
  .listen(0);
const url = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});

try {
  const initial = newSave();
  initial.met = true;
  initial.orbs = 4;
  const context = await browser.newContext();
  await context.addInitScript(raw => {
    if (localStorage.getItem('mossvale-v3') === null) localStorage.setItem('mossvale-v3', raw);
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', event => window.__violations.push(`${event.violatedDirective} ${event.blockedURI}`));
  }, codec.serialize(initial));
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (/Content Security Policy|Refused to/i.test(message.text())) problems.push(`console: ${message.text()}`);
  });
  await page.goto(url + '?debug&seed=8');
  await page.waitForSelector('#loading', {state: 'hidden'});
  await page.waitForFunction(() => window.mossvale?.getState().world.map);
  await page.evaluate(() => window.mossvale.encounter(1));
  await page.waitForSelector('#catch:not([disabled])');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const violations = await page.evaluate(() => window.__violations);
  assert.deepEqual([...violations, ...problems], [], 'the game runs under the production CSP without violations');
  console.log('ok game boots, battles and opens menus under the production CSP');
} finally {
  await browser.close();
  server.close();
}
