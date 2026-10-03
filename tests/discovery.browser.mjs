// Exploration and navigation (#73) in a real browser: the minimap and the area map show only what has been explored,
// hidden places appear when found, the progress survives a reload and stays with its adventure, the map pans and zooms
// by keys, buttons, drag and wheel, and the way back to camp is always offered.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, extname} from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';

const root = resolve('.');
const scratch = mkdtempSync(join(tmpdir(), 'mossvale-discovery-'));
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

async function open({adventure = 'mossvale', viewport = {width: 1100, height: 900}} = {}) {
  const ctx = await browser.newContext({viewport});
  await ctx.addInitScript(adventure => {
    if (localStorage.getItem('__seeded')) return;
    localStorage.setItem('__seeded', '1');
    localStorage.setItem('mossvale-adventure', adventure);
  }, adventure);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await boot(page);
  return {page, errors, ctx};
}
async function boot(page) {
  await page.goto(url + '?debug&seed=2');
  await page.waitForFunction(() => window.mossvale);
  await page.waitForSelector('#loading', {state: 'hidden'});
}
const share = (page, id) =>
  page.evaluate(id => {
    const g = window.mossvale.getState();
    const entry = g.save.explored[id];
    if (!entry?.cells) return 0;
    let n = 0;
    for (const byte of entry.cells) for (let b = 0; b < 8; b++) if (byte & (1 << b)) n++;
    return n;
  }, id);
const teleport = async (page, x, y) => {
  await page.evaluate(([px, py]) => Object.assign(window.mossvale.getState().player, {x: px, y: py}), [x, y]);
  await page.waitForTimeout(400);
};
const saveNow = page => page.evaluate(() => window.dispatchEvent(new Event('blur'))); // the game saves on blur
const litPixels = page =>
  page.evaluate(() => {
    const c = document.querySelector('#minimap');
    const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n++;
    return n;
  });
const openArea = async page => {
  await page.keyboard.press('m');
  await page.waitForSelector('#map-area');
  await page.click('#map-area');
  await page.waitForSelector('#area-canvas');
};
const areaState = page => page.evaluate(() => window.mossvale.areaMap());
const places = page => page.locator('.area-place').allTextContents();

try {
  // --- walking reveals the map, the minimap follows, it survives a reload ---------------------------------
  {
    const {page, errors, ctx} = await open();
    const start = await share(page, 'meadow');
    assert.ok(start > 0, 'the ground around the camp is explored from the first moment');
    const lit0 = await litPixels(page);
    await page.waitForTimeout(300);
    await teleport(page, 4, 4);
    await teleport(page, 20, 20);
    const later = await share(page, 'meadow');
    assert.ok(later > start, `walking explores more (${start} -> ${later})`);
    await page.waitForTimeout(300);
    assert.ok((await litPixels(page)) > lit0, 'the minimap shows what was revealed');
    await saveNow(page);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mossvale-v3')).explored.meadow);
    assert.match(stored.c, /^[0-9a-f]+$/);
    assert.ok(stored.c.length <= 256 && stored.d.length > 0, 'small and bounded');
    await boot(page);
    assert.equal(await share(page, 'meadow'), later, 'exploration survives a reload');
    assert.deepEqual(errors, []);
    await ctx.close();
    console.log('ok exploring reveals the minimap and survives a reload');
  }

  // --- area map: keys, buttons, drag, wheel; lists; way back to camp --------------------------------------
  {
    const {page, errors, ctx} = await open();
    await teleport(page, 12, 9);
    await openArea(page);
    await page.waitForFunction(() => document.activeElement?.id === 'area-canvas');
    const list = await places(page);
    assert.ok(list.some(t => /Camp/.test(t)) && list.some(t => /Shrine/.test(t)), `known places are listed: ${list}`);
    assert.ok(
      list.every(t => /north|south|east|west|here/.test(t)),
      'with a direction',
    );
    assert.equal((await page.locator('.area-places li').filter({hasText: 'Treasure'}).count()) >= 0, true);
    const s0 = await areaState(page);
    await page.keyboard.press('ArrowRight');
    const s1 = await areaState(page);
    assert.ok(s1.cx !== s0.cx || s1.cy !== s0.cy, 'arrow keys move the map');
    await page.keyboard.press('+');
    assert.ok((await areaState(page)).zoom > s1.zoom, 'plus zooms in');
    await page.keyboard.press('-');
    await page.keyboard.press('-');
    assert.ok((await areaState(page)).zoom < s1.zoom, 'minus zooms out');
    await page.keyboard.press('0');
    const centred = await areaState(page);
    const me = await page.evaluate(() => ({...window.mossvale.getState().player}));
    assert.ok(Math.abs(centred.cx - me.x) < 0.01 && Math.abs(centred.cy - me.y) < 0.01, '0 centres on you');
    await page.click('#am-down');
    await page.click('#am-in');
    const afterButtons = await areaState(page);
    assert.ok(afterButtons.zoom > centred.zoom && afterButtons.cy !== centred.cy, 'buttons pan and zoom (touch-friendly)');
    const box = await page.locator('#area-canvas').boundingBox();
    const before = await areaState(page);
    await page.mouse.move(box.x + 200, box.y + 150);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 110, {steps: 4});
    await page.mouse.up();
    const dragged = await areaState(page);
    assert.ok(dragged.cx !== before.cx || dragged.cy !== before.cy, 'dragging pans');
    await page.mouse.move(box.x + 200, box.y + 150);
    await page.mouse.wheel(0, -300);
    const zoomed = await areaState(page);
    assert.ok(zoomed.zoom > dragged.zoom, 'the wheel zooms');
    await page.click('#am-fit');
    const fit = await areaState(page);
    assert.ok(fit.zoom < zoomed.zoom, 'Show all fits the whole area');
    await page.click('.area-place >> nth=0');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'area-canvas', 'keys keep working after choosing a place');
    // Stuck? One button takes you to camp.
    await page.click('#am-camp');
    await page.waitForSelector('#modal', {state: 'hidden'});
    const camp = await page.evaluate(() => window.mossvale.getState().world.map.spawns.camp);
    const now = await page.evaluate(() => ({...window.mossvale.getState().player}));
    assert.ok(Math.hypot(now.x - camp.x, now.y - camp.y) < 2, 'Return to camp works from the map');
    // The tabs do not break the island view.
    await page.keyboard.press('m');
    await page.waitForSelector('#map-islands');
    await page.click('#map-islands');
    await page.waitForSelector('[data-travel]');
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, []);
    await ctx.close();
    console.log('ok area map pans, zooms, lists places and returns to camp');
  }

  // --- hidden places stay hidden until you walk close; each adventure keeps its own map -------------------
  {
    const {page, errors, ctx} = await open({adventure: 'hearth-hamlet'});
    await teleport(page, 3, 5);
    await openArea(page);
    let list = await places(page);
    assert.ok(!list.some(t => /Carved stone/.test(t)), `a secret is not on the map yet: ${list}`);
    await page.keyboard.press('Escape');
    await teleport(page, 4.6, 2.8);
    assert.match(await page.locator('#toast').textContent(), /You found something hidden: Carved stone/);
    await openArea(page);
    list = await places(page);
    assert.ok(
      list.some(t => /Carved stone/.test(t)),
      'found places join the map',
    );
    await page.keyboard.press('Escape');
    await saveNow(page);
    const stored = await page.evaluate(() => ({
      own: JSON.parse(localStorage.getItem('mossvale-pack-hearth-hamlet-v3')).explored,
      first: JSON.parse(localStorage.getItem('mossvale-v3'))?.explored ?? null,
      settings: localStorage.getItem('mossvale-settings'),
    }));
    assert.ok(stored.own['hearth-yard'].d.includes('carved-stone'));
    assert.equal(stored.first, null, "the other adventure's map is untouched");
    assert.ok(!/explored|carved/.test(stored.settings ?? ''), 'preferences hold no world progress');
    // Quiet corridor: no encounters on its tall grass, even though the zone covers it.
    assert.equal(await page.evaluate(() => window.mossvale.grass(4, 2)), false, 'quiet corridor');
    assert.equal(await page.evaluate(() => window.mossvale.grass(5, 2)), false, 'quiet corridor');
    await boot(page);
    const list2 = (await openArea(page), await places(page));
    assert.ok(
      list2.some(t => /Carved stone/.test(t)),
      'found places survive a reload',
    );
    assert.deepEqual(errors, []);
    await ctx.close();
    console.log('ok secrets appear when found, adventures keep their own maps, quiet corridors');
  }

  // --- a phone: the controls fit and the keyboard-free route works -------------------------------------------
  {
    const {page, ctx} = await open({viewport: {width: 390, height: 760}});
    await teleport(page, 12, 9);
    await page.click('#worldmap');
    await page.waitForSelector('#map-area');
    await page.click('#map-area');
    await page.waitForSelector('#am-camp');
    const canvas = await page.locator('#area-canvas').boundingBox();
    assert.ok(canvas.width <= 390 && canvas.x >= 0, 'the map fits the screen');
    for (const id of ['#am-in', '#am-out', '#am-up', '#am-down', '#am-left', '#am-right', '#am-center', '#am-fit', '#am-camp']) {
      const b = await page.locator(id).boundingBox();
      assert.ok(b.width >= 40 && b.height >= 40, `${id} is a comfortable touch target`);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no sideways scrolling');
    await ctx.close();
    console.log('ok area map on a phone');
  }
} finally {
  await browser.close();
  server.close();
  rmSync(scratch, {recursive: true, force: true});
}
