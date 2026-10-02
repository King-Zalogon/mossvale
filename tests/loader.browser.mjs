// Browser checks for startup under bad conditions (#12): slow, missing, corrupt, aborted and stalled assets,
// unavailable map data, failing fonts and a browser without canvas. Run: node tests/loader.browser.mjs
import {chromium} from 'playwright';
import http from 'node:http';
import {readFileSync, existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {codec, newSave} from './helpers.mjs';

const root = new URL('../dist/', import.meta.url);
const types = {html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', json: 'application/json', svg: 'image/svg+xml'};
/** path -> 'missing' | 'garbage' | 'hang' | 'abort' | `delay:<ms>`; empty means serve normally. */
let behavior = new Map();
const hanging = new Set();
const server = http
  .createServer(async (q, r) => {
    const name = q.url.split('?')[0].slice(1) || 'index.html';
    const mode = behavior.get(name) ?? [...behavior].find(([k]) => k.endsWith('*') && name.startsWith(k.slice(0, -1)))?.[1] ?? '';
    if (mode === 'abort') return q.socket.destroy();
    if (mode === 'hang') return void hanging.add(r); // never answered
    if (mode.startsWith('delay:')) await new Promise(res => setTimeout(res, Number(mode.slice(6))));
    if (mode === 'missing' || !existsSync(new URL(name, root))) return void r.writeHead(404).end();
    const ext = name.split('.').pop();
    if (mode === 'garbage') return void r.writeHead(200, {'content-type': types[ext] ?? 'text/plain'}).end(Buffer.from('this is not really a file'));
    r.writeHead(200, {'content-type': types[ext] ?? 'application/octet-stream'}).end(readFileSync(new URL(name, root)));
  })
  .listen(0);
const url = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
const SOUTH = 'assets/people/person-red-cap-south.png';

async function start({query = '?debug', init, seed} = {}) {
  const ctx = await browser.newContext();
  if (init) await ctx.addInitScript(init);
  if (seed)
    await ctx.addInitScript(
      `if(!localStorage.getItem('__seeded')){localStorage.setItem('mossvale-v3',${JSON.stringify(seed)});localStorage.setItem('__seeded','1')}`,
    );
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url + query);
  return {page, errors, ctx};
}
const ready = page => page.waitForSelector('#loading', {state: 'hidden'});
const failed = (page, text) =>
  page.waitForFunction(
    t => document.querySelector('#loading')?.classList.contains('failed') && document.querySelector('#load-status').textContent.includes(t),
    text,
  );

{
  // Slow connection: progress is shown, input is ignored until ready, then play starts.
  behavior = new Map([['assets/*', 'delay:2500']]);
  const {page, errors, ctx} = await start();
  await page.waitForFunction(() => /Loading artwork… \d+ \/ \d+/.test(document.querySelector('#load-status').textContent));
  assert.match(await page.textContent('#load-status'), /Loading artwork… \d+ \/ 24/);
  await page.keyboard.press('j');
  await page.keyboard.press('m');
  assert.equal(await page.locator('#modal').isHidden(), true, 'no gameplay input before ready');
  assert.equal(
    await page.evaluate(() => document.querySelector('header').inert && document.querySelector('main').inert),
    true,
    'the page is inert while loading',
  );
  await ready(page);
  assert.equal(await page.evaluate(() => document.querySelector('main').inert), false);
  assert.deepEqual(errors, []);
  await ctx.close();
  behavior = new Map();
  console.log('ok slow connection');
}
{
  // Corrupt, aborted and stalled required art: explained, retryable, and play resumes once it is fixed.
  for (const [mode, query] of [
    ['garbage', '?debug'],
    ['abort', '?debug'],
    ['hang', '?debug&assetTimeout=800'],
  ]) {
    behavior = new Map([[SOUTH, mode]]);
    const {page, ctx} = await start({query});
    await failed(page, 'required artwork did not load');
    assert.match(await page.textContent('#load-detail'), /person-red-cap-south\.png/);
    assert.equal(await page.locator('#load-retry').isVisible(), true);
    await page.keyboard.press('j');
    assert.equal(await page.locator('#modal').isHidden(), true, `${mode}: no input while failed`);
    behavior = new Map();
    await page.click('#load-retry');
    await ready(page);
    assert.equal(await page.evaluate(() => typeof window.mossvale.getState().player.x), 'number');
    await ctx.close();
    console.log(`ok ${mode} required asset`);
  }
  for (const h of hanging) h.destroy();
}
{
  // An optional asset that is missing does not stop play.
  behavior = new Map([['assets/items/item-capture-orb.png', 'missing']]);
  const {page, errors, ctx} = await start();
  await ready(page);
  assert.deepEqual(errors, []);
  await ctx.close();
  behavior = new Map();
  console.log('ok optional asset missing');
}
{
  // Map data: unreachable, then corrupt; both are explained and retryable.
  for (const mode of ['missing', 'garbage']) {
    behavior = new Map([['maps/index.json', mode]]);
    const {page, ctx} = await start();
    await failed(page, 'map data');
    behavior = new Map();
    await page.click('#load-retry');
    await ready(page);
    await ctx.close();
  }
  behavior = new Map([['maps/meadow.json', 'garbage']]);
  const {page, ctx} = await start();
  await failed(page, 'map data');
  behavior = new Map();
  await page.click('#load-retry');
  await ready(page);
  await ctx.close();
  console.log('ok map data failures');
}
{
  // Web fonts failing to load (offline, blocked) never breaks the game.
  const ctx2 = await browser.newContext();
  await ctx2.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
  const p2 = await ctx2.newPage();
  const errors2 = [];
  p2.on('pageerror', e => errors2.push(e.message));
  await p2.goto(url + '?debug');
  await ready(p2);
  assert.deepEqual(errors2, []);
  await ctx2.close();
  console.log('ok fonts blocked');
}
{
  // No canvas support: a clear message instead of a broken page.
  const {page, ctx} = await start({init: 'HTMLCanvasElement.prototype.getContext = () => null;'});
  await failed(page, 'canvas');
  assert.match(await page.textContent('#load-detail'), /current version/);
  await ctx.close();
  console.log('ok no canvas');
}
{
  // A saved game says it is resuming; a cold start says it is preparing.
  const played = newSave();
  Object.assign(played, {wins: 4, met: true, badges: [0]});
  behavior = new Map([['assets/*', 'delay:300']]);
  const resume = await start({seed: codec.serialize(played)});
  assert.equal(await resume.page.textContent('#load-title'), 'Resuming your trail');
  const cold = await start();
  assert.equal(await cold.page.textContent('#load-title'), 'Preparing Mossvale');
  await ready(resume.page);
  await ready(cold.page);
  await resume.ctx.close();
  await cold.ctx.close();
  behavior = new Map();
  console.log('ok resuming vs cold start');
}
{
  // A save written by the original build plays in the current one and is stored in the new format.
  const raw = readFileSync(new URL('./fixtures/saves/v2-original-build.json', import.meta.url), 'utf8').trim();
  const ctx = await browser.newContext();
  await ctx.addInitScript(
    `if(!localStorage.getItem('__seeded')){localStorage.setItem('mossvale-v2',${JSON.stringify(raw)});localStorage.setItem('__seeded','1')}`,
  );
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url + '?debug');
  await ready(page);
  const state = await page.evaluate(() => {
    const s = window.mossvale.getState().save;
    return {caught: s.caught, coins: s.coins, chests: s.chests};
  });
  assert.deepEqual(state, {caught: [0, 2, 3], coins: 60, chests: [0]});
  await page.waitForTimeout(200);
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('mossvale-v3'))).version, 3);
  assert.equal((await page.evaluate(() => localStorage.getItem('mossvale-v2'))) !== null, true, 'the old save is left untouched');
  assert.deepEqual(errors, []);
  await ctx.close();
  console.log('ok original-build save');
}

await browser.close();
server.close();
