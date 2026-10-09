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
  const context = await browser.newContext();
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
  });
  return {page, errors, context};
}

try {
  // Full motion: numbers float, bars ease, the scene shakes.
  {
    const {page, errors, context} = await open('auto');
    const before = await page.$eval('.fighter:nth-child(2) .bar i', el => el.style.width);
    await page.click('#attack');
    await page.waitForSelector('.fighter:nth-child(2) .dmg-pop');
    const pop = await page.$eval('.fighter:nth-child(2) .dmg-pop', el => el.textContent);
    assert.match(pop, /^-\d+$/, 'the strike shows its damage over the foe');
    assert.equal(await page.$eval('.fighter:nth-child(2) .dmg-pop', el => el.getAttribute('aria-hidden')), 'true');
    assert.ok(await page.$eval('.battle-scene', el => /shake-/.test(el.className)), 'a landed blow shakes the scene');
    assert.ok(await page.$eval('.battle-scene .bar i', el => parseFloat(getComputedStyle(el).transitionDuration) > 0), 'HP bars ease');
    await page.waitForFunction(w => parseFloat(document.querySelector('.fighter:nth-child(2) .bar i').dataset.to) < parseFloat(w), before);
    // Rounds repeat until the foe lands a hit (it sometimes charges or braces instead).
    let ally = null;
    for (let round = 0; round < 8 && !ally; round++) {
      await page.waitForSelector('#attack:not([disabled])');
      await page.evaluate(() => {
        window.__ally = [];
        new MutationObserver(() => {
          const el = document.querySelector('.fighter:nth-child(1) .dmg-pop');
          if (el) window.__ally.push(el.textContent);
        }).observe(document.querySelector('#modal'), {childList: true, subtree: true});
      });
      await page.click('#attack');
      await page.waitForSelector('#attack:not([disabled])', {timeout: 8000}).catch(async e => {
        console.log(round, await page.$eval('#modal', m => m.innerText));
        throw e;
      });
      ally = (await page.evaluate(() => window.__ally))[0] ?? null;
    }
    assert.match(ally ?? '', /^-\d+$/, "the foe's answer shows over your friend");
    await page.waitForSelector('#attack:not([disabled])');
    assert.equal(await page.locator('.dmg-pop').count(), 0, 'numbers clear once the round ends');
    assert.deepEqual(errors, []);
    await context.close();
  }
  // Calm motion: same information, no shake, no sparks, bars jump straight to their value.
  {
    const {page, errors, context} = await open('reduced');
    await page.click('#attack');
    await page.waitForSelector('.fighter:nth-child(2) .dmg-pop');
    assert.equal(await page.locator('.burst').count(), 0);
    assert.ok(!(await page.$eval('.battle-scene', el => /shake-/.test(el.className))), 'calm motion does not shake');
    const bar = await page.$eval('.fighter:nth-child(2) .bar i', el => [el.style.width, el.dataset.to + '%']);
    assert.equal(bar[0], bar[1], 'calm bars are drawn at their final width');
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
