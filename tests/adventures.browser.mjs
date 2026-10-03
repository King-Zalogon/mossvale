// Two adventures in one browser (#67): separate progress, switching and reloading, wrong-pack imports, a missing or
// broken adventure, relocation of an old pack save, and no save overwritten while the game is still loading.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, extname} from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';

const root = resolve('.');
const scratch = mkdtempSync(join(tmpdir(), 'mossvale-adventures-'));
const out = join(scratch, 'site');
const built = spawnSync(process.execPath, ['scripts/build.mjs', '--include', 'tests/fixtures/packs/hearth', '--include', 'tests/fixtures/packs/bakery'], {
  cwd: root,
  env: {...process.env, BUILD_DIR: out},
  encoding: 'utf8',
});
assert.equal(built.status, 0, built.stderr);
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml'};
const broken = new Set(); // paths answered with 404, to simulate a missing adventure
let gate = null; // while set, maps/index.json waits for it
const server = http.createServer(async (request, response) => {
  const name = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (broken.has(name) || !existsSync(join(out, name))) return response.writeHead(404).end();
  if (gate && name === 'maps/index.json') await gate;
  response.writeHead(200, {'content-type': types[extname(name)] ?? 'application/octet-stream'}).end(readFileSync(join(out, name)));
});
server.listen(0);
const url = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
const ctx = await browser.newContext({viewport: {width: 1100, height: 800}});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const stored = key => page.evaluate(k => JSON.parse(localStorage.getItem(k) ?? 'null'), key);
const boot = async (query = '?debug') => {
  await page.goto(url + query);
  await page.waitForFunction(() => window.mossvale);
  await page.waitForSelector('#loading', {state: 'hidden'});
};
const saveNow = () => page.evaluate(() => window.dispatchEvent(new Event('blur'))); // the game saves on blur
const setCoins = async coins => {
  await page.evaluate(c => (window.mossvale.getState().save.coins = c), coins);
  await saveNow();
};
const coins = () => page.evaluate(() => window.mossvale.getState().save.coins);
const regionName = () => page.textContent('#region-name');
const openAdventures = async () => {
  await page.keyboard.press('Escape');
  await page.waitForSelector('#m-adventures');
  await page.click('#m-adventures');
};
const switchTo = async id => {
  await openAdventures();
  await Promise.all([page.waitForEvent('load'), page.click(`[data-adventure="${id}"]`)]);
  await page.waitForFunction(() => window.mossvale);
  await page.waitForSelector('#loading', {state: 'hidden'});
};

try {
  // --- two adventures, separate progress -----------------------------------------------------------
  await boot();
  assert.equal(await regionName(), 'Sunlit Trail');
  await setCoins(111);
  await openAdventures();
  const rows = await page.locator('[data-adventure]').allTextContents();
  assert.equal(rows.length, 3, 'the chooser lists every adventure');
  assert.match(rows[0], /Mossvale · playing now/);
  assert.match(rows[1], /Hearth Hamlet[\s\S]*Not started/);
  assert.match(rows[0], /1 friend/, 'progress is shown without loading the adventure');
  await page.keyboard.press('Escape');

  await switchTo('hearth-hamlet');
  assert.equal(await regionName(), 'Hearth Hamlet');
  assert.equal(await coins(), 0, 'a new adventure starts fresh');
  assert.equal(await page.evaluate(() => localStorage.getItem('mossvale-adventure')), 'hearth-hamlet');
  await setCoins(222);
  assert.equal((await stored('mossvale-v3')).coins, 111, 'the first adventure kept its own save');
  assert.equal((await stored('mossvale-pack-hearth-hamlet-v3')).coins, 222);
  assert.equal((await stored('mossvale-pack-hearth-hamlet-v3')).pack, 'hearth-hamlet');

  await page.reload();
  await page.waitForSelector('#loading', {state: 'hidden'});
  assert.equal(await coins(), 222, 'reload stays in the chosen adventure');

  await switchTo('mossvale');
  assert.equal(await regionName(), 'Sunlit Trail');
  assert.equal(await coins(), 111, 'and the first adventure is exactly as it was left');
  assert.equal((await stored('mossvale-pack-hearth-hamlet-v3')).coins, 222);

  // --- backups and recovery stay with their adventure ------------------------------------------------
  await page.evaluate(() => localStorage.getItem('mossvale-backup')); // the checkpoint exists for the first adventure
  assert.equal((await stored('mossvale-backup')).coins, 111);
  assert.ok(await stored('mossvale-pack-hearth-hamlet-backup'), 'the other adventure has its own checkpoint');
  const hearthFile = JSON.stringify({
    kind: 'mossvale-save-backup',
    format: 1,
    exportedAt: new Date().toISOString(),
    save: await stored('mossvale-pack-hearth-hamlet-v3'),
  });
  await page.keyboard.press('Escape');
  await page.click('#m-backup');
  await page.setInputFiles('#b-file', {name: 'hearth.json', mimeType: 'application/json', buffer: Buffer.from(hearthFile)});
  await page.waitForFunction(() => /Switch to it/.test(document.querySelector('#modal').textContent));
  assert.match(await page.textContent('#modal'), /“?"?Hearth Hamlet"?”?\. Switch to it/);
  assert.equal(await page.locator('#b-confirm').count(), 0, 'a wrong-adventure file cannot even be confirmed');
  assert.equal((await stored('mossvale-v3')).coins, 111, 'nothing was overwritten');
  await page.keyboard.press('Escape');

  // --- settings are shared across adventures -----------------------------------------------------------
  await page.evaluate(() => localStorage.setItem('mossvale-settings', JSON.stringify({sound: false, text: 'large'})));
  await switchTo('hearth-hamlet');
  assert.equal(await page.evaluate(() => document.body.classList.contains('text-large')), true, 'text size follows the player, not the adventure');

  // --- an adventure that is missing or broken never traps the player -------------------------------------
  await page.evaluate(() => localStorage.setItem('mossvale-adventure', 'ghost-pack'));
  await boot();
  assert.equal(await regionName(), 'Sunlit Trail');
  assert.match(await page.locator('#toast').textContent(), /"ghost-pack" is not available/);
  assert.equal((await stored('mossvale-pack-hearth-hamlet-v3')).coins, 222, 'its progress was left alone');

  broken.add('adventures/bakery-row/index.json');
  await page.goto(url + '?debug&adventure=bakery-row');
  await page.waitForSelector('#load-switch:not([hidden])');
  assert.match(await page.textContent('#load-switch'), /Open “Mossvale” instead/);
  assert.equal(await page.locator('#load-retry').isVisible(), true);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal((await stored('mossvale-v3')).coins, 111, 'a failed start writes nothing');
  broken.clear();
  await page.evaluate(() => localStorage.setItem('mossvale-adventure', 'mossvale'));

  // --- a save an older pack build left under the first adventure's keys moves to its own -----------------
  await page.evaluate(() => {
    const raw = localStorage.getItem('mossvale-pack-hearth-hamlet-v3');
    for (const k of Object.keys(localStorage)) if (k.startsWith('mossvale-pack-hearth-hamlet')) localStorage.removeItem(k);
    localStorage.setItem('mossvale-v3.hearth-copy', raw);
    window.__hearth = raw;
  });
  const hearthRaw = await page.evaluate(() => window.__hearth);
  await page.evaluate(raw => localStorage.setItem('mossvale-v3', raw), hearthRaw);
  await page.goto(url + '?debug&adventure=hearth-hamlet');
  await page.waitForSelector('#loading', {state: 'hidden'});
  assert.equal(await coins(), 222, 'the relocated save is the one that loads');
  assert.equal(await page.evaluate(() => localStorage.getItem('mossvale-v3')), null, 'the original key no longer holds another adventure');

  // --- nothing is written while the game is still loading ---------------------------------------------
  const keep = JSON.stringify({version: 3, region: 'meadow', coins: 55, met: true, wins: 3, caught: ['fernling'], seen: ['fernling'], active: 'fernling'});
  await page.evaluate(raw => {
    localStorage.setItem('mossvale-v3', raw);
    localStorage.setItem('mossvale-adventure', 'mossvale');
  }, keep);
  let release;
  gate = new Promise(resolveGate => (release = resolveGate));
  const slow = await ctx.newPage();
  await slow.clock.install();
  await slow.goto(url + '?debug', {waitUntil: 'commit'});
  await slow.clock.runFor(8000); // longer than the 6 s save timer
  await slow.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal(await slow.evaluate(() => localStorage.getItem('mossvale-v3')), keep, 'a loading game never overwrites the real save');
  gate = null;
  release();
  await slow.close();

  assert.deepEqual(errors, []);
  console.log('ok two adventures keep separate progress, backups and recovery');
} finally {
  await browser.close();
  server.close();
  rmSync(scratch, {recursive: true, force: true});
}
