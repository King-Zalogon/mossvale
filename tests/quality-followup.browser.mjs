// Focused integration fixtures complement the ordinary-control orchard/choreography routes.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {gameHandler} from '../scripts/local-integration.mjs';
import {codec, newSave} from './helpers.mjs';

const server = createServer(gameHandler(fileURLToPath(new URL('../', import.meta.url)))).listen(0);
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
const base = `http://localhost:${server.address().port}/?debug&seed=8`;
const evidence = process.env.QUALITY_REVIEW;
if (evidence) mkdirSync(evidence, {recursive: true});
const errors = [];
async function open(save, options = {}) {
  const context = await browser.newContext({reducedMotion: 'reduce', viewport: {width: 1280, height: 820}, ...options});
  await context.addInitScript(raw => {
    localStorage.setItem('mossvale-settings', '{"motion":"reduced"}');
    if (!localStorage.getItem('mossvale-v3')) localStorage.setItem('mossvale-v3', raw);
    window.worldDraws = [];
    window.reactionCues = [];
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
      if (this.canvas.id === 'game' && x === 0 && y === 0 && w === this.canvas.width && h === this.canvas.height) {
        window.worldDraws = [];
        window.reactionCues = [];
      }
      return fill.call(this, x, y, w, h);
    };
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
      if (this.canvas.id === 'game' && image.src) window.worldDraws.push({src: image.src.split('/').pop(), args});
      return draw.call(this, image, ...args);
    };
    const text = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (message, ...args) {
      if (this.canvas.id === 'game') window.reactionCues.push(message);
      return text.call(this, message, ...args);
    };
  }, codec.serialize(save));
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.waitForSelector('#loading', {state: 'hidden'});
  return {context, page};
}
try {
  // #33: actual turn updates must retain the chosen action and the phone scroll position.
  for (const touch of [false, true]) {
    const save = newSave();
    save.met = true;
    const {context, page} = await open(save, {viewport: touch ? {width: 390, height: 844} : {width: 1280, height: 820}, hasTouch: touch});
    await page.evaluate(() => window.mossvale.encounter(1));
    await page.waitForSelector('#guard:not([disabled])');
    await page.locator('#guard').focus();
    await page.locator('#guard').evaluate(node => node.scrollIntoView({block: 'center'}));
    const before = await page.locator('#modal').evaluate(node => node.scrollTop);
    if (touch) await page.locator('#guard').tap();
    else await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.mossvale.getState().battle?.turn > 0 && !window.mossvale.getState().battle.busy);
    await page.waitForFunction(() => document.activeElement?.id === 'guard');
    const afterScroll = await page.locator('#modal').evaluate(node => ({top: node.scrollTop, max: node.scrollHeight - node.clientHeight}));
    assert.ok(
      Math.abs(afterScroll.top - Math.min(before, afterScroll.max)) < 2,
      `turn rerenders preserve reading position: touch=${touch} before=${before} after=${JSON.stringify(afterScroll)}`,
    );
    await page.locator('#modal').evaluate(node => {
      node.scrollTop = 0;
    });
    await page.keyboard.press('7');
    await page.waitForFunction(() => window.mossvale.getState().battle?.turn > 1 && !window.mossvale.getState().battle.busy);
    assert.equal(await page.locator('#modal').evaluate(node => node.scrollTop), 0, 'a deliberate scroll overrides the old reading position');
    // Reproduce stale RAF callbacks: a dismissed dialog must not steal focus back from the game.
    assert.equal(
      await page.evaluate(async () => {
        const {openModal, hideModal} = await import('/src/ui/dom.js');
        const ui = {modalMode: ''};
        const canvas = document.querySelector('#game');
        const callbacks = [];
        const raf = window.requestAnimationFrame;
        window.requestAnimationFrame = fn => callbacks.push(fn);
        try {
          openModal(ui, '<button id="stale-focus">Stale</button>', 'test');
          hideModal(ui, canvas);
          callbacks.forEach(fn => fn());
          return document.activeElement === canvas;
        } finally {
          window.requestAnimationFrame = raf;
        }
      }),
      true,
    );
    await context.close();
  }

  // #265: imported committed state immediately changes the map and later NPC, even before revisiting the resolution trigger.
  for (const outcome of ['outcome-water-first', 'orchard-family']) {
    const save = newSave();
    Object.assign(save, {met: true, badges: [0], mapId: 'orchard-ruins', x: 45, y: 35});
    save.visitedMaps.push('orchard-ruins');
    save.events = ['orchard-ruins/mara-water-loss', 'orchard-ruins/den-family-seen', `orchard-ruins/${outcome}`];
    const {context, page} = await open(save);
    await page.waitForFunction(() => window.worldDraws.some(draw => draw.src === 'creature-bramblebuck.png'));
    assert.equal(await page.evaluate(() => window.worldDraws.filter(draw => draw.src === 'creature-bramblebuck.png').length), 1);
    if (evidence) await page.screenshot({path: `${evidence}/${outcome}.png`});
    const coins = await page.evaluate(() => window.mossvale.getState().save.coins);
    await page.reload();
    await page.waitForSelector('#loading', {state: 'hidden'});
    await page.waitForFunction(() => window.worldDraws.some(draw => draw.src === 'creature-bramblebuck.png'));
    await page.evaluate(() => {
      const state = window.mossvale.getState();
      Object.assign(state.player, {x: 5.2, y: 15.3});
    });
    await page.keyboard.press('e');
    await page.waitForSelector('#speech-bubble:not([hidden])');
    assert.match(await page.locator('#speech-bubble').innerText(), outcome === 'orchard-family' ? /family to dry roots first/ : /cleared the bypass first/);
    await page.locator('#speech-next').click();
    await page.waitForSelector('#modal:not([hidden])');
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.mossvale.travel(1));
    await page.evaluate(() => {
      const state = window.mossvale.getState();
      const rowan = state.world.objects.find(object => object.ref === 'ranger');
      Object.assign(state.player, {x: rowan.x, y: rowan.y + 1});
    });
    await page.waitForTimeout(300);
    await page.keyboard.press('e');
    await page.waitForSelector('#speech-bubble:not([hidden])');
    assert.match(await page.locator('#speech-bubble').innerText(), outcome === 'orchard-family' ? /family made it to the dry hollow/ : /lower row is flowing/);
    assert.equal(await page.evaluate(() => window.mossvale.getState().save.coins), coins);
    await context.close();
  }

  // #270: all authored poses are actually drawn; other identities and missing optional art retain the cue.
  for (const missing of [false, true]) {
    const save = newSave();
    save.met = true;
    const {context, page} = await open(save);
    await page.evaluate(async () => {
      const {spriteId} = await import('/src/data/assets.js');
      window.mossvale.getState().world.objects.find(object => object.kind === 'ranger').id = spriteId('person-traveler');
    });
    if (missing) {
      // Remove one loaded optional image, representing the loader's supported failure path.
      await page.evaluate(async () => {
        const {sprites} = await import('/src/render/sprites.js');
        const {spriteId} = await import('/src/data/assets.js');
        sprites[spriteId('person-scene-reaction-notice')] = undefined;
      });
    }
    for (const viewport of [
      {width: 1280, height: 820},
      {width: 390, height: 844},
      {width: 844, height: 390},
    ]) {
      await page.setViewportSize(viewport);
      if (viewport.width === 1280) {
        await page.locator('#fullscreen').click();
        await page.waitForFunction(() => !!document.fullscreenElement);
      }
      await page.waitForTimeout(100);
      assert.ok(
        await page.evaluate(() => {
          const frame = document.querySelector('.game-frame').getBoundingClientRect();
          const viewport = document.querySelector('.viewport').getBoundingClientRect();
          const footer = document.querySelector('.game-footer').getBoundingClientRect();
          return viewport.height > frame.height - 160 && viewport.bottom >= footer.top - 2;
        }),
        'fullscreen playfield fills the available height after resizing',
      );
      for (const pose of ['notice', 'surprise', 'happy']) {
        await page.evaluate(pose => {
          const state = window.mossvale.getState();
          const actor = state.world.objects.find(object => object.kind === 'ranger');
          Object.assign(actor, {x: state.player.x + 1, y: state.player.y, sceneReaction: pose, sceneReactionUntil: state.now + 10000});
        }, pose);
        const fallback = missing && pose === 'notice';
        await page.waitForFunction(
          ({pose, fallback}) =>
            fallback ? window.reactionCues.includes('…') : window.worldDraws.some(draw => draw.src === `person-scene-reaction-${pose}.png`),
          {pose, fallback},
        );
        if (evidence && !missing) await page.screenshot({path: `${evidence}/reaction-${pose}-${viewport.width}.png`});
      }
    }
    if (await page.evaluate(() => !!document.fullscreenElement)) await page.evaluate(() => document.exitFullscreen());
    await page.evaluate(async () => {
      const {spriteId} = await import('/src/data/assets.js');
      const state = window.mossvale.getState();
      Object.assign(
        state.world.objects.find(object => object.kind === 'ranger'),
        {id: spriteId('person-gardener'), sceneReaction: 'surprise', sceneReactionUntil: state.now + 10000},
      );
    });
    await page.waitForFunction(() => window.worldDraws.some(draw => draw.src === 'person-gardener.png') && window.reactionCues.includes('!'));
    assert.equal(
      await page.evaluate(() => window.worldDraws.some(draw => draw.src.includes('person-scene-reaction'))),
      false,
      'the gardener must never become the traveler',
    );
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    'ok #33 battle focus/scroll and stale callbacks; #265 committed orchard/imported callbacks; #270 poses, identity and missing-art fallback across viewport sizes',
  );
} finally {
  await browser.close();
  server.close();
}
