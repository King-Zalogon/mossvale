// Build and boot two independently selected adventures from the same engine checkout.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, extname} from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';

const root = resolve('.');
const scratch = mkdtempSync(join(tmpdir(), 'mossvale-pack-build-'));
const outputs = new Map();
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml'};
for (const [pack, expected] of [
  ['hearth', 'Hearth Hamlet'],
  ['bakery', 'Bakery Row'],
  ['lantern-crossing', 'Lantern Crossing'],
]) {
  const output = join(scratch, pack);
  const source = join(root, 'tests/fixtures/packs', pack);
  const result = spawnSync(process.execPath, ['scripts/build.mjs', '--pack', source], {cwd: root, env: {...process.env, BUILD_DIR: output}, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  outputs.set(pack, {output, expected});
}
const server = http.createServer((request, response) => {
  const [pack, ...parts] = new URL(request.url, 'http://localhost').pathname.split('/').filter(Boolean);
  const entry = outputs.get(pack);
  const path = join(entry?.output ?? scratch, ...(parts.length ? parts : ['index.html']));
  if (!entry || !existsSync(path)) return response.writeHead(404).end();
  response.writeHead(200, {'content-type': types[extname(path)] ?? 'application/octet-stream'}).end(readFileSync(path));
});
server.listen(0);
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
try {
  for (const pack of outputs.keys()) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://localhost:${server.address().port}/${pack}/?debug`);
    await page.waitForFunction(() => window.mossvale);
    await page.waitForSelector('#loading', {state: 'hidden'});
    assert.equal(await page.locator('#region-name').textContent(), outputs.get(pack).expected);
    assert.deepEqual(errors, []);
    await page.close();
  }
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://localhost:${server.address().port}/lantern-crossing/?debug&seed=17`);
  await page.waitForSelector('#loading', {state: 'hidden'});
  await page.waitForFunction(() => window.mossvale?.getState().world.map.id === 'start');
  const spawn = await page.evaluate(() => window.mossvale.getState().player);
  await page.keyboard.down('d');
  await page.waitForFunction(
    () => {
      const p = window.mossvale.getState().player;
      return p.x >= 5.4 && p.y <= 2.7;
    },
    null,
    {timeout: 8000},
  );
  await page.keyboard.up('d');
  await page.keyboard.press('e');
  await page.waitForSelector('#result-continue');
  const rewarded = await page.evaluate(() => window.mossvale.getState().save);
  const objective = await page.evaluate(() => window.mossvale.objective());
  assert.ok(Math.hypot(spawn.x - 6, spawn.y - 2) > 2, 'the player walked from camp to the chest');
  assert.deepEqual([rewarded.coins, rewarded.potions, rewarded.orbs, rewarded.chests.length], [8, 4, 14, 1]);
  assert.equal(objective.id, 'crossing-complete');
  await page.click('#result-continue');
  await page.waitForSelector('#story-ok');
  await page.click('#story-ok');
  await page.reload();
  await page.waitForSelector('#loading', {state: 'hidden'});
  assert.deepEqual(await page.evaluate(() => [window.mossvale.getState().save.coins, window.mossvale.getState().save.chests.length]), [8, 1]);
  assert.deepEqual(errors, []);
  await page.close();
  console.log('ok standalone packs boot; Lantern Crossing is walked, rewarded, completed and restored');
} finally {
  await browser.close();
  server.close();
  rmSync(scratch, {recursive: true, force: true});
}
