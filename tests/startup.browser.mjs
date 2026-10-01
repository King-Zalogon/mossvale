// Browser checks for startup recovery (#8) and loader (#12). Requires Playwright and Chromium:
//   node tests/startup.browser.mjs
import {chromium} from 'playwright';
import http from 'node:http';
import {readFileSync, existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const root = new URL('../dist/', import.meta.url),
  types = {html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', svg: 'image/svg+xml'};
let blocked = new Set();
const server = http
  .createServer((q, r) => {
    const name = q.url.split('?')[0].slice(1) || 'index.html';
    if (blocked.has(name) || !existsSync(new URL(name, root))) {
      r.writeHead(404).end();
      return;
    }
    r.writeHead(200, {'content-type': types[name.split('.').pop()] || 'application/octet-stream'}).end(readFileSync(new URL(name, root)));
  })
  .listen(0);
const url = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
const open = async init => {
  const ctx = await browser.newContext();
  await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url + '?debug');
  return {page, errors};
};
const set = (k, v) =>
  `if(!localStorage.getItem('__seeded')){localStorage.setItem(${JSON.stringify(k)},${JSON.stringify(v)});localStorage.setItem('__seeded','1')}`;

{
  // malformed nested team save opens a playable game
  const {page, errors} = await open(set('mossvale-v2', JSON.stringify({version: 2, team: {0: 7}, caught: [0]})));
  await page.waitForFunction(() => window.mossvale);
  assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(() => window.mossvale.getState().save.team[0].xp), 0);
  console.log('ok malformed team save');
}
{
  // corrupt v3 shows the recovery dialog and keeps the payload
  const {page} = await open(set('mossvale-v3', '{"version":3,'));
  await page.waitForSelector('#modal:not([hidden])');
  assert.match(await page.textContent('#modal'), /could not be read/);
  assert.equal(await page.evaluate(() => localStorage.getItem('mossvale-quarantine') !== null), true);
  console.log('ok corrupt save recovery');
}
{
  // missing required sprite: error + retry; restoring the asset resumes play; input is blocked meanwhile
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
{
  // smoke: menus, seeded battle to a result, capture, travel, v3 save written, no page errors
  const {page, errors} = await open('');
  await page.goto(url + '?debug&seed=5');
  await page.waitForSelector('#loading', {state: 'hidden'});
  for (const key of ['m', 'j', 'q']) {
    await page.keyboard.press(key);
    assert.equal(await page.locator('#modal').isVisible(), true, key);
    await page.keyboard.press('Escape');
  }
  await page.evaluate(() => window.mossvale.encounter(1));
  await page.waitForSelector('#attack');
  for (let i = 0; i < 40 && (await page.locator('#result-continue').count()) === 0; i++) {
    if (await page.locator('#element:not([disabled])').count()) await page.keyboard.press('2');
    await page.waitForTimeout(300);
  }
  await page.waitForSelector('#result-continue', {timeout: 15000});
  await page.click('#result-continue');
  assert.equal(await page.locator('#modal').isHidden(), true);
  await page.evaluate(() => window.mossvale.getState().save.badges.push(0));
  await page.evaluate(() => window.mossvale.travel(1));
  assert.equal(await page.evaluate(() => window.mossvale.getState().save.region), 1);
  await page.waitForTimeout(100);
  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('mossvale-v3')));
  assert.equal(stored.version, 3);
  assert.equal(stored.region, 'amber-ridge');
  assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(() => typeof window.mossvale), 'object');
  console.log('ok gameplay smoke');
}
for (const [seed, weakened] of [
  [11, false],
  [12, true],
  [13, true],
  [14, true],
]) {
  // a refresh right after throwing an orb neither loses the orb nor the outcome; a double tap spends one orb
  const {page} = await open('');
  await page.goto(url + `?debug&seed=${seed}`);
  await page.waitForSelector('#loading', {state: 'hidden'});
  await page.evaluate(() => window.mossvale.encounter(1));
  await page.waitForSelector('#catch:not([disabled])');
  if (weakened) await page.evaluate(() => (window.mossvale.getState().battle.hp = 1)); // makes capture likely so both outcomes get exercised
  const orbs = await page.evaluate(() => window.mossvale.getState().save.orbs);
  await page.keyboard.press('3');
  await page.keyboard.press('3');
  await page.reload();
  await page.waitForSelector('#loading', {state: 'hidden'});
  const st = await page.evaluate(() => {
    const s = window.mossvale.getState();
    return {orbs: s.save.orbs, resumed: !!s.battle, wins: s.save.wins, caught: s.save.caught.length, modal: s.modalMode, phase: s.phase};
  });
  assert.equal(st.orbs, orbs - 1, 'exactly one orb spent');
  if (st.resumed)
    assert.deepEqual([st.modal, st.phase, st.wins], ['battle', 'battle', 0]); // broke free: encounter resumes
  else assert.deepEqual([st.wins, st.caught, st.phase], [1, 2, 'explore']); // captured: reward applied once
  console.log('ok refresh during capture (' + (st.resumed ? 'encounter resumed' : 'capture kept') + ')');
}
{
  // a normal capture path with ordinary actions, no debug damage
  const {page, errors} = await open('');
  await page.goto(url + '?debug&seed=21');
  await page.waitForSelector('#loading', {state: 'hidden'});
  for (let tries = 0; tries < 8; tries++) {
    if ((await page.evaluate(() => window.mossvale.getState().save.caught.length)) >= 2) break;
    await page.evaluate(() => window.mossvale.encounter(1));
    for (let i = 0; i < 80; i++) {
      if (await page.locator('#result-continue').count()) {
        await page.click('#result-continue');
        break;
      }
      const s = await page.evaluate(() => {
        const g = window.mossvale.getState();
        return g.battle && {busy: g.battle.busy, ratio: g.battle.hp / g.battle.max, orbs: g.save.orbs, mode: g.modalMode};
      });
      if (s && !s.busy && s.mode === 'battle') await page.keyboard.press(s.ratio <= 0.45 && s.orbs > 0 ? '3' : '2');
      await page.waitForTimeout(250);
    }
    await page.waitForFunction(() => window.mossvale.getState().phase === 'explore');
  }
  const caught = await page.evaluate(() => window.mossvale.getState().save.caught.length);
  assert.ok(caught >= 2, 'captured a new friend through normal play');
  assert.deepEqual(errors, []);
  console.log('ok normal capture flow');
}
{
  // debug hook is absent without ?debug
  const {page} = await open('');
  await page.goto(url);
  await page.waitForSelector('#loading', {state: 'hidden'});
  assert.equal(await page.evaluate(() => typeof window.mossvale), 'undefined');
  console.log('ok debug hook gated');
}
await browser.close();
server.close();
