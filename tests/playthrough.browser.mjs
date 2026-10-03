// A normal first chapter through the real UI, no debug damage: fight and capture wild creatures with ordinary
// actions, rest at the ranger, challenge the meadow guardian at its shrine and earn the seal. Run: node tests/playthrough.browser.mjs
import {chromium} from 'playwright';
import http from 'node:http';
import {readFileSync, existsSync} from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../dist/', import.meta.url);
const types = {html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', json: 'application/json', svg: 'image/svg+xml'};
const server = http
  .createServer((q, r) => {
    const name = q.url.split('?')[0].slice(1) || 'index.html';
    if (!existsSync(new URL(name, root))) return void r.writeHead(404).end();
    r.writeHead(200, {'content-type': types[name.split('.').pop()] ?? 'application/octet-stream'}).end(readFileSync(new URL(name, root)));
  })
  .listen(0);
const url = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
const ctx = await browser.newContext();
await ctx.addInitScript(`localStorage.setItem('mossvale-settings', JSON.stringify({motion: 'reduced'}))`); // shorter waits between rounds
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(url + '?debug&seed=42');
await page.waitForSelector('#loading', {state: 'hidden'});

const state = () =>
  page.evaluate(() => {
    const g = window.mossvale.getState();
    const s = g.save;
    return {
      phase: g.phase,
      battle: g.battle && {
        hp: g.battle.hp,
        max: g.battle.max,
        busy: g.battle.busy,
        boss: g.battle.boss,
        focus: g.battle.focus,
        turn: g.battle.turn,
        tactic: g.battle.tactic,
      },
      caught: s.caught.length,
      caughtIds: s.caught,
      active: s.active,
      party: s.party,
      reserve: s.caught.filter(i => !s.party.includes(i)),
      team: s.team,
      badges: s.badges.length,
      level: window.mossvale.level(s.active),
      hp: s.team[s.active].hp,
      maxHp: window.mossvale.maxHP(s.active),
      potions: s.potions,
      orbs: s.orbs,
      wins: s.wins,
    };
  });
const dismissResults = async () => {
  while (await page.locator('#result-continue').isVisible()) {
    await page.click('#result-continue');
    await page.waitForTimeout(50);
    if (await page.locator('#story-ok').isVisible()) await page.click('#story-ok');
  }
};
/** Plays the open battle like a careful player: capture when weak (wild only), heal when low, guard before big hits. */
async function fightOut(wantCapture) {
  for (let i = 0; i < 160; i++) {
    if (await page.locator('#result-continue').isVisible()) return;
    const s = await state();
    if (s.phase === 'explore' && !s.battle) return;
    if (s.battle && !s.battle.busy) {
      const low = s.hp < s.maxHp * 0.4 && s.potions > 0;
      const intent = (await page.locator('.battle-intent').count()) ? await page.textContent('.battle-intent') : '';
      let key = '2';
      if (low) key = '4';
      else if (wantCapture && !s.battle.boss && s.battle.hp / s.battle.max <= 0.45 && s.orbs > 0) key = '3';
      else if (/heavy|bracing/.test(intent)) key = '5';
      else if (s.battle.focus < 1) key = '1';
      await page.keyboard.press(key);
    }
    await page.waitForTimeout(120);
  }
}
const rest = async () => {
  await page.evaluate(() => Object.assign(window.mossvale.getState().player, {x: 10.3, y: 10.4}));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.mossvale.interact());
  await page.click('#speech-next');
  await page.click('#rest-team');
  await page.click('#speech-next');
  await page.keyboard.press('Escape');
};

let guardianTries = 0;
for (let round = 0; round < 40 && (await state()).badges === 0; round++) {
  const s = await state();
  if (s.caught >= 2 && s.level >= 7 && guardianTries < 6) {
    guardianTries++;
    await rest();
    await page.evaluate(() => Object.assign(window.mossvale.getState().player, {x: 12, y: 6.4}));
    await page.waitForTimeout(400);
    await page.evaluate(() => window.mossvale.interact());
    await page.click('#challenge');
    await fightOut(false);
    await dismissResults();
  } else {
    await rest();
    await page.evaluate(id => window.mossvale.encounter(id), s.caught < 2 ? 1 : 2);
    await fightOut(s.caught < 2);
    await dismissResults();
  }
}
const end = await state();
assert.equal(end.badges, 1, `the meadow seal was earned through normal play (${JSON.stringify(end)}, ${guardianTries} guardian tries)`);
assert.ok(end.caught >= 2);

// Fill the three-member battle team and place another captured creature in reserve through real battle actions.
// The starter is random, so capture whichever creatures are still missing until both are true.
let stocked = await state();
for (const id of [3, 4, 5, 6, 7, 1, 2]) {
  if (stocked.party.length === 3 && stocked.reserve.length > 0) break;
  if (stocked.caughtIds.includes(id)) continue;
  await page.evaluate(id => window.mossvale.encounter(id), id);
  await fightOut(true);
  await dismissResults();
  stocked = await state();
}
assert.equal(stocked.party.length, 3);
assert.ok(stocked.reserve.length > 0);

// Choose a reserve companion, bench a teammate, then reload and confirm the collection and health records persist.
await page.click('#party');
await page.waitForSelector('[data-select]');
const selected = stocked.reserve[0];
await page.click(`[data-select="${selected}"]`);
await page.waitForFunction(id => window.mossvale.getState().save.active === id, selected);
let managed = await state();
assert.ok(managed.party.includes(selected));
assert.ok(!managed.reserve.includes(selected));
const benched = managed.party.find(i => i !== managed.active);
await page.click('#party');
await page.waitForSelector(`[data-bench="${benched}"]`);
await page.click(`[data-bench="${benched}"]`);
managed = await state();
assert.ok(managed.reserve.includes(benched));
assert.ok(managed.caughtIds.includes(benched));
const savedParty = managed.party;
const savedTeam = managed.team;
await page.reload();
await page.waitForSelector('#loading', {state: 'hidden'});
const restored = await state();
assert.deepEqual(restored.party, savedParty);
assert.deepEqual(restored.team, savedTeam);
assert.deepEqual(restored.caughtIds, managed.caughtIds);
assert.deepEqual(errors, []);
console.log(`ok party/reserve selection and persistence plus meadow guardian playthrough (level ${end.level}, ${guardianTries} tries)`);
await browser.close();
server.close();
