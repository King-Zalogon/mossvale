// Measures drawing cost on each map in headless Chromium (software rendering, so absolute numbers are pessimistic:
// compare before/after, and run the same page on your own device with ?debug and `mossvale.perf()` for real numbers).
//   node scripts/measure-perf.mjs [seconds-per-map]
// Needs `npm ci`. Not part of CI: timings are machine-dependent.
import {chromium} from 'playwright';
import http from 'node:http';
import {readFileSync, existsSync} from 'node:fs';

const seconds = Number(process.argv[2]) || 4;
const root = new URL('../dist/', import.meta.url);
const types = {html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', json: 'application/json', svg: 'image/svg+xml'};
const server = http
  .createServer((q, r) => {
    const name = q.url.split('?')[0].slice(1) || 'index.html';
    if (!existsSync(new URL(name, root))) return void r.writeHead(404).end();
    r.writeHead(200, {'content-type': types[name.split('.').pop()] ?? 'application/octet-stream'}).end(readFileSync(new URL(name, root)));
  })
  .listen(0);
const url = `http://localhost:${server.address().port}/`;
const launch = () => chromium.launch({executablePath: process.env.CHROMIUM || undefined});
const stats = list => {
  const a = [...list].sort((x, y) => x - y);
  const at = q => a[Math.min(a.length - 1, Math.floor(a.length * q))] ?? 0;
  return {avg: a.reduce((s, v) => s + v, 0) / (a.length || 1), p95: at(0.95), max: a.at(-1) ?? 0};
};
const rows = [];
for (const region of [0, 1, 2]) {
  const browser = await launch(); // a fresh browser per map: background pages are throttled
  const ctx = await browser.newContext({viewport: {width: 1280, height: 800}});
  const page = await ctx.newPage();
  await page.addInitScript(
    r =>
      localStorage.setItem(
        'mossvale-v3',
        JSON.stringify({
          version: 3,
          region: ['meadow', 'amber-ridge', 'frostveil-grove'][r],
          badges: ['meadow', 'amber-ridge'].slice(0, r),
          met: true,
          caught: ['fernling'],
          active: 'fernling',
        }),
      ),
    region,
  );
  await page.goto(url + '?debug&seed=1');
  await page.waitForSelector('#loading', {state: 'hidden'});
  // Walk along the busiest part of the map for the whole run so the camera and follower move like in play.
  const dense = await page.evaluate(() => {
    const {world} = window.mossvale.getState();
    let best = {n: -1, x: 0, y: 0};
    for (const c of world.objects) {
      const n = world.objects.filter(o => Math.abs(o.x - c.x) < 7 && Math.abs(o.y - c.y) < 7).length;
      if (n > best.n && window.mossvale.valid(c.x + 1, c.y + 1)) best = {n, x: c.x + 1, y: c.y + 1};
    }
    Object.assign(window.mossvale.getState().player, {x: best.x, y: best.y});
    return best.n;
  });
  const t0 = Date.now();
  while (Date.now() - t0 < seconds * 1000) {
    await page.keyboard.down('d');
    await page.waitForTimeout(500);
    await page.keyboard.up('d');
    await page.keyboard.down('a');
    await page.waitForTimeout(500);
    await page.keyboard.up('a');
  }
  const r = await page.evaluate(() => {
    const p = window.mossvale.perf();
    return {
      draw: p.draw,
      mini: p.mini,
      visibleTiles: p.visibleTiles,
      worldTiles: p.worldTiles,
      visibleObjects: p.visibleObjects,
      worldObjects: p.worldObjects,
      frames: p.frames,
      ms: performance.now() - p.started,
      heap: performance.memory?.usedJSHeapSize ?? 0,
      objects: window.mossvale.getState().world.objects.length,
    };
  });
  rows.push({
    map: ['meadow', 'amber-ridge', 'frostveil-grove'][region],
    objects: r.objects,
    nearby: dense,
    fps: Math.round((r.frames / r.ms) * 1000),
    visibleTiles: r.visibleTiles,
    worldTiles: r.worldTiles,
    visibleObjects: r.visibleObjects,
    worldObjects: r.worldObjects,
    draw: stats(r.draw),
    mini: stats(r.mini),
    heapMB: Math.round(r.heap / 1e5) / 10,
  });
  await browser.close();
}
const f = n => n.toFixed(2).padStart(6);
console.log('map              objects near   fps | visible tiles | visible objects | drawWorld ms: avg   p95   max | minimap avg | heap MB');
for (const r of rows)
  console.log(
    `${r.map.padEnd(16)} ${String(r.objects).padStart(7)} ${String(r.nearby).padStart(4)} ${String(r.fps).padStart(5)} | ${String(Math.round(stats(r.visibleTiles).avg)).padStart(5)} / ${String(Math.round(stats(r.worldTiles).avg)).padStart(5)} | ${String(Math.round(stats(r.visibleObjects).avg)).padStart(5)} / ${String(Math.round(stats(r.worldObjects).avg)).padStart(5)} | ${f(r.draw.avg)} ${f(r.draw.p95)} ${f(r.draw.max)} | ${f(r.mini.avg)}        | ${r.heapMB}`,
  );
server.close();
