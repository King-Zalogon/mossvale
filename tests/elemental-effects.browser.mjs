// Actual resolved battles: every material, both sides, timing, compact view, calm motion and legacy fallback.
import {chromium} from 'playwright';
import http from 'node:http';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {species} from '../dist/src/data/species.js';

const root = new URL('../dist/', import.meta.url);
const mime = {html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', json: 'application/json', svg: 'image/svg+xml'};
const server = http
  .createServer((request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
    const file = new URL(path, root);
    if (!existsSync(file)) return response.writeHead(404).end();
    response.writeHead(200, {'content-type': mime[path.split('.').pop()] ?? 'application/octet-stream'}).end(readFileSync(file));
  })
  .listen(0);
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
const representatives = [...new Set(species.map(s => s.type))].map(type => species.findIndex(s => s.type === type));
const errors = [];
try {
  const page = await browser.newPage({viewport: {width: 1300, height: 950}});
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://localhost:${server.address().port}/?debug&seed=8`);
  await page.waitForSelector('#loading', {state: 'hidden'});
  await page.waitForFunction(() => window.mossvale?.getState().world.map);
  await page.evaluate(() => {
    window.__effects = [];
    new MutationObserver(() => {
      const canvas = document.querySelector('.elemental-effect');
      if (!canvas) return;
      const scene = canvas.parentElement;
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const box = canvas.getBoundingClientRect(),
        bounds = scene.getBoundingClientRect();
      if (canvas.dataset.stage === 'impact') {
        const capture = document.createElement('canvas');
        capture.width = Math.ceil(bounds.width);
        capture.height = Math.ceil(bounds.height);
        const c = capture.getContext('2d');
        c.fillStyle = '#17352a';
        c.fillRect(0, 0, capture.width, capture.height);
        for (const node of scene.querySelectorAll('canvas')) {
          const b = node.getBoundingClientRect();
          c.drawImage(node, b.left - bounds.left, b.top - bounds.top, b.width, b.height);
        }
        window.__captures ??= {};
        window.__captures[canvas.dataset.element + '-' + canvas.dataset.side + (matchMedia('(prefers-reduced-motion: reduce)').matches ? '-calm' : '-normal')] =
          capture.toDataURL();
      }
      window.__effects.push({
        ...canvas.dataset,
        pixels: [...pixels].filter((v, i) => i % 4 === 3 && v > 0).length,
        log: document.querySelector('.battle-log').textContent,
        hp: [...scene.querySelectorAll('.fighter > small:last-child')].map(n => n.textContent),
        hud: document.querySelector('#health').textContent,
        states: [...scene.querySelectorAll('.fighter canvas')].map(c => c.dataset.combatState),
        pops: scene.querySelectorAll('.dmg-pop').length,
        burst: scene.querySelectorAll('.burst').length,
        within: Math.abs(box.left - bounds.left) < 1 && Math.abs(box.top - bounds.top) < 1 && box.width <= bounds.width + 1 && box.height <= bounds.height + 1,
      });
    }).observe(document.querySelector('#modal'), {childList: true, subtree: true});
  });
  async function encounter(id) {
    await page.evaluate(id => {
      window.__effects = [];
      const save = window.mossvale.getState().save;
      save.active = id;
      save.caught = [id];
      save.party = [id];
      save.team = {[id]: {hp: 100, xp: 0}};
      window.mossvale.encounter(id);
      const battle = window.mossvale.getState().battle;
      battle.hp = battle.max = 999;
      battle.focus = 3;
      battle.turn = 1;
    }, id);
    await page.waitForSelector('#element:not([disabled])');
  }
  for (const calm of [false, true]) {
    await page.emulateMedia({reducedMotion: calm ? 'reduce' : 'no-preference'});
    for (const id of representatives) {
      await encounter(id);
      await page.click('#element');
      await page.waitForFunction(() => !window.mossvale.getState().battle?.busy);
      const frames = await page.evaluate(() => window.__effects);
      for (const side of ['ally', 'enemy']) {
        const shown = frames.filter(frame => frame.side === side);
        assert.deepEqual(
          [...new Set(shown.map(frame => frame.stage))],
          calm ? ['impact'] : ['prepare', 'travel', 'impact'],
          `${species[id].type} ${side} stages`,
        );
        assert.ok(
          shown.every(frame => frame.element === species[id].type && frame.material === 'authored' && frame.pixels > 0 && frame.within && frame.burst === 0),
        );
        if (!calm) {
          for (const frame of shown.filter(frame => frame.stage !== 'impact')) {
            assert.equal(frame.pops, 0, 'damage numbers only at contact');
            assert.doesNotMatch(frame.log, /damage/, 'no hit result before projectile contact');
            assert.equal(frame.states[side === 'ally' ? 1 : 0], 'idle', 'target does not recoil during travel');
          }
          const prepare = shown.find(frame => frame.stage === 'prepare');
          const impact = shown.find(frame => frame.stage === 'impact');
          const target = side === 'ally' ? 1 : 0;
          assert.notEqual(prepare.hp[target], impact.hp[target], 'displayed HP changes at contact');
          assert.ok(impact.pops > 0);
          for (const frame of shown) assert.equal(frame.hud, frame.hp[0].replace(' HP', ''), 'side HUD follows the same presented ally HP');
        } else
          assert.ok(
            shown.every(frame => frame.frame === '4'),
            'calm motion uses one still material impact',
          );
      }
      await page.screenshot({path: `/tmp/mossvale-173-${species[id].type.toLowerCase()}-${calm ? 'calm' : 'full'}-settled.png`});
      await page.click('#flee');
    }
  }
  for (const [name, data] of Object.entries(await page.evaluate(() => window.__captures)))
    writeFileSync(`/tmp/mossvale-173-material-${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
  // Faint replacement stays off screen until the elemental contact on the original ally.
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await encounter(1);
  await page.evaluate(() => {
    const save = window.mossvale.getState().save;
    save.party = save.caught = [1, 2];
    save.team[1].hp = 1;
    save.team[2] = {hp: window.mossvale.maxHP(2), xp: 0};
  });
  await page.click('#element');
  await page.waitForFunction(() => !window.mossvale.getState().battle?.busy);
  assert.ok((await page.evaluate(() => window.__effects)).some(f => f.side === 'enemy' && f.stage === 'impact' && f.states[0] === 'faint'));
  assert.equal(await page.evaluate(() => window.mossvale.getState().save.active), 2);
  assert.match(await page.locator('#fight-buddy').getAttribute('data-combat-asset'), /brooklet/);
  await page.click('#flee');
  // Old packs may omit combat sheets or effect atlases; neutral direction stays playable.
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.evaluate(async () => {
    const {assets} = await import('./src/data/assets.js');
    const {sprites} = await import('./src/render/sprites.js');
    window.__missing = [];
    for (const name of ['effect-elemental-materials', 'creature-fernling-combat']) {
      const id = assets.findIndex(a => a.name === name);
      window.__missing.push([id, sprites[id]]);
      sprites[id] = null;
    }
  });
  await encounter(0);
  await page.click('#element');
  await page.waitForFunction(() => !window.mossvale.getState().battle?.busy);
  assert.ok((await page.evaluate(() => window.__effects)).every(f => f.material === 'neutral-fallback' && f.pixels > 0));
  await page.click('#flee');
  await page.evaluate(async () => {
    const {sprites} = await import('./src/render/sprites.js');
    for (const [id, image] of window.__missing) sprites[id] = image;
  });
  // A custom pack type is selected from live registry data, never a hardcoded species exception.
  await page.evaluate(async () => {
    const {species} = await import('./src/data/species.js');
    window.__type = species[0].type;
    species[0].type = 'Moon';
  });
  await encounter(0);
  await page.click('#element');
  await page.waitForFunction(() => !window.mossvale.getState().battle?.busy);
  assert.ok((await page.evaluate(() => window.__effects)).every(f => f.element === 'Moon' && f.material === 'neutral-fallback'));
  await page.click('#flee');
  await page.evaluate(async () => {
    const {species} = await import('./src/data/species.js');
    species[0].type = window.__type;
  });
  // Compact horizontal view: observe a travelling material in the real scene, then flush on menu.
  await page.setViewportSize({width: 844, height: 390});
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await encounter(1);
  await page.click('#element');
  await page.waitForFunction(() => window.__effects.some(f => f.stage === 'travel'));
  await page.screenshot({path: '/tmp/mossvale-173-landscape-travel.png'});
  await page.waitForFunction(() => !window.mossvale.getState().battle?.busy);
  assert.ok((await page.evaluate(() => window.__effects)).every(f => f.within));
  await page.click('#flee');
  assert.equal(await page.locator('.elemental-effect').count(), 0, 'finished/left battles retain no effect canvas');
  // Cancellation of an in-flight scene: disconnected canvas no longer receives animation frames.
  await encounter(1);
  await page.click('#element');
  await page.waitForSelector('.elemental-effect[data-stage="travel"]');
  const detached = await page.evaluateHandle(() => {
    const canvas = document.querySelector('.elemental-effect');
    canvas.remove();
    return canvas;
  });
  const frame = await detached.evaluate(c => c.dataset.frame);
  await page.waitForTimeout(100);
  assert.equal(await detached.evaluate(c => c.dataset.frame), frame);
  await page.waitForFunction(() => !window.mossvale.getState().battle?.busy);
  await page.click('#flee');
  // Real lifecycle flush skips pending effects and preserves already-committed damage.
  await encounter(1);
  await page.click('#element');
  await page.waitForFunction(() => window.__effects.some(f => f.stage === 'travel'));
  const resolved = await page.evaluate(() => ({hp: window.mossvale.getState().battle.hp, mine: window.mossvale.getState().save.team[1].hp}));
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForFunction(() => !window.mossvale.getState().battle?.busy);
  assert.equal(await page.locator('.elemental-effect').count(), 0);
  assert.deepEqual(await page.evaluate(() => ({hp: window.mossvale.getState().battle.hp, mine: window.mossvale.getState().save.team[1].hp})), resolved);
  await page.click('#flee');
  assert.deepEqual(errors, []);
  console.log(
    'ok all 12 elemental materials in actual battles, both sides, pre-contact HP/text, calm motion, legacy fallback, landscape bounds and cancelled RAF',
  );
} finally {
  await browser.close();
  server.close();
}
