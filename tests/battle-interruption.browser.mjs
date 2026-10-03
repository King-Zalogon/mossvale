// Capture and its enemy reply are checkpointed before animation, so reload cannot discard or replay the action.
import {chromium} from 'playwright';
import http from 'node:http';
import {readFileSync, existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {extname, join, resolve} from 'node:path';
import {codec, newSave} from './helpers.mjs';
import {species} from '../dist/src/data/species.js';

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

try {
  for (const seed of [8, 43]) {
    const initial = newSave();
    initial.met = true;
    initial.coins = 40;
    initial.orbs = 4;
    const context = await browser.newContext();
    await context.addInitScript(raw => {
      if (localStorage.getItem('mossvale-v3') === null) localStorage.setItem('mossvale-v3', raw);
    }, codec.serialize(initial));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    try {
      await page.goto(url + `?debug&seed=${seed}`);
      await page.waitForSelector('#loading', {state: 'hidden'});
      await page.waitForFunction(() => window.mossvale?.getState().world.map);
      await page.evaluate(() => window.mossvale.encounter(1));
      await page.waitForSelector('#catch:not([disabled])');
      await page.evaluate(() => {
        const state = window.mossvale.getState();
        state.battle.hp = 1;
        state.save.orbs = 4;
      });

      // Reload as soon as the synchronous checkpoint appears, while the capture animation is still running.
      await page.click('#catch');
      await page.waitForFunction(() => {
        const raw = localStorage.getItem('mossvale-v3');
        const save = raw && JSON.parse(raw);
        return save && (save.battle === null || save.battle.turn === 1);
      });
      const savedBeforeReload = await page.evaluate(() => JSON.parse(localStorage.getItem('mossvale-v3')));
      const captured = savedBeforeReload.caught.includes(species[1].id);
      assert.equal(savedBeforeReload.orbs, 3, 'the attempted orb is spent once');
      assert.equal(savedBeforeReload.wins, captured ? 1 : 0);
      assert.equal(savedBeforeReload.battle === null, captured, 'a capture result ends the battle; a miss checkpoints it');
      if (!captured) assert.equal(savedBeforeReload.battle.turn, 1);

      await page.reload();
      await page.waitForSelector('#loading', {state: 'hidden'});
      await page.waitForFunction(() => window.mossvale?.getState().world.map);
      if (captured) {
        await page.waitForFunction(() => /became your friend/.test(document.querySelector('#toast')?.textContent ?? ''));
        await page.waitForFunction(() => JSON.parse(localStorage.getItem('mossvale-v3')).recap === '');
      } else await page.waitForSelector('#catch:not([disabled])');
      const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('mossvale-v3')));
      for (const field of ['orbs', 'coins', 'wins', 'caught', 'team', 'battle'])
        assert.deepEqual(restored[field], savedBeforeReload[field], `${field} is not lost or duplicated`);

      if (captured) {
        assert.match(await page.textContent('#toast'), /became your friend/);
      }
      assert.deepEqual(errors, []);
      console.log(`ok capture ${captured ? 'success' : 'miss'} survives immediate reload after action commit (seed ${seed})`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
