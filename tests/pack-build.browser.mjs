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
  const args = ['scripts/build.mjs', '--pack', source];
  if (pack === 'lantern-crossing') args.push('--include', join(root, 'tests/fixtures/packs/hearth'));
  const result = spawnSync(process.execPath, args, {cwd: root, env: {...process.env, BUILD_DIR: output}, encoding: 'utf8'});
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
      const player = window.mossvale.getState().player;
      return window.mossvale.grass(Math.round(player.x), Math.round(player.y));
    },
    null,
    {timeout: 8000},
  );
  try {
    await page.waitForSelector('#fight-wild', {timeout: 8000});
  } catch {
    throw new Error(
      `walk entered grass without an encounter: ${JSON.stringify(await page.evaluate(() => ({player: window.mossvale.getState().player, pacing: window.mossvale.getState().pacing, inGrass: window.mossvale.grass(Math.round(window.mossvale.getState().player.x), Math.round(window.mossvale.getState().player.y)), events: window.mossvale.events().slice(-5)})))}`,
    );
  }
  await page.keyboard.up('d');
  for (let turn = 0; turn < 20; turn++) {
    const before = await page.evaluate(() => window.mossvale.getState().battle);
    assert.ok(before, 'the walking encounter remains active while capture attempts resolve');
    await page.click('#catch');
    await page.waitForFunction(
      previousTurn => {
        const game = window.mossvale.getState();
        return game.phase === 'result' || (!game.battle?.busy && game.battle?.turn > previousTurn);
      },
      before.turn,
      {timeout: 5000},
    );
    if ((await page.evaluate(() => window.mossvale.getState().phase)) === 'result') break;
  }
  await page.waitForSelector('#result-continue');
  const afterCapture = await page.evaluate(() => window.mossvale.getState().save);
  assert.equal(afterCapture.caught.length, 2, 'the mini adventure includes a normal-play capture');
  await page.click('#result-continue');
  await page.waitForFunction(() => window.mossvale.getState().phase === 'explore');
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
  assert.deepEqual([rewarded.coins, rewarded.potions, rewarded.chests.length], [18, 4, 1]);
  assert.ok(rewarded.orbs < 14, 'capturing uses at least one orb before the chest restocks two');
  assert.equal(objective.id, 'crossing-complete');
  await page.click('#result-continue');
  await page.waitForSelector('#story-ok');
  await page.click('#story-ok');
  await page.reload();
  await page.waitForSelector('#loading', {state: 'hidden'});
  assert.deepEqual(await page.evaluate(() => [window.mossvale.getState().save.coins, window.mossvale.getState().save.chests.length]), [18, 1]);
  await page.keyboard.press('Escape');
  await page.click('#m-adventures');
  await page.click('[data-adventure="hearth-hamlet"]');
  await page.waitForFunction(() => window.mossvale?.getState().world.map?.id === 'hearth-yard');
  await page.waitForSelector('#loading', {state: 'hidden'});
  assert.equal(await page.locator('#region-name').textContent(), 'Hearth Hamlet');
  await page.keyboard.press('Escape');
  await page.click('#m-adventures');
  await page.click('[data-adventure="lantern-crossing"]');
  await page.waitForFunction(() => window.mossvale?.getState().world.map?.id === 'start');
  await page.waitForSelector('#loading', {state: 'hidden'});
  assert.equal(await page.evaluate(() => window.mossvale.getState().save.coins), 18, 'switching away and back preserved Lantern Crossing progress');
  await page.keyboard.press('Escape');
  await page.click('#m-backup');
  const downloadPromise = page.waitForEvent('download');
  await page.click('#b-export');
  const backupPath = join(scratch, 'lantern-crossing-backup.json');
  await (await downloadPromise).saveAs(backupPath);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#m-new');
  await page.click('#m-new');
  await page.click('#m-confirm-new');
  await page.waitForFunction(() => window.mossvale?.getState().save.coins === 0);
  await page.waitForSelector('#loading', {state: 'hidden'});
  await page.keyboard.press('Escape');
  await page.click('#m-backup');
  await page.setInputFiles('#b-file', backupPath);
  await page.waitForSelector('#b-confirm');
  await page.click('#b-confirm');
  await page.waitForFunction(() => window.mossvale?.getState().save.coins === 18 && window.mossvale.getState().save.chests.length === 1);
  await page.waitForSelector('#loading', {state: 'hidden'});
  assert.deepEqual(errors, []);
  await page.close();
  console.log('ok standalone packs boot; Lantern Crossing is walked, rewarded, completed, switched, exported, imported and restored');
} finally {
  await browser.close();
  server.close();
  rmSync(scratch, {recursive: true, force: true});
}
