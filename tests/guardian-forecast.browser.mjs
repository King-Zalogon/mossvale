// #256: player-facing guardian forecasts stay factual and readable across input modes and viewport shapes.
import {chromium} from 'playwright';
import http from 'node:http';
import {existsSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {effectiveness} from '../dist/src/domain/rules.js';
import {species} from '../dist/src/data/species.js';

const root = new URL('../dist/', import.meta.url);
const types = {html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml'};
const server = http
  .createServer((request, response) => {
    const name = decodeURIComponent(request.url.split('?')[0].slice(1)) || 'index.html';
    const file = new URL(name, root);
    if (!existsSync(file)) return void response.writeHead(404).end();
    response.writeHead(200, {'content-type': types[name.split('.').pop()] || 'application/octet-stream'}).end(readFileSync(file));
  })
  .listen(0);
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
const port = () => server.address().port;
const waitForBattle = async (page, turn) =>
  page.waitForFunction(expected => {
    const state = window.mossvale?.getState();
    return state?.battle?.turn === expected && !state.battle.busy && !!document.querySelector('.battle-intent');
  }, turn);

async function prepare(page, {tactic, turn, focus = 2, foe = 0, party = [], hp = 42, active = null} = {}) {
  await page.goto(`http://localhost:${port()}/?debug&seed=42`);
  await page.waitForSelector('#loading', {state: 'hidden'});
  await page.evaluate(
    ({tactic, turn, focus, foe, party, hp, active}) => {
      const state = window.mossvale.getState();
      const save = state.save;
      if (active !== null) save.active = active;
      if (party.length) {
        save.party = [save.active, ...party];
        save.caught = [...new Set([...save.caught, save.active, ...party])];
        for (const id of party) save.team[id] = {xp: 0, hp: 100};
      }
      save.team[save.active] ??= {xp: 0, hp: 100};
      save.team[save.active].hp = hp;
      save.potions = 1;
      window.mossvale.encounter(foe);
      const battle = window.mossvale.getState().battle;
      battle.boss = true;
      battle.tactic = tactic;
      battle.turn = turn;
      battle.focus = focus;
      battle.power = 1.5;
      battle.max += 48;
      battle.hp = battle.max;
    },
    {tactic, turn, focus, foe, party, hp, active},
  );
}

try {
  const errors = [];
  const touchContext = await browser.newContext({viewport: {width: 390, height: 844}, hasTouch: true});
  const phone = await touchContext.newPage();
  phone.on('pageerror', error => errors.push(error.message));
  await phone.emulateMedia({reducedMotion: 'reduce'});
  await prepare(phone, {tactic: 'spore-guard', turn: 0, focus: 0});
  await phone.tap('#attack');
  await waitForBattle(phone, 1);
  let forecast = await phone.locator('.battle-intent').innerText();
  assert.match(forecast, /After your choice/);
  assert.match(forecast, /Brace deals no damage now/);
  assert.match(forecast, /Element uses ×1\.5 and costs 1 Focus/);
  assert.match(forecast, /Guard's protection expires/);
  assert.match(forecast, /At 0 Focus, Quick Strike or Guard now/);
  assert.match(forecast, /\+8 coins and 10 XP/);
  assert.ok(await phone.locator('.battle-intent').isVisible());
  assert.ok((await phone.evaluate(() => document.documentElement.scrollWidth)) <= 390, 'portrait forecast has no horizontal overflow');
  await phone.screenshot({path: join(tmpdir(), 'mossvale-256-guardian-phone-portrait.png')});

  await phone.setViewportSize({width: 844, height: 390});
  const portraitBox = await phone.locator('.battle-intent').boundingBox();
  assert.ok(portraitBox && portraitBox.x >= 0 && portraitBox.x + portraitBox.width <= 844, 'landscape forecast stays within the viewport');
  assert.match(await phone.locator('.battle-intent').innerText(), /After your choice/);
  await phone.screenshot({path: join(tmpdir(), 'mossvale-256-guardian-phone-landscape.png')});

  const frost = await browser.newPage({viewport: {width: 1440, height: 900}});
  frost.on('pageerror', error => errors.push(error.message));
  const active = 0;
  const frostowl = species.findIndex(entry => entry.id === 'frostowl');
  const resistant = species.findIndex((_, id) => effectiveness(frostowl, id) < effectiveness(frostowl, active));
  assert.notEqual(resistant, -1);
  await prepare(frost, {tactic: 'frost-chorus', turn: 0, foe: frostowl, party: [resistant], active});
  await frost.keyboard.press('1');
  await waitForBattle(frost, 1);
  forecast = await frost.locator('.battle-intent').innerText();
  assert.match(forecast, /second consecutive Element move: ×1\.7 raw damage/);
  assert.match(forecast, /healthy resistant companion/);
  assert.match(forecast, /\+8 coins and 10 XP/);
  assert.match(forecast, /damage if they stay active; Guard reduces it to/);
  assert.equal(await frost.evaluate(() => window.mossvale.getState().modalMode), 'battle', 'forecast does not change battle progression');
  assert.equal(await frost.locator('.battle-intent').isVisible(), true);
  await frost.screenshot({path: join(tmpdir(), 'mossvale-256-guardian-desktop.png')});

  const tidal = await browser.newPage({viewport: {width: 1280, height: 800}});
  tidal.on('pageerror', error => errors.push(error.message));
  await prepare(tidal, {tactic: 'tidal-current', turn: 0, focus: 1});
  await tidal.click('#element');
  await waitForBattle(tidal, 1);
  forecast = await tidal.locator('.battle-intent').innerText();
  assert.match(forecast, /Charge deals no damage/);
  assert.match(forecast, /recover up to 12% of maximum HP/);
  assert.match(forecast, /at 0 Focus you cannot interrupt this charge this turn/);
  assert.match(forecast, /heavy blow follows on its next turn/);
  await tidal.click('#guard');
  await waitForBattle(tidal, 2);
  forecast = await tidal.locator('.battle-intent').innerText();
  assert.match(forecast, /Guard riposte:/);
  assert.match(forecast, /Crash guarded; \+8 coins and 10 XP once if you win/);
  await tidal.evaluate(() => document.querySelector('#fullscreen').click());
  await tidal.waitForFunction(() => document.fullscreenElement === document.querySelector('.game-frame'));
  assert.ok(await tidal.locator('.battle-intent').isVisible(), 'forecast remains readable in fullscreen');
  assert.ok(await tidal.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'fullscreen has no horizontal overflow');
  await tidal.screenshot({path: join(tmpdir(), 'mossvale-256-guardian-fullscreen.png')});
  await tidal.evaluate(() => document.querySelector('#fullscreen').click());
  await tidal.waitForFunction(() => document.fullscreenElement === null);

  assert.deepEqual(errors, []);
  console.log('ok guardian forecasts: desktop keyboard, touch portrait/landscape, reduced motion and fullscreen');
} finally {
  await browser.close();
  server.close();
}
