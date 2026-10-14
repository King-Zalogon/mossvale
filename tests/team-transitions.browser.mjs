// Team transitions in battle: recall and send-in on a switch, faint then the next friend stepping in, last-friend faint, and level-up.
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

async function open(motion, seed) {
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
  await page.goto(url + `?debug&seed=${seed}`);
  await page.waitForSelector('#loading', {state: 'hidden'});
  await page.waitForFunction(() => window.mossvale?.getState().world.map);
  return {page, errors, context};
}

/** Two friends on the team (0 active), a foe too sturdy to fall; `hp` sets the active friend's health. */
async function start(page, {hp = 40, team = [0, 1], xp = 0} = {}) {
  await page.evaluate(
    ({hp, team, xp}) => {
      const save = window.mossvale.getState().save;
      save.active = team[0];
      save.party = team;
      save.caught = [...new Set([...save.caught, ...team])];
      save.team = Object.fromEntries(team.map((id, i) => [id, {xp: i === 0 ? xp : 0, hp: i === 0 ? hp : 60}]));
      window.mossvale.encounter(2);
      window.mossvale.getState().battle.hp = window.mossvale.getState().battle.max = 900;
    },
    {hp, team, xp},
  );
  await page.waitForSelector('#attack:not([disabled])');
}

/** Records, in order, the ally canvas class, the ally name line, floating numbers, sparks and the log while the modal re-renders. */
async function observe(page) {
  await page.evaluate(() => {
    window.__t = {classes: [], names: [], pops: [], log: [], bursts: 0};
    const push = (list, value) => value !== undefined && list.at(-1) !== value && list.push(value);
    new MutationObserver(() => {
      const buddy = document.querySelector('#fight-buddy');
      if (buddy) push(window.__t.classes, buddy.className.replace(/\bcreature-(sprite|idle)\b/g, '').trim());
      push(window.__t.names, document.querySelector('.fighter .name-line')?.textContent);
      for (const el of document.querySelectorAll('.fighter:nth-child(1) .dmg-pop'))
        if (!window.__t.pops.includes(el.textContent)) window.__t.pops.push(el.textContent);
      if (document.querySelector('.fighter:nth-child(1) .burst')) window.__t.bursts++;
      push(window.__t.log, document.querySelector('.battle-log')?.textContent);
    }).observe(document.querySelector('#modal'), {childList: true, subtree: true, attributes: true, attributeFilter: ['class']});
  });
}
const seen = page => page.evaluate(() => window.__t);
const idle = page =>
  page.waitForFunction(() => window.mossvale.getState().battle?.busy === false || document.querySelector('#result-continue'), null, {timeout: 25000});

try {
  // Switching: the outgoing friend is recalled, the next is sent in.
  for (const motion of ['auto', 'reduced']) {
    const {page, errors, context} = await open(motion, 5);
    await start(page);
    await observe(page);
    await page.click('#switch');
    await page.click('[data-select="1"]');
    await page.waitForFunction(() => window.mossvale.getState().save.active === 1);
    await idle(page);
    const t = await seen(page);
    const recall = t.classes.indexOf('recall');
    const sendIn = t.classes.indexOf('send-in');
    assert.ok(recall >= 0 && sendIn > recall, `recall then send-in (${t.classes}) [${motion}]`);
    assert.ok(t.log.some(text => /come back!/.test(text)) && t.log.some(text => /joined the encounter/.test(text)));
    assert.ok(t.names.some(text => /Fernling/.test(text)) && t.names.some(text => /Emberkin/.test(text)), `the name line follows the swap (${t.names})`);
    if (motion === 'reduced') assert.equal(t.bursts, 0, 'no sparks in calm motion');
    else assert.ok(t.bursts > 0, 'sparks when the next friend arrives');
    assert.deepEqual(errors, []);
    await context.close();
  }
  // A friend falls: the blow, the faint, then the next friend steps in.
  {
    const {page, errors, context} = await open('auto', 7);
    await start(page, {hp: 1});
    await observe(page);
    await page.click('#attack');
    await page.waitForFunction(() => window.mossvale.getState().save.active === 1, null, {timeout: 25000});
    await idle(page);
    const t = await seen(page);
    const out = t.classes.indexOf('ally-out');
    assert.ok(out >= 0 && t.classes.indexOf('send-in') > out, `faint fades before the replacement arrives (${t.classes})`);
    assert.ok(t.log.some(text => /fainted!/.test(text)) && t.log.some(text => /stepped in!/.test(text)));
    assert.deepEqual(errors, []);
    await context.close();
  }
  // The last friend falls: the faint plays before the result screen.
  {
    const {page, errors, context} = await open('auto', 7);
    await start(page, {hp: 1, team: [0]});
    await observe(page);
    await page.click('#attack');
    await page.waitForSelector('#result-continue', {timeout: 25000});
    const t = await seen(page);
    assert.ok(t.classes.includes('ally-out'), `the last friend fades before the result (${t.classes})`);
    assert.ok(t.log.some(text => /fainted!/.test(text)));
    assert.deepEqual(errors, []);
    await context.close();
  }
  // A level-up gets its own beat after the victory, and the name line only changes then.
  {
    const {page, errors, context} = await open('auto', 3);
    await start(page, {xp: 44});
    const before = await page.evaluate(() => window.mossvale.level(window.mossvale.getState().save.active));
    await page.evaluate(() => (window.mossvale.getState().battle.hp = 1));
    await observe(page);
    await page.click('#attack');
    await page.waitForSelector('#result-continue', {timeout: 25000});
    const after = await page.evaluate(() => window.mossvale.level(window.mossvale.getState().save.active));
    assert.equal(after, before + 1, 'the test really crossed a level');
    const t = await seen(page);
    assert.ok(
      t.classes.includes('victory') && t.classes.includes('level-up') && t.classes.indexOf('level-up') > t.classes.indexOf('victory'),
      `victory then level-up (${t.classes})`,
    );
    assert.ok(t.pops.includes(`Lv. ${after}!`), `the new level floats up (${t.pops})`);
    assert.ok(t.log.some(text => new RegExp(`reached level ${after}!`).test(text)));
    const lastOld = t.names.findIndex(text => text.includes(`Lv. ${before}`));
    const firstNew = t.names.findIndex(text => text.includes(`Lv. ${after}`));
    assert.ok(lastOld >= 0 && firstNew > lastOld, `the old level shows until the level-up beat (${t.names})`);
    assert.ok(t.bursts > 0);
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
