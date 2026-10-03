// Comic speech bubbles (#84) in a real browser: anchored above the speaker, tail at the speaker, keyboard and touch,
// multi-speaker sequences from data, viewport edges at several zoom levels and text sizes, cleanup.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, extname} from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';

const root = resolve('.');
const scratch = mkdtempSync(join(tmpdir(), 'mossvale-speech-'));
const out = join(scratch, 'site');
const built = spawnSync(process.execPath, ['scripts/build.mjs', '--include', 'tests/fixtures/packs/hearth'], {
  cwd: root,
  env: {...process.env, BUILD_DIR: out},
  encoding: 'utf8',
});
assert.equal(built.status, 0, built.stderr);
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml'};
const server = http.createServer((request, response) => {
  const name = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (!existsSync(join(out, name))) return response.writeHead(404).end();
  response.writeHead(200, {'content-type': types[extname(name)] ?? 'application/octet-stream'}).end(readFileSync(join(out, name)));
});
server.listen(0);
const url = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});

async function open({adventure = 'mossvale', viewport = {width: 1100, height: 800}, settings} = {}) {
  const ctx = await browser.newContext({viewport});
  await ctx.addInitScript(
    ({adventure, settings}) => {
      if (localStorage.getItem('__seeded')) return;
      localStorage.setItem('__seeded', '1');
      localStorage.setItem('mossvale-adventure', adventure);
      if (settings) localStorage.setItem('mossvale-settings', JSON.stringify(settings));
    },
    {adventure, settings},
  );
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url + '?debug&seed=3');
  await page.waitForFunction(() => window.mossvale);
  await page.waitForSelector('#loading', {state: 'hidden'});
  return {page, errors, ctx};
}
const teleport = async (page, x, y) => {
  await page.evaluate(([px, py]) => Object.assign(window.mossvale.getState().player, {x: px, y: py}), [x, y]);
  await page.waitForTimeout(450); // the camera follows, the interact cooldown passes
};
const bubble = async page => {
  await page.waitForTimeout(250); // the camera is still settling after a jump; the bubble follows it every frame
  return page.evaluate(() => {
    const el = document.querySelector('#speech');
    const vp = el.parentElement.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const tailVar = parseFloat(el.style.getPropertyValue('--tail'));
    return {
      hidden: el.hidden,
      side: el.dataset.side,
      speaker: el.dataset.speaker,
      name: el.querySelector('.speech-name').hidden ? '' : el.querySelector('.speech-name').textContent,
      text: el.querySelector('.speech-text').textContent,
      next: el.querySelector('.speech-next').textContent,
      left: r.left - vp.left,
      right: r.right - vp.left,
      top: r.top - vp.top,
      bottom: r.bottom - vp.top,
      tailX: r.left - vp.left + tailVar,
      vp: {w: vp.width, h: vp.height},
      fontSize: parseFloat(getComputedStyle(el).fontSize),
      animation: getComputedStyle(el).animationName,
    };
  });
};
const playerPos = page => page.evaluate(() => ({...window.mossvale.getState().player}));
const insideViewport = (b, label) => {
  assert.ok(b.left >= 0 && b.top >= 0 && b.right <= b.vp.w && b.bottom <= b.vp.h, `${label}: bubble inside the viewport ${JSON.stringify(b)}`);
};

try {
  // --- an NPC speaks from a bubble above them, with the tail at them --------------------------------------
  {
    const {page, errors, ctx} = await open();
    await teleport(page, 10.3, 10.4);
    await page.keyboard.press('e');
    await page.waitForSelector('#speech:not([hidden])');
    const b = await bubble(page);
    const anchor = await page.evaluate(() => window.mossvale.speechAnchor('ranger'));
    assert.equal(b.side, 'above');
    assert.equal(b.name, 'Ranger Iris');
    assert.match(b.text, /shrines have been quiet/);
    assert.ok(b.bottom <= anchor.headY, "the bubble is above the speaker's head and name tag");
    assert.ok(Math.abs(b.tailX - anchor.x) <= 1.5, `the tail points at the speaker (${b.tailX} vs ${anchor.x})`);
    insideViewport(b, 'ranger');
    assert.equal(await page.locator('#interact').isVisible(), false, 'the "E · talk" prompt steps aside');
    assert.equal(await page.getAttribute('#speech', 'aria-live'), 'polite');
    assert.equal(await page.getAttribute('.speech-next', 'aria-label'), 'Close conversation');
    // Movement is frozen while someone talks, and the game cannot start another conversation.
    const before = await playerPos(page);
    await page.keyboard.down('d');
    await page.waitForTimeout(500);
    await page.keyboard.up('d');
    const after = await playerPos(page);
    assert.deepEqual([after.x, after.y], [before.x, before.y], 'the player does not walk away mid-sentence');
    // Escape closes without opening the shop.
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#speech').isHidden(), true);
    assert.equal(await page.locator('#modal').isHidden(), true, 'Escape dismisses the conversation, no menu');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'game', 'gameplay focus returns');
    await page.waitForTimeout(300);
    // E talks, E again finishes, and the choices appear as real controls.
    await page.keyboard.press('e');
    await page.waitForSelector('#speech:not([hidden])');
    await page.keyboard.press('e');
    await page.waitForSelector('#rest-team');
    assert.equal(await page.locator('#speech').isHidden(), true);
    assert.match(await page.textContent('#modal'), /What would you like to do/);
    await page.keyboard.press('Escape');
    await page.waitForSelector('#modal', {state: 'hidden'});
    // Walking works again afterwards.
    await page.keyboard.down('d');
    await page.waitForTimeout(400);
    await page.keyboard.up('d');
    assert.notEqual((await playerPos(page)).x, before.x);
    assert.deepEqual(errors, []);
    await ctx.close();
    console.log('ok bubble above the ranger, tail at them, movement frozen, Escape and choices');
  }

  // --- a sign speaks too; a quick second press does not start another conversation ------------------------------
  {
    const {page, ctx} = await open();
    await teleport(page, 11, 12.4);
    await page.keyboard.press('Enter'); // Enter does not start a conversation
    assert.equal(await page.locator('#speech').isHidden(), true);
    await page.keyboard.press('e');
    await page.waitForSelector('#speech:not([hidden])');
    assert.equal((await bubble(page)).name, '', 'a sign has no name tag');
    await page.keyboard.press(' ');
    assert.equal(await page.locator('#speech').isHidden(), true, 'Space moves on');
    await page.keyboard.press('e'); // right after closing
    assert.equal(await page.locator('#speech').isHidden(), true, 'the press that closed it cannot reopen it');
    await page.waitForTimeout(350);
    await page.keyboard.press('e');
    await page.waitForSelector('#speech:not([hidden])');
    await page.click('.speech-next'); // touch / mouse
    assert.equal(await page.locator('#speech').isHidden(), true);
    await ctx.close();
    console.log('ok sign bubble, keys and tap advance, no accidental reopen');
  }

  // --- multi-speaker sequence from data: anchors change, narrator has no tail ----------------------------------
  {
    const {page, errors, ctx} = await open({adventure: 'hearth-hamlet'});
    await teleport(page, 4.3, 5.7);
    await page.keyboard.press('e');
    await page.waitForSelector('#speech:not([hidden])');
    const seen = [];
    for (let i = 0; i < 4; i++) {
      const b = await bubble(page);
      seen.push(b.speaker);
      insideViewport(b, `hearth step ${i}`);
      if (b.speaker === 'narrator') {
        assert.equal(b.side, 'none');
        assert.equal(b.name, '');
      } else {
        const anchor = await page.evaluate(ref => window.mossvale.speechAnchor(ref), b.speaker);
        assert.ok(anchor, `${b.speaker} stands on the map`);
        assert.ok(b.bottom <= anchor.headY + 1 || b.side === 'below', `${b.speaker}: above the speaker`);
        assert.ok(Math.abs(b.tailX - anchor.x) <= 20 || b.left <= 9 || b.right >= b.vp.w - 9, `${b.speaker}: tail near the speaker`);
      }
      if (i === 1) assert.equal(b.name, 'Healer Wren', 'the cottage speaks as its occupant');
      if (i < 3) assert.equal(b.next, 'Next');
      else assert.equal(b.next, 'Done');
      await page.keyboard.press('Enter');
    }
    assert.deepEqual(seen, ['villager', 'building', 'player', 'narrator'], 'the data decides who speaks, line by line');
    assert.equal(await page.locator('#speech').isHidden(), true);
    assert.deepEqual(errors, []);
    await ctx.close();
    console.log('ok multi-speaker sequence from data, narrator fallback');
  }

  // --- edges: tiny phone, zoom extremes, larger text -----------------------------------------------------------
  for (const [label, viewport, settings, positions] of [
    [
      'phone',
      {width: 390, height: 700},
      {zoom: 2.5, text: 'larger'},
      [
        [4.3, 5.7],
        [4.9, 5.5],
        [4.0, 5.4],
      ],
    ],
    [
      'phone zoomed out',
      {width: 390, height: 700},
      {zoom: 0.85},
      [
        [4.3, 5.7],
        [4.9, 5.5],
      ],
    ],
    [
      'desktop zoomed in',
      {width: 1100, height: 800},
      {zoom: 2.5},
      [
        [4.3, 5.7],
        [4.0, 5.4],
      ],
    ],
  ]) {
    const {page, ctx} = await open({adventure: 'hearth-hamlet', viewport, settings});
    for (const [x, y] of positions) {
      await teleport(page, x, y);
      await page.keyboard.press('e');
      await page.waitForSelector('#speech:not([hidden])', {timeout: 3000}).catch(() => assert.fail(`${label} @${x},${y}: no bubble`));
      for (let i = 0; i < 4; i++) {
        const b = await bubble(page);
        insideViewport(b, `${label} @${x},${y} step ${i}`);
        assert.ok(b.tailX >= b.left && b.tailX <= b.right, 'the tail stays on the bubble');
        if (label === 'phone') assert.equal(b.fontSize, 20, 'larger text applies to bubbles');
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(300);
    }
    await ctx.close();
  }
  console.log('ok bubbles stay inside the viewport on phones and at zoom extremes');

  // --- reduced motion, long lines, cleanup on map change -------------------------------------------------------
  {
    const {page, ctx} = await open({settings: {motion: 'reduced'}});
    await teleport(page, 10.3, 10.4);
    await page.keyboard.press('e');
    await page.waitForSelector('#speech:not([hidden])');
    assert.equal((await bubble(page)).animation, 'none', 'no pop-in animation when motion is reduced');
    // Changing map clears the conversation and gives the keys back to the game.
    await page.evaluate(() => {
      window.mossvale.getState().save.badges.push(0); // open the trail to the next region
      window.mossvale.travel(1);
    });
    assert.equal(await page.locator('#speech').isHidden(), true, 'a map change drops the conversation');
    const before = await playerPos(page);
    await page.keyboard.down('d');
    await page.waitForTimeout(400);
    await page.keyboard.up('d');
    assert.notEqual((await playerPos(page)).x, before.x, 'the player can move again');
    await ctx.close();
    console.log('ok reduced motion and cleanup on map change');
  }
} finally {
  await browser.close();
  server.close();
  rmSync(scratch, {recursive: true, force: true});
}
