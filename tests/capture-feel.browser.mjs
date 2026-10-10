// Capture and victory beats: orb throw, wobbles, settle or break-free, defeated foe fades, rewards float up. Calm motion keeps it short.
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

async function open(motion, seed, owned = false) {
  const initial = newSave();
  initial.met = true;
  initial.orbs = 30;
  if (owned) {
    initial.caught.push(1);
    initial.team[1] = {xp: 0, hp: 1};
  }
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
  await page.goto(url + `?debug&seed=${seed}`);
  await page.waitForSelector('#loading', {state: 'hidden'});
  await page.waitForFunction(() => window.mossvale?.getState().world.map);
  return {page, errors, context};
}

/** Records every distinct orb state, burst, pop text and foe class seen while the modal re-renders. */
async function observe(page) {
  await page.evaluate(() => {
    window.__orbNodes = new WeakSet();
    window.__seen = {orbs: [], captureFrames: [], pops: new Set(), bursts: 0, foe: new Set(), ally: new Set()};
    new MutationObserver(() => {
      const orb = document.querySelector('.orb-ball');
      // Each rendered frame replaces the markup, so a new element is a new beat.
      if (orb && !window.__orbNodes.has(orb)) {
        window.__orbNodes.add(orb);
        window.__seen.orbs.push([...orb.classList].find(c => c.startsWith('orb-') && c !== 'orb-ball'));
        window.__seen.captureFrames.push({
          orb: window.__seen.orbs.at(-1),
          status: document.querySelector('.capture-status')?.textContent,
          message: document.querySelector('.battle-log')?.textContent,
          enabled: document.querySelectorAll('.battle-actions button:not([disabled]), #flee:not([disabled])').length,
        });
      }
      for (const el of document.querySelectorAll('.dmg-pop')) window.__seen.pops.add(el.textContent);
      if (document.querySelector('.burst')) window.__seen.bursts++;
      const wild = document.querySelector('#fight-wild');
      if (wild) for (const c of wild.classList) window.__seen.foe.add(c);
      const buddy = document.querySelector('#fight-buddy');
      if (buddy) for (const c of buddy.classList) window.__seen.ally.add(c);
    }).observe(document.querySelector('#modal'), {childList: true, subtree: true, attributes: true});
  });
}
/** A turn is over when either the encounter continues with controls enabled, or the result screen is showing. */
const settled = page =>
  page.waitForFunction(
    () =>
      document.querySelector('#result-continue') ||
      (window.mossvale.getState().battle &&
        !window.mossvale.getState().battle.busy &&
        document.querySelector('#catch:not([disabled]), #attack:not([disabled])')),
    null,
    {timeout: 20000},
  );
const seen = page =>
  page.evaluate(() => ({
    orbs: window.__seen.orbs,
    captureFrames: window.__seen.captureFrames,
    pops: [...window.__seen.pops],
    bursts: window.__seen.bursts,
    foe: [...window.__seen.foe],
    ally: [...window.__seen.ally],
  }));

try {
  // Full motion, success: throw, three wobbles, settle, stars, rewards float, result screen.
  {
    const {page, errors, context} = await open('auto', 4);
    await page.evaluate(() => window.mossvale.encounter(1));
    await page.waitForSelector('#catch:not([disabled])');
    await page.evaluate(() => (window.mossvale.getState().battle.hp = 1));
    await observe(page);
    let caught = false;
    for (let attempt = 0; attempt < 8 && !caught; attempt++) {
      await page.evaluate(() => (window.mossvale.getState().battle.hp = 1));
      const beforeStatus = await page.locator('.capture-status').textContent();
      await page.click('#catch');
      await page.waitForSelector('.orb-ball.orb-wobble');
      assert.equal(await page.locator('.capture-status').textContent(), beforeStatus, 'capture keeps the pre-throw status until resolution');
      await settled(page);
      caught = await page.evaluate(() => !window.mossvale.getState().battle);
    }
    assert.ok(caught, 'a weakened creature is caught within a few throws');
    const s = await seen(page);
    const closed = s.orbs.slice(-6);
    assert.deepEqual(
      [...new Set(s.orbs.slice(-6))].filter(x => x !== 'orb-wobble'),
      ['orb-throw', 'orb-caught'],
      `throw then settle (${s.orbs})`,
    );
    assert.ok(s.orbs.filter(x => x === 'orb-wobble').length >= 3, `three wobbles before it settles (${closed})`);
    assert.ok(s.foe.includes('inside-orb'), 'the creature is hidden while the orb holds it');
    assert.ok(s.bursts > 0, 'stars burst when the orb settles');
    assert.ok(
      s.captureFrames.filter(f => ['orb-throw', 'orb-wobble'].includes(f.orb)).every(f => f.status === 'Not yet befriended'),
      'success remains hidden until the orb settles',
    );
    assert.ok(
      s.captureFrames.some(f => f.orb === 'orb-caught' && f.status === '✓ Already befriended'),
      'the settled orb reveals success',
    );
    assert.ok(
      s.captureFrames.every(f => f.enabled === 0),
      'battle actions remain locked during capture',
    );
    assert.ok(s.pops.some(t => /^\+\d+ XP$/.test(t)) && s.pops.some(t => /^\+\d+$/.test(t)), `rewards float up (${s.pops})`);
    assert.equal((await page.locator('#result-continue, .result').count()) > 0 || (await page.locator('#modal').innerText()).length > 0, true);
    assert.deepEqual(errors, []);
    await context.close();
  }
  // Full motion, miss: the orb opens and the creature pops back out.
  {
    const {page, errors, context} = await open('auto', 9);
    await observe(page);
    let broke = false;
    for (let attempt = 0; attempt < 14 && !broke; attempt++) {
      // A fresh full-health creature is rarely caught; if one is, meet another and try again.
      if (await page.locator('#result-continue').count()) await page.click('#result-continue');
      if (!(await page.evaluate(() => !!window.mossvale.getState().battle))) await page.evaluate(() => window.mossvale.encounter(1));
      await page.waitForSelector('#catch:not([disabled])', {timeout: 15000});
      const beforeStatus = await page.locator('.capture-status').textContent();
      await page.click('#catch');
      await page.waitForSelector('.orb-ball.orb-wobble');
      assert.equal(await page.locator('.capture-status').textContent(), beforeStatus, 'a failed capture keeps the pre-throw status until resolution');
      await settled(page);
      broke = (await seen(page)).orbs.includes('orb-break');
    }
    const s = await seen(page);
    assert.ok(s.orbs.includes('orb-break'), `a failed throw opens the orb (${s.orbs})`);
    assert.ok(s.foe.includes('pop-out'), 'the creature pops back out');
    assert.ok(
      s.captureFrames.filter(f => f.orb === 'orb-wobble').every(f => f.message === 'The orb wobbles…'),
      'wobbles do not anticipate failure',
    );
    assert.deepEqual(errors, []);
    await context.close();
  }
  // Victory: the foe fades, your friend hops, XP and coins float up.
  {
    const {page, errors, context} = await open('auto', 3);
    await page.evaluate(() => window.mossvale.encounter(1));
    await page.waitForSelector('#attack:not([disabled])');
    await page.evaluate(() => (window.mossvale.getState().battle.hp = 1));
    await observe(page);
    await page.click('#attack');
    await settled(page);
    const s = await seen(page);
    assert.ok(s.foe.includes('foe-out'), 'the defeated creature fades out');
    assert.ok(s.ally.includes('victory'), 'your friend hops');
    assert.ok(
      s.pops.some(t => /^\+\d+ XP$/.test(t)),
      `XP floats up (${s.pops})`,
    );
    assert.deepEqual(errors, []);
    await context.close();
  }
  // Calm motion: same information, no hopping, no sparks, a single wobble.
  {
    const {page, errors, context} = await open('reduced', 4);
    await page.evaluate(() => window.mossvale.encounter(1));
    await page.waitForSelector('#catch:not([disabled])');
    await page.evaluate(() => (window.mossvale.getState().battle.hp = 1));
    await observe(page);
    for (let attempt = 0; attempt < 8; attempt++) {
      await page.evaluate(() => window.mossvale.getState().battle && (window.mossvale.getState().battle.hp = 1));
      if (!(await page.evaluate(() => !!window.mossvale.getState().battle))) break;
      await page.waitForSelector('#catch:not([disabled])', {timeout: 8000});
      await page.click('#catch');
      await settled(page);
    }
    const s = await seen(page);
    assert.equal(s.bursts, 0, 'no sparks in calm motion');
    assert.ok(
      s.captureFrames.filter(f => ['orb-throw', 'orb-wobble'].includes(f.orb)).every(f => f.status === 'Not yet befriended'),
      'calm motion preserves suspense until resolution',
    );
    assert.ok(
      s.captureFrames.some(f => f.orb === 'orb-caught' && f.status === '✓ Already befriended'),
      'calm motion reveals the successful result',
    );
    const wobbleRuns = s.orbs.join(',').match(/(orb-wobble,?)+/g) ?? [];
    assert.ok(
      wobbleRuns.every(run => run.split(',').filter(Boolean).length === 1),
      `calm motion shows a single wobble per throw (${s.orbs})`,
    );
    assert.deepEqual(errors, []);
    await context.close();
  }
  // Previously owned creatures retain their baseline status; it is not a new capture confirmation.
  {
    const {page, errors, context} = await open('reduced', 4, true);
    await page.evaluate(() => window.mossvale.encounter(1));
    await page.waitForSelector('#catch:not([disabled])');
    await page.evaluate(() => (window.mossvale.getState().battle.hp = 1));
    await observe(page);
    await page.click('#catch');
    await settled(page);
    const s = await seen(page);
    assert.ok(s.captureFrames.length > 0);
    assert.ok(
      s.captureFrames.every(f => f.status === '✓ Already befriended' && f.enabled === 0),
      'ownership remains accurate and actions locked for a repeated capture',
    );
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
