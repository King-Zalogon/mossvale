import assert from 'node:assert/strict';
import http from 'node:http';
import {existsSync, readFileSync, mkdirSync} from 'node:fs';
import {chromium} from 'playwright';

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
try {
  for (const map of ['meadow', 'frostveil-pass']) {
    const context = await browser.newContext({viewport: {width: 1100, height: 900}});
    await context.addInitScript(() => {
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      window.chestDraws = [];
      CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
        if (this.canvas.id === 'game' && image?.src?.includes('/chest-wooden')) {
          window.chestDraws.push({src: image.src.split('/').pop(), alpha: this.globalAlpha, args});
          if (window.chestDraws.length > 50) window.chestDraws.shift();
        }
        return draw.call(this, image, ...args);
      };
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://localhost:${server.address().port}/?debug&seed=2`);
    await page.waitForSelector('#loading', {state: 'hidden'});
    const before = await page.evaluate(map => {
      window.mossvale.getState().save.badges = [0, 1];
      window.mossvale.travel(map);
      const s = window.mossvale.getState();
      const chest = s.world.map.objects.find(o => o.kind === 'chest');
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        if (window.mossvale.valid(chest.x + dx, chest.y + dy)) {
          Object.assign(s.player, {x: chest.x + dx, y: chest.y + dy});
          break;
        }
      }
      window.chestDraws = [];
      return {coins: s.save.coins, potions: s.save.potions, orbs: s.save.orbs, flag: chest.flag};
    }, map);
    await page.waitForFunction(() => window.chestDraws.some(d => d.src === 'chest-wooden.png'));
    // Arrival fade and camera easing must settle before comparing ground anchors.
    await page.waitForTimeout(1000);
    const closedFoot = await page.evaluate(() => {
      const [x, y, w, h] = window.chestDraws.at(-1).args.slice(-4);
      return [x + w / 2, y + h];
    });
    if (process.env.CHEST_REVIEW === '1') {
      mkdirSync('art/assets/reviews/235', {recursive: true});
      await page.screenshot({path: `art/assets/reviews/235/${map}-closed.png`});
    }
    await page.evaluate(() => window.mossvale.interact());
    await page.waitForSelector('#result-continue');
    await page.click('#result-continue');
    await page.evaluate(() => (window.chestDraws = []));
    await page.waitForFunction(() => window.chestDraws.some(d => d.src === 'chest-wooden-open-empty.png'));
    assert.equal(await page.evaluate(() => window.chestDraws.at(-1).alpha), 1, 'looted chest remains opaque');
    const openFoot = await page.evaluate(() => {
      const [x, y, w, h] = window.chestDraws.at(-1).args.slice(-4);
      return [x + w / 2, y + h];
    });
    assert.ok(
      openFoot.every((value, i) => Math.abs(value - closedFoot[i]) <= 1),
      'opening preserves the rendered ground anchor',
    );
    const after = await page.evaluate(() => {
      const s = window.mossvale.getState().save;
      return {coins: s.coins, potions: s.potions, orbs: s.orbs};
    });
    assert.ok(after.coins > before.coins, 'first interaction grants treasure');
    if (process.env.CHEST_REVIEW === '1') await page.screenshot({path: `art/assets/reviews/235/${map}-open.png`});
    await page.reload();
    await page.waitForSelector('#loading', {state: 'hidden'});
    await page.waitForFunction(() => window.chestDraws.some(d => d.src === 'chest-wooden-open-empty.png'));
    assert.equal(await page.evaluate(() => window.chestDraws.some(d => d.src === 'chest-wooden.png')), false, 'reload never redraws a closed claimed chest');
    await page.evaluate(() => window.mossvale.interact());
    await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('chest is empty'));
    assert.deepEqual(
      await page.evaluate(() => {
        const s = window.mossvale.getState().save;
        return {coins: s.coins, potions: s.potions, orbs: s.orbs};
      }),
      after,
      'repeat interaction does not grant rewards',
    );
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('ok opaque open/empty chests after claim, reload and repeat interaction for region and independent side-cache flags');
} finally {
  await browser.close();
  server.close();
}
