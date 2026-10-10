// Actual shrine interaction, battle atlas selection, reload and all preview frames (#315).
import {chromium} from 'playwright';
import http from 'node:http';
import {existsSync, readFileSync, mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {species} from '../dist/src/data/species.js';
const root = new URL('../dist/', import.meta.url);
const types = {html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png'};
const server = http
  .createServer((req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
    const file = new URL(name, root);
    if (!existsSync(file)) return void res.writeHead(404).end();
    res.writeHead(200, {'content-type': types[name.split('.').pop()] ?? 'application/octet-stream'}).end(readFileSync(file));
  })
  .listen(0);
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
const base = `http://localhost:${server.address().port}`;
const forms = {
  meadow: 'mushmallow-thorn-mantle',
  'amber-ridge': 'pebblit-crystal-ridge',
  'frostveil-grove': 'frostowl-ice-mantle',
  'reedfen-wetlands': 'siltkip-tide-sail',
};
try {
  const page = await browser.newPage({viewport: {width: 1200, height: 1000}});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/guardian-combat-preview.html`);
  await page.waitForSelector('#species[data-ready="true"]');
  assert.equal(await page.locator('[data-state]').count(), 80);
  assert.equal(await page.locator('[data-pair]').count(), 8);
  assert.ok(
    await page.locator('canvas').evaluateAll(canvases =>
      canvases.every(c => {
        const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        return [...data].some((v, i) => i % 4 === 3 && v > 0);
      }),
    ),
    'every individual state frame and animated pair is drawn',
  );
  assert.ok(
    await page
      .locator('canvas')
      .evaluateAll(canvases => canvases.every(c => c.getBoundingClientRect().width === 160 && c.getBoundingClientRect().height === 145)),
    'CSS preserves actual battle scale',
  );
  for (const state of ['idle', 'attack', 'hit', 'faint', 'capture']) {
    await page.selectOption('#animation', state);
    await page.check('#calm');
    await page.click('#replay');
    assert.deepEqual(
      await page.locator('[data-pair="form"]').evaluateAll(cs => cs.map(c => [c.dataset.combatState, c.dataset.combatFrame])),
      Array(4).fill([state, state === 'idle' ? '0' : '3']),
    );
  }
  await page.selectOption('#animation', 'idle');
  if (process.env.GUARDIAN_CAPTURE_REVIEW === '1') mkdirSync('art/characters/reviews/315', {recursive: true});
  if (process.env.GUARDIAN_CAPTURE_REVIEW === '1') await page.screenshot({path: 'art/characters/reviews/315/guardian-forms.png', fullPage: true});
  await page.uncheck('#calm');
  await page.selectOption('#animation', 'attack');
  await page.waitForFunction(() => [...document.querySelectorAll('[data-pair="form"]')].every(c => c.dataset.combatState === 'idle'));
  assert.deepEqual(
    await page.locator('[data-pair="form"]').evaluateAll(cs => cs.map(c => c.dataset.combatAsset)),
    Object.values(forms).map(form => `creature-${form}-combat`),
    'idle return retains every override',
  );
  await page.setViewportSize({width: 390, height: 844});
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), 'frame wrapping avoids mobile horizontal overflow');
  for (const [mapId, form] of Object.entries(forms)) {
    const context = await browser.newContext({reducedMotion: 'reduce'});
    const game = await context.newPage({viewport: {width: 1280, height: 950}});
    game.on('pageerror', e => errors.push(e.message));
    await game.goto(`${base}/?debug&seed=42`);
    await game.waitForSelector('#loading', {state: 'hidden'});
    const foe = species.findIndex(s => form.startsWith(s.id + '-'));
    await game.evaluate(
      ({mapId, foe}) => {
        const state = window.mossvale.getState(),
          s = state.save;
        s.caught = [0, foe];
        s.party = [foe, 0];
        s.active = foe;
        s.team[0] = {xp: 0, hp: 100};
        s.team[foe] = {xp: 0, hp: 100};
        s.badges = [0, 1, 2, 3];
        window.mossvale.travel(mapId);
        s.badges = Array.from({length: s.region}, (_, i) => i);
        s.mapFlags = [];
        const shrine = window.mossvale.getState().world.map.objects.find(o => o.kind === 'shrine');
        state.player.x = shrine.x + 0.8;
        state.player.y = shrine.y;
        window.mossvale.interact();
      },
      {mapId, foe},
    );
    await game.waitForSelector('#challenge');
    await game.click('#challenge');
    await game.waitForSelector('#fight-wild');
    await game.waitForSelector(`#fight-wild[data-combat-asset="creature-${form}-combat"]`);
    assert.equal(await game.locator('.guardian-reveal').count(), 0, 'guardian form appears after its introduction completes');
    assert.equal(await game.locator('#fight-wild').getAttribute('data-combat-asset'), `creature-${form}-combat`);
    assert.equal(
      await game.locator('#fight-buddy').getAttribute('data-combat-asset'),
      `creature-${species[foe].id}-combat`,
      'same species ally retains normal art',
    );
    assert.equal(await game.locator('#catch').isDisabled(), true);
    if (process.env.GUARDIAN_CAPTURE_REVIEW === '1') await game.screenshot({path: `art/characters/reviews/315/${mapId}-battle.png`});
    await game.click('#guard');
    await game.waitForFunction(() => window.mossvale.getState().battle?.turn === 1 && !window.mossvale.getState().battle.busy);
    await game.reload();
    await game.waitForSelector('#fight-wild');
    assert.equal(await game.locator('#fight-wild').getAttribute('data-combat-asset'), `creature-${form}-combat`, 'resumed shrine resolves its configured form');
    await game.click('#flee');
    await game.waitForFunction(() => window.mossvale.getState().phase === 'explore');
    await game.evaluate(foe => window.mossvale.encounter(foe), foe);
    await game.waitForSelector('#fight-wild');
    assert.equal(await game.locator('#fight-wild').getAttribute('data-combat-asset'), `creature-${species[foe].id}-combat`, 'ordinary encounter stays normal');
    await context.close();
  }
  // Exercise the shared renderer's optional-sheet failure chain directly in a loaded preview.
  await page.evaluate(async () => {
    const {assets} = await import('./src/data/assets.js');
    const {sprites, drawCreatureAnimated} = await import('./src/render/sprites.js');
    const {species} = await import('./src/data/species.js');
    const id = species.findIndex(s => s.id === 'mushmallow'),
      override = assets.findIndex(a => a.name === 'creature-mushmallow-thorn-mantle-combat'),
      normal = assets.findIndex(a => a.name === 'creature-mushmallow-combat');
    const canvas = document.querySelector('[data-pair="form"]');
    sprites[override] = undefined;
    drawCreatureAnimated(canvas, id, 107, 'attack', true, override);
    window.fallback1 = canvas.dataset.combatAsset;
    sprites[normal] = undefined;
    drawCreatureAnimated(canvas, id, 107, 'idle', true, override);
    window.fallback2 = canvas.dataset.combatAsset;
  });
  assert.equal(await page.evaluate(() => window.fallback1), 'creature-mushmallow-combat');
  assert.equal(await page.evaluate(() => window.fallback2), 'creature-mushmallow');
  assert.deepEqual(errors, []);
  console.log(
    'ok four shrine-only forms, same-species normal allies/wilds, reload, all eighty frames, idle return, reduced motion, actual scale and missing-sheet fallback',
  );
} finally {
  await browser.close();
  server.close();
}
