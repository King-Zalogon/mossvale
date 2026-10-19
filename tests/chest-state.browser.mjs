import assert from 'node:assert/strict';
import http from 'node:http';
import {existsSync, readFileSync, mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {regions} from '../dist/src/data/regions.js';

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
  for (const map of ['meadow', 'reedfen-wetlands', 'stilt-isles', 'stone-basin', 'amber-ridge', 'frostveil-grove', 'frostveil-pass']) {
    const context = await browser.newContext({viewport: {width: 1100, height: 900}});
    await context.addInitScript(() => {
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      window.chestDraws = [];
      CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
        if (this.canvas.id === 'game' && image?.src?.includes('/chest-')) {
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
      window.mossvale.getState().save.badges = [0, 1, 2];
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
      return {
        coins: s.save.coins,
        potions: s.save.potions,
        orbs: s.save.orbs,
        flag: chest.flag,
        sprite:
          s.world.map.biome === 'meadow'
            ? 'chest-wooden'
            : s.world.map.biome === 'wetland'
              ? 'chest-reed-rope'
              : s.world.map.biome === 'badlands'
                ? 'chest-sandstone-iron'
                : 'chest-pine-frost',
      };
    }, map);
    await page.waitForFunction(name => window.chestDraws.some(d => d.src === name + '.png'), before.sprite);
    // Arrival fade and camera easing must settle before comparing ground anchors.
    await page.waitForTimeout(1000);
    const closedFoot = await page.evaluate(() => {
      const [x, y, w, h] = window.chestDraws.at(-1).args.slice(-4);
      return [x + w / 2, y + h];
    });
    if (process.env.CHEST_REVIEW === '1') {
      mkdirSync('dist/reviews/chests', {recursive: true});
      await page.locator('#game').screenshot({path: `dist/reviews/chests/${map}-closed.png`});
    }
    await page.evaluate(() => window.mossvale.interact());
    await page.waitForSelector('#result-continue');
    await page.click('#result-continue');
    await page.evaluate(() => (window.chestDraws = []));
    await page.waitForFunction(name => window.chestDraws.some(d => d.src === name + '-open-empty.png'), before.sprite);
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
    if (process.env.CHEST_REVIEW === '1') await page.locator('#game').screenshot({path: `dist/reviews/chests/${map}-open.png`});
    await page.reload();
    await page.waitForSelector('#loading', {state: 'hidden'});
    await page.waitForFunction(name => window.chestDraws.some(d => d.src === name + '-open-empty.png'), before.sprite);
    await page.waitForTimeout(1000);
    const regionIndex = regions.findIndex(region => region.id === before.flag.split('.')[0]);
    const reloadedChest = await page.evaluate(
      ({name, flag, regionIndex}) => {
        const state = window.mossvale.getState();
        return {
          claimed: state.save.chests.includes(regionIndex) || state.save.mapFlags?.includes(flag) === true,
          targetStillExists: state.world.map.objects.some(object => object.kind === 'chest' && object.flag === flag),
          openSpriteVisible: window.chestDraws.some(draw => draw.src === name + '-open-empty.png'),
        };
      },
      {name: before.sprite, flag: before.flag, regionIndex},
    );
    assert.equal(reloadedChest.claimed, true, 'the selected chest claim survives reload');
    assert.equal(reloadedChest.targetStillExists, true, 'the claimed chest remains in authored map data');
    assert.equal(reloadedChest.openSpriteVisible, true, 'the loaded map draws its open/empty chest art');
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
  const review = await browser.newPage();
  await review.goto(`http://localhost:${server.address().port}/chest-preview.html`);
  await review.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth));
  assert.equal(await review.locator('[data-chest-pose]').count(), 8);
  assert.equal(await review.locator('[data-map-context]').count(), 14);
  if (process.env.CHEST_REVIEW === '1') {
    mkdirSync('art/assets/reviews/337', {recursive: true});
    await review.locator('#comparison').screenshot({path: 'art/assets/reviews/337/gameplay-scale.png'});
  }
  await review.close();
  console.log('ok all biome pairs and opaque open/empty chests after claim, reload and repeat interaction for region and independent side-cache flags');
} finally {
  await browser.close();
  server.close();
}
