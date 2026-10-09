// Battle presentation: floating numbers, eased HP bars, scene shake and element sparks, with a calm-motion alternative.
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

async function open(motion) {
  const initial = newSave();
  initial.met = true;
  const context = await browser.newContext({reducedMotion: 'no-preference'});
  await context.addInitScript(
    ([raw, settings]) => {
      if (localStorage.getItem('mossvale-v3') === null) localStorage.setItem('mossvale-v3', raw);
      localStorage.setItem('mossvale-settings', settings);
    },
    [codec.serialize(initial), JSON.stringify({motion})],
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url + '?debug&seed=8');
  await page.waitForSelector('#loading', {state: 'hidden'});
  await page.waitForFunction(() => window.mossvale?.getState().world.map);
  await page.evaluate(() => window.mossvale.encounter(1));
  await page.waitForSelector('#attack:not([disabled])');
  await page.evaluate(() => {
    const battle = window.mossvale.getState().battle;
    battle.hp = battle.max = 400; // survive the round so the foe answers
    // Capture feedback in the rendering document, before the short-lived frame is replaced. A wait then
    // separate locator reads can otherwise inspect different frames on a loaded browser worker.
    window.__feedback = [];
    new MutationObserver(() => {
      const scene = document.querySelector('.battle-scene');
      if (!scene) return;
      const ally = scene.querySelector('.fighter:nth-child(1) .dmg-pop');
      const enemy = scene.querySelector('.fighter:nth-child(2) .dmg-pop');
      if (!ally && !enemy) return;
      const bar = scene.querySelector('.fighter:nth-child(2) .bar i');
      window.__feedback.push({
        ally: ally?.textContent,
        enemy: enemy?.textContent,
        hidden: enemy?.getAttribute('aria-hidden'),
        shake: /shake-/.test(scene.className),
        bursts: scene.querySelectorAll('.burst').length,
        duration: parseFloat(getComputedStyle(bar).transitionDuration),
        width: bar.style.width,
        target: bar.dataset.to + '%',
      });
    }).observe(document.querySelector('#modal'), {childList: true, subtree: true});
  });
  return {page, errors, context};
}

try {
  {
    const {page, errors, context} = await open('auto');
    const before = await page.$eval('.fighter:nth-child(2) .bar i', el => el.style.width);
    await page.click('#attack');
    await page.waitForFunction(() => window.__feedback.some(frame => frame.enemy));
    const strike = await page.evaluate(() => window.__feedback.find(frame => frame.enemy));
    assert.match(strike.enemy, /^-\d+$/, 'the strike shows its damage over the foe');
    assert.equal(strike.hidden, 'true');
    assert.equal(strike.shake, true, 'a landed blow shakes the scene');
    assert.ok(strike.duration > 0, `HP bars ease: ${JSON.stringify(strike)}`);
    assert.ok(parseFloat(strike.target) < parseFloat(before), 'the foe bar moves to its lower HP');
    let ally;
    for (let round = 0; round < 8; round++) {
      await page.waitForSelector('#attack:not([disabled])', {timeout: 15000});
      ally = await page.evaluate(() => window.__feedback.find(frame => frame.ally)?.ally);
      if (ally) break;
      await page.click('#attack');
    }
    assert.match(ally ?? '', /^-\d+$/, "the foe's answer shows over your friend");
    await page.waitForSelector('#attack:not([disabled])');
    assert.equal(await page.locator('.dmg-pop').count(), 0, 'numbers clear once the round ends');
    assert.deepEqual(errors, []);
    await context.close();
  }
  {
    const {page, errors, context} = await open('reduced');
    await page.click('#attack');
    await page.waitForFunction(() => window.__feedback.some(frame => frame.enemy));
    const strike = await page.evaluate(() => window.__feedback.find(frame => frame.enemy));
    assert.match(strike.enemy, /^-\d+$/, 'calm motion retains the damage information');
    assert.equal(strike.bursts, 0);
    assert.equal(strike.shake, false, 'calm motion does not shake');
    assert.equal(strike.width, strike.target, 'calm bars are drawn at their final width');
    assert.equal(strike.duration, 0, 'calm bars do not transition');
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('ok full/calm battle feedback: damage, HP transitions, shake, enemy replies and cleanup');
} finally {
  await browser.close();
  server.close();
}
