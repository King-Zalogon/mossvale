// Build and play the #186 writer handoff as an isolated adventure pack.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, extname} from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';

const root = resolve('.');
const scratch = mkdtempSync(join(tmpdir(), 'mossvale-scene-proof-'));
const output = join(scratch, 'site');
const pack = join(root, 'tests/fixtures/packs/the-fernling-at-dusk');
const built = spawnSync(process.execPath, ['scripts/build.mjs', '--pack', pack], {
  cwd: root,
  env: {...process.env, BUILD_DIR: output},
  encoding: 'utf8',
});
assert.equal(built.status, 0, built.stderr);
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml'};
const server = http.createServer((request, response) => {
  const name = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
  const path = join(output, name);
  if (!existsSync(path)) return response.writeHead(404).end();
  response.writeHead(200, {'content-type': types[extname(path)] ?? 'application/octet-stream'}).end(readFileSync(path));
});
server.listen(0);
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const url = `http://localhost:${server.address().port}/?debug`;
  await page.goto(url);
  await page.waitForFunction(() => window.mossvale);
  await page.waitForSelector('#loading', {state: 'hidden'});
  if (await page.locator('#story-ok').isVisible()) await page.click('#story-ok');
  assert.equal(await page.locator('#region-name').textContent(), 'Sunlit Trail — Dusk');
  assert.equal(await page.evaluate(() => window.mossvale.getState().world.map.id), 'start');
  assert.equal(
    await page.evaluate(() => {
      const save = window.mossvale.getState().save;
      return save.party.length === 1 && save.party[0] === save.active;
    }),
    true,
    'the scene addresses the player’s active companion without assuming a fixed starter species',
  );

  // Confirm the spawn and chest share a connected walkable path in the authored geometry.
  assert.equal(
    await page.evaluate(() => {
      const valid = window.mossvale.valid;
      const queue = [[3, 5]];
      const seen = new Set(['3,5']);
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const [x, y] = queue[cursor];
        if (x === 6 && y === 5) return true;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const next = [x + dx, y + dy];
          const key = next.join(',');
          if (!seen.has(key) && valid(...next)) {
            seen.add(key);
            queue.push(next);
          }
        }
      }
      return false;
    }),
    true,
    'the camp spawn can reach the traveler interaction point through walkable map cells',
  );
  assert.equal(await page.evaluate(() => window.mossvale.valid(9, 5)), true, 'the chest location is on walkable ground');

  // Place the test player on the reachable interaction tile beside the traveler.
  // The trigger is two tiles from the speaker so the runtime's nearest-sign action does not shadow it.
  await page.evaluate(() => Object.assign(window.mossvale.getState().player, {x: 6, y: 5}));
  await page.evaluate(() => window.mossvale.interact());
  for (const text of [
    'Evening. Your companion usually stirs at every rustle',
    'I heard a second set of footsteps after mine stopped',
    'Your companion heard them too?',
  ]) {
    await page.waitForFunction(expected => document.querySelector('#speech-text')?.textContent.includes(expected), text);
    await page.click('#speech-next');
  }
  await page.waitForSelector('#speech-bubble[hidden]', {state: 'hidden'});
  await page.waitForTimeout(350); // allow the interaction debounce to expire after scripted rapid advances

  // Interact with the reachable chest and prove its reward and milestone survive reload exactly once.
  const beforeChest = await page.evaluate(() => {
    const save = window.mossvale.getState().save;
    return {coins: save.coins, potions: save.potions, orbs: save.orbs, chests: save.chests.length};
  });
  await page.evaluate(() => {
    Object.assign(window.mossvale.getState().player, {x: 9, y: 5});
    window.mossvale.interact();
  });
  await page.waitForSelector('#result-continue');
  const afterChest = await page.evaluate(() => {
    const save = window.mossvale.getState().save;
    return {coins: save.coins, potions: save.potions, orbs: save.orbs, chests: save.chests};
  });
  assert.deepEqual(
    [
      afterChest.coins - beforeChest.coins,
      afterChest.potions - beforeChest.potions,
      afterChest.orbs - beforeChest.orbs,
      afterChest.chests.length - beforeChest.chests,
    ],
    [8, 1, 2, 1],
  );
  await page.click('#result-continue');
  await page.waitForSelector('#story-ok');
  assert.match(await page.textContent('#modal'), /The traveler’s chest is open/);
  assert.equal(await page.evaluate(() => window.mossvale.getState().save.completed), true);
  await page.click('#story-ok');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.reload();
  await page.waitForSelector('#loading', {state: 'hidden'});
  const loaded = await page.evaluate(() => {
    const save = window.mossvale.getState().save;
    return {coins: save.coins, potions: save.potions, orbs: save.orbs, chests: save.chests};
  });
  assert.deepEqual(loaded, afterChest, 'the save reload retains the claimed chest without another reward');
  assert.equal(await page.evaluate(() => window.mossvale.getState().save.completed), true, 'the scene pack remains completed after reload');
  if (await page.locator('#story-ok').isVisible()) await page.click('#story-ok');
  await page.evaluate(() => {
    Object.assign(window.mossvale.getState().player, {x: 9, y: 5});
    window.mossvale.interact();
  });
  assert.equal(await page.locator('#toast').textContent(), 'This treasure chest is empty. The next island may have another.');
  assert.deepEqual(
    await page.evaluate(() => {
      const save = window.mossvale.getState().save;
      return [save.coins, save.potions, save.orbs, save.chests.length];
    }),
    [afterChest.coins, afterChest.potions, afterChest.orbs, 1],
  );
  assert.deepEqual(errors, []);
  console.log('ok #186 scene starts, presents dialogue, reaches optional chest, awards once, and reloads its completion');
} finally {
  await browser.close();
  server.close();
  rmSync(scratch, {recursive: true, force: true});
}
