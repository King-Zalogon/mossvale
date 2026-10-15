// Brackenwake Commons (#277) through real play on desktop and phone: entry from the Meadow, an optional conversation,
// free rest, a creature habitat that never starts a battle, the way back, and reload. Set BRACKENWAKE_REVIEW=dir to save screenshots.
import {chromium} from 'playwright';
import http from 'node:http';
import {readFileSync, existsSync, mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {codec, newSave} from './helpers.mjs';

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
const review = process.env.BRACKENWAKE_REVIEW;
if (review) mkdirSync(review, {recursive: true});

async function run(label, viewport, touch) {
  const ctx = await browser.newContext({viewport, hasTouch: touch, isMobile: touch});
  const initial = newSave();
  initial.met = true;
  initial.coins = 10;
  await ctx.addInitScript(
    `if (!localStorage.getItem('mossvale-v3')) localStorage.setItem('mossvale-v3', ${JSON.stringify(codec.serialize(initial))}); localStorage.setItem('mossvale-settings', '{"motion":"reduced"}')`,
  );
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url + '?debug&seed=277');
  await page.waitForSelector('#loading', {state: 'hidden'});
  const state = () => page.evaluate(() => window.mossvale.getState());
  const place = (x, y) => page.evaluate(([px, py]) => Object.assign(window.mossvale.getState().player, {x: px, y: py}), [x, y]);
  const press = async () => {
    await page.waitForTimeout(350); // past the shared double-tap guard
    return touch ? page.locator('#touch-e').tap() : page.keyboard.press('e');
  };
  const advance = async (force = false) => {
    await page.waitForTimeout(350);
    if (!touch) return page.keyboard.press('e');
    // The ranger menu stays open under its own speech, so a physical tap can be intercepted there.
    return force ? page.locator('#speech-next').dispatchEvent('click') : page.locator('#speech-next').tap();
  };
  const shot = async name => review && (await page.screenshot({path: `${review}/${label}-${name}.png`}));
  const speech = () => page.textContent('#speech-text');
  const talk = async (x, y, expected) => {
    await place(x, y);
    await page.waitForFunction(() => document.querySelector('#interact').style.display === 'block');
    await press();
    await page.waitForSelector('#speech-bubble:not([hidden])');
    assert.match(await speech(), expected);
  };
  const closeSpeech = async (force = false) => {
    for (let n = 0; n < 4 && (await page.locator('#speech-bubble:not([hidden])').count()); n++) {
      await advance(force);
      await page.waitForTimeout(120);
    }
  };

  if (touch) await page.locator('#game').tap(); // switches to the touch controls, as a real tap would
  assert.equal((await state()).save.mapId, 'meadow');
  // Enter through the real gate at the end of the south trail.
  await place(52.5, 59.9);
  await page.waitForFunction(() => document.querySelector('#interact').style.display === 'block');
  assert.match(await page.textContent('#interact'), /Brackenwake/);
  await press();
  await page.waitForFunction(() => window.mossvale.getState().save.mapId === 'brackenwake-commons');
  assert.equal(await page.textContent('#region-name'), 'Brackenwake Commons');
  const arrival = await state();
  assert.deepEqual([arrival.player.x, arrival.player.y], [28, 4.8]);
  assert.deepEqual(arrival.world.map.zones, [], 'a settlement has no encounter zones');
  await page.waitForTimeout(400);
  await shot('arrival');

  // Walk the north lane toward the pond with the keyboard (desktop): nothing starts a fight. The phone run keeps touch controls.
  if (!touch) {
    await page.keyboard.down('s');
    await page.waitForFunction(() => window.mossvale.getState().player.y > 8, null, {timeout: 10000});
    await page.keyboard.up('s');
    assert.ok((await state()).player.y > 5, 'the player walks into town');
  }
  assert.equal((await state()).battle, null);

  // An optional conversation, then free rest.
  await talk(43, 19.6, /press green|Fernling/);
  await shot('conversation');
  await closeSpeech();
  await place(21.5, 15.8);
  await page.waitForFunction(() => document.querySelector('#interact').style.display === 'block');
  await press();
  await page.waitForSelector('#speech-bubble:not([hidden])');
  assert.match(await speech(), /Brackenwake Commons|Meadow seal/);
  await advance();
  await page.waitForSelector('#rest-team');
  const coinsBefore = (await state()).save.coins;
  await (touch ? page.locator('#rest-team').tap() : page.click('#rest-team'));
  await page.waitForFunction(() => document.querySelector('#speech-text')?.textContent.includes('rested'));
  assert.equal((await state()).save.coins, coinsBefore, 'rest is free');
  await shot('ranger');
  await closeSpeech(true);
  await page.evaluate(() => document.querySelector('#modal .close')?.click()); // not Escape: a key press would leave touch mode
  await page.waitForFunction(() => document.querySelector('#modal')?.hidden !== false);

  // A habitat is optional flavour: it speaks and never starts a battle.
  await talk(31.6, 39.2, /Fernling/);
  assert.equal((await state()).battle, null);
  await closeSpeech();
  await shot('garden');

  // Reload in town keeps the map and the visit.
  await page.reload();
  await page.waitForSelector('#loading', {state: 'hidden'});
  assert.equal((await state()).world.map.id, 'brackenwake-commons');
  assert.ok((await state()).save.visitedMaps.includes('brackenwake-commons'));

  // The way back is open, ungated and lands on the Meadow trail.
  await place(28, 3.6);
  await page.waitForFunction(() => document.querySelector('#interact').style.display === 'block');
  assert.match(await page.textContent('#interact'), /Meadow/);
  await press();
  await page.waitForFunction(() => window.mossvale.getState().save.mapId === 'meadow');
  const back = await state();
  assert.deepEqual([back.player.x, back.player.y], [52.5, 58.4]);
  assert.deepEqual(errors, [], label);
  await ctx.close();
  console.log(`ok brackenwake commons: ${label} entry, conversation, free rest, habitat, reload and return`);
}

try {
  await run('desktop', {width: 1280, height: 800}, false);
  await run('phone', {width: 390, height: 844}, true);
} finally {
  await browser.close();
  server.close();
}
