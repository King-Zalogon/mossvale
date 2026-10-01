// Browser checks for startup recovery (#8) and loader (#12). Requires Playwright and Chromium:
//   node tests/startup.browser.mjs
import {chromium} from 'playwright';
import http from 'node:http';
import {readFileSync, existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {codec, newSave} from './helpers.mjs';
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
    else if (await page.locator('#attack:not([disabled])').count()) await page.keyboard.press('1');
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
        return g.battle && {busy: g.battle.busy, ratio: g.battle.hp / g.battle.max, orbs: g.save.orbs, mode: g.modalMode, focus: g.battle.focus};
      });
      if (s && !s.busy && s.mode === 'battle') await page.keyboard.press(s.ratio <= 0.45 && s.orbs > 0 ? '3' : s.focus > 0 ? '2' : '1');
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
  // title screen, settings that persist, new game that archives, restore that swaps back
  const played = newSave();
  played.coins = 40;
  played.wins = 3;
  played.badges = [0];
  played.caught.push(1);
  played.party.push(1);
  played.team[1] = {xp: 0, hp: 40};
  played.playTime = 600;
  const ctx = await browser.newContext();
  await ctx.addInitScript(set('mossvale-v3', codec.serialize(played)));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const reloading = click => Promise.all([page.waitForEvent('load'), page.click(click)]);
  await page.goto(url);
  await page.waitForSelector('#m-primary');
  assert.equal(await page.textContent('#m-primary'), 'Continue');
  assert.match(await page.textContent('#modal'), /2 of 8 friends · 1 seal · 10 min played/);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#m-primary').isVisible(), true, 'the title screen is not dismissed by Escape');
  await page.click('#m-settings');
  await page.click('[data-set="sound"][data-value="true"]');
  await page.click('[data-set="motion"][data-value="reduced"]');
  await page.click('#s-zoom-in');
  await page.click('#m-back');
  await page.click('#m-primary');
  assert.equal(await page.locator('#modal').isHidden(), true);
  assert.equal(await page.evaluate(() => document.body.classList.contains('reduce-motion')), true);
  await page.reload();
  await page.waitForSelector('#m-primary');
  assert.equal(await page.textContent('#sound'), 'Sound on');
  assert.equal(await page.evaluate(() => document.body.classList.contains('reduce-motion')), true);
  await page.click('#m-primary');
  await page.keyboard.press('Escape'); // Escape opens the menu during play
  await page.waitForSelector('#m-new');
  await page.click('#m-new');
  assert.match(await page.textContent('#modal'), /kept as a backup/);
  await page.click('#m-cancel');
  assert.equal(await page.evaluate(() => localStorage.getItem('mossvale-archive')), null, 'cancel changes nothing');
  await page.click('#m-new');
  await reloading('#m-confirm-new');
  await page.waitForSelector('#m-primary');
  assert.equal(await page.textContent('#m-primary'), 'Start adventure');
  assert.equal(await page.textContent('#sound'), 'Sound on', 'settings survive a new game');
  assert.notEqual(await page.evaluate(() => localStorage.getItem('mossvale-archive')), null);
  await page.click('#m-restore');
  await reloading('#m-confirm-restore');
  await page.waitForSelector('#m-primary');
  assert.equal(await page.textContent('#m-primary'), 'Continue');
  assert.match(await page.textContent('#modal'), /2 of 8 friends/);
  assert.deepEqual(errors, []);
  console.log('ok title, settings, new game and restore');
}
{
  // zoom survives a resize; walking, travelling and the arrival fade raise no errors
  const {page, errors} = await open('');
  await page.goto(url + '?debug&seed=3');
  await page.waitForSelector('#loading', {state: 'hidden'});
  await page.click('#zoom-in');
  const zoom = await page.evaluate(() => window.mossvale.getState().zoom);
  await page.setViewportSize({width: 700, height: 900});
  await page.setViewportSize({width: 1280, height: 800});
  assert.equal(await page.evaluate(() => window.mossvale.getState().zoom), zoom, 'zoom is kept through resize');
  await page.keyboard.down('d');
  await page.waitForTimeout(600);
  await page.keyboard.up('d');
  const moved = await page.evaluate(() => window.mossvale.getState().player);
  assert.ok(moved.x !== 12 || moved.y !== 13, 'the player moved');
  await page.evaluate(() => (window.mossvale.getState().save.badges.push(0), window.mossvale.travel(1)));
  await page.waitForTimeout(500);
  assert.deepEqual(errors, []);
  console.log('ok zoom, walking and travel');
}
{
  // the ranger: shopping is transactional, resting is free and tops supplies up
  const {page, errors} = await open('');
  await page.goto(url + '?debug&seed=4');
  await page.waitForSelector('#loading', {state: 'hidden'});
  const state = () =>
    page.evaluate(() => {
      const g = window.mossvale.getState();
      return {coins: g.save.coins, potions: g.save.potions, orbs: g.save.orbs};
    });
  await page.evaluate(() => {
    const g = window.mossvale.getState();
    Object.assign(g.player, {x: 10.3, y: 10.4});
    Object.assign(g.save, {coins: 25, potions: 0, orbs: 0});
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => window.mossvale.interact());
  await page.waitForSelector('[data-buy="potion"]');
  await page.click('[data-buy="potion"]');
  assert.deepEqual(await state(), {coins: 15, potions: 1, orbs: 0});
  await page.waitForSelector('[data-buy="potion"]');
  await page.click('[data-buy="orbs"]');
  assert.deepEqual(await state(), {coins: 0, potions: 1, orbs: 5});
  assert.equal(await page.locator('[data-buy="orbs"]').isDisabled(), true, 'cannot buy without coins');
  await page.click('#rest-team');
  assert.deepEqual(await state(), {coins: 0, potions: 1, orbs: 12});
  assert.deepEqual(errors, []);
  console.log('ok ranger shop and rest');
}
{
  // opening premise on a new adventure, a first-battle tip, and the ending once everything is awake
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url + '?debug&premise&seed=2');
  await page.waitForSelector('#story-ok');
  assert.match(await page.textContent('#modal'), /The quiet shrines/);
  await page.keyboard.press('Escape'); // closes the card like the button does
  assert.equal(await page.locator('#modal').isHidden(), true);
  await page.evaluate(() => window.mossvale.encounter(1));
  await page.waitForSelector('#attack');
  assert.match(await page.textContent('.battle-log'), /Tip: weaken it/);
  await page.keyboard.press('Escape');
  await page.waitForSelector('#modal', {state: 'hidden'});
  await page.reload();
  await page.waitForFunction(() => window.mossvale);
  assert.equal(await page.locator('#story-ok').count(), 0, 'the opening card is only shown once');

  const done = newSave();
  done.badges = [0, 1, 2];
  done.met = true;
  done.wins = 5;
  const ctx2 = await browser.newContext();
  await ctx2.addInitScript(set('mossvale-v3', codec.serialize(done)));
  const p2 = await ctx2.newPage();
  p2.on('pageerror', e => errors.push(e.message));
  await p2.goto(url);
  await p2.click('#m-primary');
  await p2.waitForSelector('#story-ok');
  assert.match(await p2.textContent('#modal'), /The isles are awake/);
  await p2.click('#story-ok');
  assert.equal(await p2.locator('#modal').isHidden(), true);
  await p2.reload();
  await p2.waitForSelector('#m-primary');
  assert.match(await p2.textContent('#modal'), /Adventure complete/);
  await p2.click('#m-primary');
  assert.equal(await p2.locator('#story-ok').count(), 0, 'the ending is shown once');
  assert.deepEqual(errors, []);
  console.log('ok premise, tips and ending');
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
