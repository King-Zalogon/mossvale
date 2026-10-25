// Pack compatibility across engine updates (#283): a second adventure whose manifest declares the current level,
// a newer game, an older unsupported contract or a malformed level. A rejected adventure explains itself, offers
// the other adventure and never touches any save, checkpoint, archive or journal key of either adventure.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, extname} from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';

const root = resolve('.');
const scratch = mkdtempSync(join(tmpdir(), 'mossvale-pack-compat-'));
const out = join(scratch, 'site');
const built = spawnSync(process.execPath, ['scripts/build.mjs', '--include', 'tests/fixtures/packs/hearth'], {
  cwd: root,
  env: {...process.env, BUILD_DIR: out},
  encoding: 'utf8',
});
assert.equal(built.status, 0, built.stderr);
const MANIFEST = 'adventures/hearth-hamlet/index.json';
const shipped = JSON.parse(readFileSync(join(out, MANIFEST), 'utf8'));
assert.deepEqual(shipped.requires, {engineVersion: 1, saveSchema: 5}, 'the fixture pack declares the current level');

// The same Hearth content is served with different declared levels; `requires` is metadata outside the file hashes,
// so every other byte (and every integrity record) stays exactly as built.
const requested = [];
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml'};
const server = http.createServer((request, response) => {
  const name = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
  requested.push(name);
  if (!existsSync(join(out, name)))
    return response.writeHead(404, {'content-type': 'text/html; charset=utf-8'}).end('<!doctype html><title>Not found</title><p>Not found</p>');
  response.writeHead(200, {'content-type': types[extname(name)] ?? 'application/octet-stream'}).end(readFileSync(join(out, name)));
});
server.listen(0);
const url = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
const page = await (await browser.newContext({viewport: {width: 1100, height: 800}})).newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));

const saveKeys = () =>
  page.evaluate(() =>
    Object.fromEntries(
      Object.keys(localStorage)
        .filter(key => /^mossvale-(pack-[a-z0-9-]+-)?(v3|backup|archive|quarantine|save-transaction)$/.test(key))
        .sort()
        .map(key => [key, localStorage.getItem(key)]),
    ),
  );
const boot = async (query = '?debug') => {
  await page.goto(url + query);
  await page.waitForFunction(() => window.mossvale);
  await page.waitForSelector('#loading', {state: 'hidden'});
};
const saveNow = () => page.evaluate(() => window.dispatchEvent(new Event('blur')));
const setCoins = async coins => {
  await page.evaluate(value => (window.mossvale.getState().save.coins = value), coins);
  await saveNow();
};
const coins = () => page.evaluate(() => window.mossvale.getState().save.coins);

try {
  // Both adventures have progress, each under its own keys.
  await boot();
  await setCoins(111);
  await boot('?debug&adventure=hearth-hamlet');
  assert.equal(await page.textContent('#region-name'), 'Hearth Hamlet', 'the current level loads');
  await setCoins(222);
  await boot();
  // Leave the running game first (it saves as the page goes away) so the snapshot is what a rejected load will find.
  const missingPage = await page.goto(url + 'not-a-page');
  assert.equal(missingPage.status(), 404, 'the same-origin error document unloads the running game');
  const before = await saveKeys();
  assert.equal(JSON.parse(before['mossvale-v3']).coins, 111);
  assert.equal(JSON.parse(before['mossvale-pack-hearth-hamlet-v3']).coins, 222);

  const cases = [
    [
      'a newer game',
      {engineVersion: 2, saveSchema: 6},
      /newer version of Mossvale\. Update the game/,
      /requires\.engineVersion: requires 2.*requires\.saveSchema: requires 6/s,
    ],
    ['a newer save schema only', {engineVersion: 1, saveSchema: 6}, /newer version of Mossvale/, /requires\.saveSchema: requires 6.*update the game/s],
    ['an older unsupported contract', {engineVersion: 1, saveSchema: 4}, /older version of the game and is no longer supported/, /requires 4.*port it/s],
    ['a malformed level', {engineVersion: 1, saveSchema: '5'}, /does not say which version of the game it needs/, /requires "5".*positive integer/s],
    ['a missing declaration', undefined, /does not say which version of the game it needs/, /engineVersion and saveSchema are required/],
  ];
  for (const [label, requires, headline, detail] of cases) {
    requested.length = 0;
    await page.route('**/adventures/hearth-hamlet/index.json', async route => {
      const body = {...shipped};
      if (requires === undefined) delete body.requires;
      else body.requires = requires;
      await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(body)});
    });
    await page.goto(url + '?debug&adventure=hearth-hamlet');
    await page.waitForSelector('#load-switch:not([hidden])');
    assert.match(await page.textContent('#load-title'), /could not start/);
    assert.match(await page.textContent('#load-status'), headline, `${label}: the headline says whose version has to change`);
    assert.doesNotMatch(await page.textContent('#load-status'), /connection/, `${label}: a version problem is not blamed on the network`);
    assert.match(await page.textContent('#load-detail'), detail, `${label}: the detail names the field`);
    assert.match(await page.textContent('#load-switch'), /Open “Mossvale” instead/, `${label}: the other adventure is offered`);
    assert.ok(!requested.some(name => name.startsWith('adventures/hearth-hamlet/') && !name.endsWith('index.json')), `${label}: no other pack file is read`);
    await saveNow();
    assert.deepEqual(await saveKeys(), before, `${label}: no save, checkpoint, archive or journal key changed`);
    await page.unroute('**/adventures/hearth-hamlet/index.json');
  }

  // The offered way out works and the rejected adventure's progress is intact afterwards, including after a reload.
  await page.route('**/adventures/hearth-hamlet/index.json', route =>
    route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({...shipped, requires: {engineVersion: 2, saveSchema: 6}})}),
  );
  await page.goto(url + '?debug&adventure=hearth-hamlet');
  await page.waitForSelector('#load-switch:not([hidden])');
  await Promise.all([page.waitForEvent('load'), page.click('#load-switch')]);
  assert.equal(await page.evaluate(() => localStorage.getItem('mossvale-adventure')), 'mossvale', 'the choice is remembered');
  await boot('?debug'); // the reload kept the ?adventure= address, so open the remembered adventure plainly
  assert.equal(await page.textContent('#region-name'), 'Sunlit Trail');
  assert.equal(await coins(), 111, 'the other adventure resumes with its own progress');
  await page.unroute('**/adventures/hearth-hamlet/index.json');

  await boot('?debug&adventure=hearth-hamlet');
  assert.equal(await coins(), 222, 'once the game supports the pack again, its progress is exactly where it was');
  await page.reload();
  await page.waitForSelector('#loading', {state: 'hidden'});
  assert.equal(await coins(), 222, 'and survives a reload');
  assert.deepEqual(errors, []);
  console.log('ok pack compatibility: current, newer, older, malformed and missing declarations are explained and never touch a save');
} finally {
  await browser.close();
  server.close();
  rmSync(scratch, {recursive: true, force: true});
}
