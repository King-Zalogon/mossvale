import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {mkdirSync} from 'node:fs';
import {gameHandler} from '../scripts/local-integration.mjs';
import {codec, newSave} from './helpers.mjs';
const server = createServer(gameHandler(fileURLToPath(new URL('../', import.meta.url)))).listen(0);
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
try {
  for (const touch of [false, true])
    for (const phase of ['start', 'brief', 'evidence', 'complete', 'failure']) {
      const context = await browser.newContext({
        hasTouch: touch,
        viewport: touch ? {width: 390, height: 844} : {width: 1280, height: 820},
        reducedMotion: 'reduce',
      });
      const save = newSave();
      save.met = true;
      save.badges = [0];
      save.mapId = 'orchard-ruins';
      save.visitedMaps.push('orchard-ruins');
      if (phase !== 'start') save.events.push('orchard-ruins/mara-water-loss');
      if (['evidence', 'complete'].includes(phase)) save.events.push('orchard-ruins/press-repair-record');
      if (phase === 'complete') save.events.push('orchard-ruins/den-family-seen', 'orchard-ruins/outcome-family-first');
      await context.addInitScript(raw => {
        if (!localStorage.getItem('mossvale-v3')) localStorage.setItem('mossvale-v3', raw);
        localStorage.setItem('mossvale-settings', '{"motion":"reduced"}');
      }, codec.serialize(save));
      const page = await context.newPage(),
        errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`http://localhost:${server.address().port}/?debug&seed=2`);
      await page.waitForSelector('#loading', {state: 'hidden'});
      const journal = async () => {
        if (touch) await page.locator('#journal').tap();
        else await page.keyboard.press('j');
      };
      await journal();
      if (['start', 'complete'].includes(phase)) assert.equal(await page.locator('#ask-investigation-hint').count(), 0);
      else {
        if (phase === 'failure') {
          await page.evaluate(() => {
            Storage.prototype.setItem = () => {
              throw new DOMException('Quota exceeded', 'QuotaExceededError');
            };
          });
          await page.locator('#ask-investigation-hint').click();
          assert.equal(await page.locator('#speech-bubble').isVisible(), false);
          assert.equal(await page.evaluate(() => window.mossvale.getState().save.events.some(id => id.includes('/hint-'))), false);
          await context.close();
          continue;
        }
        const expected = phase === 'brief' ? 'old-water' : 'returning-tracks';
        if (touch) await page.locator('#ask-investigation-hint').tap();
        else await page.locator('#ask-investigation-hint').click();
        await page.waitForSelector('#speech-bubble', {state: 'visible'});
        await page.waitForTimeout(500);
        assert.doesNotMatch(await page.locator('#speech-text').textContent(), /Bramblebuck|family|den/);
        assert.ok(await page.evaluate(id => window.mossvale.getState().save.events.includes(`orchard-ruins/hint-${id}-0`), expected));
        if (process.env.HINT_REVIEW) {
          mkdirSync('docs/scene-quality/261', {recursive: true});
          await page.screenshot({path: `docs/scene-quality/261/${touch ? 'phone' : 'desktop'}-${phase}.png`, fullPage: true});
        }
        await page.reload();
        await page.waitForSelector('#loading', {state: 'hidden'});
        await journal();
        assert.match(await page.locator('#modal').textContent(), /Relevant here/);
        await page.locator('#ask-investigation-hint').click();
        await page.waitForSelector('#speech-bubble', {state: 'visible'});
        assert.ok(await page.evaluate(id => window.mossvale.getState().save.events.includes(`orchard-ruins/hint-${id}-1`), expected));
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
  console.log('ok optional journal leads at two investigation states, no start/completion disclosure, keyboard/touch and persisted escalation');
} finally {
  await browser.close();
  server.close();
}
