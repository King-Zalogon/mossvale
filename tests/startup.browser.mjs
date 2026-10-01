// Browser checks for startup recovery (#8) and loader (#12). Requires Playwright and Chromium:
//   node tests/startup.browser.mjs
import {chromium} from 'playwright';
import http from 'node:http';
import {readFileSync, existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const root = new URL('../dist/', import.meta.url), types = {html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', svg: 'image/svg+xml'};
let blocked = new Set();
const server = http.createServer((q, r) => {
 const name = q.url.split('?')[0].slice(1) || 'index.html';
 if (blocked.has(name) || !existsSync(new URL(name, root))) { r.writeHead(404).end(); return; }
 r.writeHead(200, {'content-type': types[name.split('.').pop()] || 'application/octet-stream'}).end(readFileSync(new URL(name, root)));
}).listen(0);
const url = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
const open = async init => { const ctx = await browser.newContext(); await ctx.addInitScript(init); const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message)); await page.goto(url); return {page, errors}; };
const set = (k, v) => `if(!localStorage.getItem('__seeded')){localStorage.setItem(${JSON.stringify(k)},${JSON.stringify(v)});localStorage.setItem('__seeded','1')}`;

{ // malformed nested team save opens a playable game
 const {page, errors} = await open(set('mossvale-v2', JSON.stringify({version: 2, team: {0: 7}, caught: [0]})));
 await page.waitForFunction(() => window.mossvale);
 assert.deepEqual(errors, []);
 assert.equal(await page.evaluate(() => window.mossvale.getState().save.team[0].xp), 0);
 console.log('ok malformed team save');
}
{ // corrupt v3 shows the recovery dialog and keeps the payload
 const {page} = await open(set('mossvale-v3', '{"version":3,'));
 await page.waitForSelector('#modal:not([hidden])');
 assert.match(await page.textContent('#modal'), /could not be read/);
 assert.equal(await page.evaluate(() => localStorage.getItem('mossvale-quarantine') !== null), true);
 console.log('ok corrupt save recovery');
}
{ // missing required sprite: error + retry; restoring the asset resumes play; input is blocked meanwhile
 blocked = new Set(['sprite8.png']);
 const {page} = await open('');
 await page.waitForSelector('#load-retry:not([hidden])');
 assert.match(await page.textContent('#load-detail'), /sprite8\.png/);
 await page.keyboard.press('j');
 assert.equal(await page.locator('#modal').isHidden(), true, 'no gameplay input before ready');
 blocked = new Set();
 await page.click('#load-retry');
 await page.waitForSelector('#loading', {state: 'hidden'});
 console.log('ok missing sprite retry');
}
await browser.close(); server.close();
