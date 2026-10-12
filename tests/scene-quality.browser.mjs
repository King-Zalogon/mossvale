// Reusable quality target: observe debug state, drive only real keyboard/buttons/touch.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, extname} from 'node:path';
import {createHash} from 'node:crypto';
import http from 'node:http';
import {chromium} from 'playwright';
import {inputForWorldTarget} from './action-script.mjs';
import {checkSceneLayout} from '../scripts/lib/scene-quality.mjs';
import {fileHash} from '../scripts/scene-quality.mjs';

const pack = 'tests/fixtures/packs/scene-quality-yard';
const script = 'content/scene-scripts/examples/quality-yard.json';
const reviewDir = 'docs/scene-quality/244';
const retain = process.env.SCENE_REVIEW === '1';
const scratch = mkdtempSync(join(tmpdir(), 'mossvale-scene-quality-'));
const output = join(scratch, 'site');
const captures = [];
execFileSync(process.execPath, ['scripts/build.mjs', '--pack', pack], {env: {...process.env, BUILD_DIR: output}, stdio: 'pipe'});
if (retain) mkdirSync(reviewDir, {recursive: true});
const server = http.createServer((req, res) => {
  const path = join(output, new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html');
  if (!existsSync(path)) return void res.writeHead(404).end();
  const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml'};
  res.writeHead(200, {'content-type': mime[extname(path)] ?? 'application/octet-stream'}).end(readFileSync(path));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
try {
  for (const viewport of [
    {name: 'desktop', width: 1280, height: 820},
    {name: 'phone', width: 390, height: 844},
  ]) {
    const context = await browser.newContext({
      viewport: {width: viewport.width, height: viewport.height},
      hasTouch: viewport.name === 'phone',
      reducedMotion: 'reduce',
    });
    await context.addInitScript(() => {
      window.sceneDraws = {};
      const original = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
        if (this.canvas.id === 'game' && image.src) {
          const [x, y, w, h] = args.slice(-4);
          const matrix = this.getTransform();
          const points = [
            [x, y],
            [x + w, y],
            [x, y + h],
            [x + w, y + h],
          ].map(([x, y]) => ({x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f}));
          window.sceneDraws[image.src.split('/').pop()] = {
            left: Math.min(...points.map(p => p.x)),
            right: Math.max(...points.map(p => p.x)),
            top: Math.min(...points.map(p => p.y)),
            bottom: Math.max(...points.map(p => p.y)),
          };
        }
        return original.call(this, image, ...args);
      };
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?debug&seed=2`);
    await page.waitForSelector('#loading', {state: 'hidden'});
    if (await page.locator('#m-primary').isVisible()) await page.click('#m-primary');
    if (await page.locator('#story-ok').isVisible()) await page.click('#story-ok');
    const walkTo = async target => {
      let held = [];
      let arrived = false;
      try {
        for (let i = 0; i < 500; i++) {
          const player = await page.evaluate(() => window.mossvale.getState().player);
          if (Math.hypot(player.x - target.x, player.y - target.y) < 0.2) {
            arrived = true;
            break;
          }
          const next = inputForWorldTarget(player, target).keys;
          for (const key of held.filter(k => !next.includes(k))) await page.keyboard.up(key);
          for (const key of next.filter(k => !held.includes(k))) await page.keyboard.down(key);
          held = next;
          await page.waitForTimeout(20);
        }
      } finally {
        for (const key of held) await page.keyboard.up(key);
      }
      assert.ok(arrived, 'real controls reached the authored target');
      await page.waitForTimeout(350);
    };
    const capture = async (phase, speaker) => {
      await page.waitForTimeout(150);
      const layout = await page.evaluate(speaker => {
        const canvas = document.querySelector('#game');
        const c = canvas.getBoundingClientRect();
        const rect = node => {
          const r = node.getBoundingClientRect();
          return {left: r.left + scrollX, right: r.right + scrollX, top: r.top + scrollY, bottom: r.bottom + scrollY};
        };
        const sprite = name => {
          const r = window.sceneDraws[name];
          if (!r) return null;
          return {
            left: c.left + scrollX + (r.left / canvas.width) * c.width,
            right: c.left + scrollX + (r.right / canvas.width) * c.width,
            top: c.top + scrollY + (r.top / canvas.height) * c.height,
            bottom: c.top + scrollY + (r.bottom / canvas.height) * c.height,
          };
        };
        const required = {
          player: sprite('person-red-cap-motion.png'),
          companion: sprite('creature-fernling-follower.png'),
          landmark: sprite('chest-wooden.png'),
          objective: rect(document.querySelector('#quest-title')),
        };
        const panel = document.querySelector('#speech-bubble');
        const textRange = document.createRange();
        textRange.selectNodeContents(document.querySelector('#speech-text'));
        if (!panel.hidden)
          Object.assign(required, {
            speaker: required.player && speaker === 'player' ? required.player : sprite('person-traveler.png'),
            text: rect(textRange),
            advance: rect(document.querySelector('#speech-next')),
          });
        // Phone objectives intentionally live in the scrollable sidebar, not beneath the dialogue.
        return {
          viewport: {left: 0, top: 0, right: document.documentElement.clientWidth, bottom: document.documentElement.scrollHeight},
          actorViewport: rect(canvas),
          panel: panel.hidden ? null : rect(panel),
          required,
          textFragments: panel.hidden
            ? []
            : [...textRange.getClientRects()].map(r => ({left: r.left + scrollX, right: r.right + scrollX, top: r.top + scrollY, bottom: r.bottom + scrollY})),
          objectiveAccess: 'Visible sidebar; scrollable on narrow phones. In-map objective pin is intentionally paused during speech.',
        };
      }, speaker);
      // Text belongs inside the panel; every important actor/landmark and the objective clears it.
      const forCheck = structuredClone(layout);
      delete forCheck.required.text;
      assert.deepEqual(checkSceneLayout(forCheck), [], `${viewport.name} ${phase}: ${JSON.stringify(layout)}`);
      if (layout.required.text)
        assert.ok(layout.required.text.top >= layout.panel.top && layout.required.text.bottom <= layout.panel.bottom, 'dialogue text remains within its panel');
      const path = retain ? `${reviewDir}/${viewport.name}-${phase}.png` : join(scratch, `${viewport.name}-${phase}.png`);
      const bytes = await page.screenshot({path, fullPage: true});
      captures.push({
        path,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        viewport,
        phase: phase.startsWith('dialogue') ? 'dialogue' : phase,
        zoom: await page.evaluate(() => window.mossvale.getState().zoom),
        layout,
      });
    };
    await walkTo({x: 6, y: 5});
    await page.keyboard.press('e');
    for (const [i, text] of ['The chest holds', 'Thank you'].entries()) {
      await page.waitForFunction(text => document.querySelector('#speech-text')?.textContent.startsWith(text), text);
      await capture(`dialogue-${i + 1}`, i ? 'player' : 'traveler');
      if (viewport.name === 'phone') await page.locator('#speech-next').tap();
      else await page.keyboard.press('Enter');
    }
    await page.waitForSelector('#speech-bubble', {state: 'hidden'});
    await walkTo({x: 8, y: 4});
    await capture('offered-supplies');
    const before = await page.evaluate(() => {
      const s = window.mossvale.getState().save;
      return [s.coins, s.potions, s.orbs];
    });
    await page.keyboard.press('e');
    await page.click('#result-continue');
    await page.click('#story-ok');
    const after = await page.evaluate(() => {
      const s = window.mossvale.getState().save;
      return [s.coins, s.potions, s.orbs];
    });
    assert.deepEqual(
      after.map((n, i) => n - before[i]),
      [8, 1, 2],
    );
    await page.reload();
    await page.waitForSelector('#loading', {state: 'hidden'});
    if (await page.locator('#story-ok').isVisible()) await page.click('#story-ok');
    await page.keyboard.press('e');
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('chest is empty'));
    assert.deepEqual(
      await page.evaluate(() => {
        const s = window.mossvale.getState().save;
        return [s.coins, s.potions, s.orbs];
      }),
      after,
    );
    assert.deepEqual(errors, []);
    await context.close();
  }
  if (retain) {
    const paths = [
      script,
      'content/scene-scripts/schema.json',
      'dist/src/controller.js',
      'dist/src/main.js',
      'dist/src/render/sprites.js',
      'dist/assets/people/person-red-cap-motion.png',
      'dist/assets/people/person-traveler.png',
      'dist/assets/creatures/creature-fernling-follower.png',
      'dist/assets/props/chest-wooden.png',
      'dist/src/ui/speech.js',
      'dist/src/render/world.js',
      'dist/style.css',
      `${pack}/index.json`,
      `${pack}/maps/start.json`,
      `${pack}/objectives.json`,
      `${pack}/story.json`,
      `${pack}/registries.json`,
    ];
    writeFileSync(
      `${reviewDir}/evidence.json`,
      JSON.stringify(
        {
          format: 1,
          sceneScript: script,
          sourceHashes: Object.fromEntries(paths.map(path => [path, fileHash(path)])),
          screenshots: captures,
          realControls: true,
          reloadOnceReward: true,
          layoutPassed: true,
        },
        null,
        2,
      ) + '\n',
    );
  }
  console.log('ok real-control scene quality: desktop/phone dialogue and supplies, actual sprite/UI bounds, review captures and once-only reload rewards');
} finally {
  await browser.close();
  server.close();
  rmSync(scratch, {recursive: true, force: true});
}
