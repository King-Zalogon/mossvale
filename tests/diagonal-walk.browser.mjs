// Exercise each diagonal through the real map renderer and record the red-cap atlas cells it draws.
import {chromium} from 'playwright';
import http from 'node:http';
import {existsSync, readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../dist/', import.meta.url);
const types = {html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png'};
const server = http
  .createServer((request, response) => {
    const name = decodeURIComponent(request.url.split('?')[0].slice(1)) || 'index.html';
    const file = new URL(name, root);
    if (!existsSync(file)) return void response.writeHead(404).end();
    response.writeHead(200, {'content-type': types[name.split('.').pop()] || 'application/octet-stream'}).end(readFileSync(file));
  })
  .listen(0);
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
try {
  const page = await browser.newPage({viewport: {width: 1180, height: 820}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.playerAtlasDraws = [];
    window.playerAtlasCellMetrics = [];
    window.capturePlayerMetrics = false;
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
      const isPlayerAtlas = image?.src?.includes('/person-red-cap-motion.png') && args.length >= 8;
      const result = drawImage.call(this, image, ...args);
      if (isPlayerAtlas && window.capturePlayerMetrics) {
        const column = Math.round(args[0] / 160);
        const row = Math.round(args[1] / 256);
        const flipped = this.getTransform().a < 0;
        const width = Math.max(1, Math.round(Math.abs(args[6])));
        const height = Math.max(1, Math.round(Math.abs(args[7])));
        const key = `${column}/${row}/${flipped}/${width}/${height}`;
        if (!window.playerAtlasCellMetrics.some(metric => metric.key === key)) {
          const sample = document.createElement('canvas');
          sample.width = width;
          sample.height = height;
          const context = sample.getContext('2d', {willReadFrequently: true});
          context.imageSmoothingEnabled = false;
          drawImage.call(context, image, args[0], args[1], args[2], args[3], 0, 0, width, height);
          const pixels = context.getImageData(0, 0, width, height).data;
          let count = 0;
          let sumX = 0;
          let minX = width;
          let maxX = -1;
          for (let y = Math.floor(height * 0.86); y < height; y++) {
            for (let x = 0; x < width; x++) {
              const offset = (y * width + x) * 4;
              const red = pixels[offset];
              const green = pixels[offset + 1];
              const blue = pixels[offset + 2];
              if (pixels[offset + 3] < 64 || red < 96 || red < green * 1.25 || red < blue * 1.15) continue;
              count++;
              sumX += x;
              minX = Math.min(minX, x);
              maxX = Math.max(maxX, x);
            }
          }
          window.playerAtlasCellMetrics.push({
            key,
            column,
            row,
            flipped,
            width,
            height,
            footPixels: count,
            footCenterX: count ? sumX / count : null,
            footMinX: count ? minX : null,
            footMaxX: count ? maxX : null,
          });
        }
        window.playerAtlasDraws.push({column, row, flipped, time: performance.now(), width, height});
      }
      return result;
    };
  });
  await page.goto(`http://localhost:${server.address().port}/?debug&seed=130`);
  await page.waitForSelector('#loading', {state: 'hidden'});
  await page.locator('#game').click();

  const diagonals = [
    {name: 'northwest', keys: ['ArrowUp', 'ArrowLeft'], dir: 7, sourceRow: 1, flipped: true},
    {name: 'northeast', keys: ['ArrowUp', 'ArrowRight'], dir: 1, sourceRow: 1, flipped: false},
    {name: 'southwest', keys: ['ArrowDown', 'ArrowLeft'], dir: 5, sourceRow: 5, flipped: false},
    {name: 'southeast', keys: ['ArrowDown', 'ArrowRight'], dir: 3, sourceRow: 3, flipped: false},
    {name: 'west', keys: ['ArrowLeft'], dir: 6, sourceRow: 6, flipped: false},
  ];
  const safeStart = await page.evaluate(() => {
    const api = window.mossvale;
    const {player, world} = api.getState();
    const xs = world.tiles.map(tile => tile.x);
    const ys = world.tiles.map(tile => tile.y);
    const minX = Math.min(...xs) + 5;
    const maxX = Math.max(...xs) - 5;
    const minY = Math.min(...ys) + 5;
    const maxY = Math.max(...ys) - 5;
    const candidates = [];
    for (let y = minY; y < maxY; y++) {
      for (let x = minX; x < maxX; x++) {
        if (!api.valid(x, y) || api.grass(x, y)) continue;
        let clear = true;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ]) {
          for (let distance = 0.5; distance <= 4.5; distance += 0.5) {
            if (!api.valid(x + dx * distance, y + dy * distance) || api.grass(x + dx * distance, y + dy * distance)) clear = false;
          }
        }
        if (clear) candidates.push({x, y, distance: Math.hypot(x - player.x, y - player.y)});
      }
    }
    return candidates.sort((a, b) => a.distance - b.distance)[0] ?? null;
  });
  assert.ok(safeStart, 'the test map provides a grass-free area for all four diagonal directions');
  const scenarios = [];
  for (const diagonal of diagonals) {
    for (const running of [false, true]) {
      await page.evaluate(() => {
        window.playerAtlasDraws = [];
        window.capturePlayerMetrics = true;
      });
      const before = await page.evaluate(start => {
        const player = window.mossvale.getState().player;
        player.x = start.x;
        player.y = start.y;
        player.walkDistance = 0;
        return {...player};
      }, safeStart);
      if (running) await page.keyboard.down('Shift');
      for (const key of diagonal.keys) await page.keyboard.down(key);
      await page.waitForTimeout(1100);
      const after = await page.evaluate(() => ({
        player: {...window.mossvale.getState().player},
        draws: window.playerAtlasDraws,
      }));
      for (const key of diagonal.keys) await page.keyboard.up(key);
      if (running) await page.keyboard.up('Shift');
      assert.equal(after.player.dir, diagonal.dir, `${diagonal.name} ${running ? 'run' : 'walk'} sets the matching world facing`);
      assert.ok(Math.hypot(after.player.x - before.x, after.player.y - before.y) > 0.35, `${diagonal.name} ${running ? 'run' : 'walk'} moves in the real map`);
      const playerCells = after.draws.filter(frame => frame.row === diagonal.sourceRow && frame.flipped === diagonal.flipped);
      const walkFrames = new Set(playerCells.map(frame => frame.column).filter(column => column > 0));
      assert.deepEqual(
        [...walkFrames].sort(),
        [1, 2, 3, 4],
        `${diagonal.name} ${running ? 'run' : 'walk'} renders every walk cell from its intended atlas pose`,
      );
      const sequence = playerCells.reduce((columns, frame) => (columns.at(-1) === frame.column ? columns : [...columns, frame.column]), []);
      assert.ok(sequence.length >= 5, `${diagonal.name} ${running ? 'run' : 'walk'} repeats the complete cycle at gameplay cadence`);
      for (let index = 1; index < sequence.length; index++) {
        assert.equal(sequence[index], (sequence[index - 1] % 4) + 1, `${diagonal.name} ${running ? 'run' : 'walk'} advances without skipping a stride`);
      }
      scenarios.push({
        direction: diagonal.name,
        mode: running ? 'run' : 'walk',
        distance: Math.hypot(after.player.x - before.x, after.player.y - before.y),
        transitions: sequence.length - 1,
      });
      await page.waitForTimeout(120);
      const stopped = await page.evaluate(() => window.playerAtlasDraws.at(-1));
      assert.equal(stopped?.column, 0, `${diagonal.name} settles on the idle cell after stopping`);
    }
  }

  const metrics = await page.evaluate(() => window.playerAtlasCellMetrics);
  const strides = diagonals.map(diagonal => {
    const cells = metrics.filter(metric => metric.row === diagonal.sourceRow && metric.flipped === diagonal.flipped && metric.column > 0);
    const positions = cells.map(metric => metric.footCenterX).filter(Number.isFinite);
    assert.equal(new Set(cells.map(metric => metric.column)).size, 4, `${diagonal.name} measures four cells at the actual map draw size`);
    assert.ok(
      cells.every(metric => metric.footPixels > 0),
      `${diagonal.name} keeps visible footwear in every walk cell`,
    );
    const span = Math.max(...positions) - Math.min(...positions);
    const minimumFootTravel = diagonal.name === 'west' ? 4 : 7.5;
    assert.ok(span >= minimumFootTravel, `${diagonal.name} moves its visible feet at least ${minimumFootTravel} rendered pixels (got ${span.toFixed(1)})`);
    if (['northwest', 'northeast', 'southwest', 'west'].includes(diagonal.name)) {
      const byColumn = Object.fromEntries(cells.map(metric => [metric.column, metric.footCenterX]));
      const alternatingPair = Math.abs(byColumn[1] - byColumn[3]);
      const minimumAlternation = diagonal.name === 'west' ? 2 : 6;
      assert.ok(
        alternatingPair >= minimumAlternation,
        `${diagonal.name} visibly alternates its leading boot between the opposing stride poses at gameplay scale (delta ${alternatingPair.toFixed(1)} px)`,
      );
    }
    return {direction: diagonal.name, width: cells[0].width, height: cells[0].height, footTravelPx: Number(span.toFixed(1))};
  });
  for (const diagonal of diagonals) {
    const walk = scenarios.find(item => item.direction === diagonal.name && item.mode === 'walk');
    const run = scenarios.find(item => item.direction === diagonal.name && item.mode === 'run');
    assert.ok(run.distance > walk.distance * 1.1, `${diagonal.name} covers more ground in the same time while running`);
  }

  // A turn to a cardinal and a reverse diagonal must retain movement while changing facing cleanly.
  const turnStart = await page.evaluate(start => {
    const player = window.mossvale.getState().player;
    player.x = start.x;
    player.y = start.y;
    player.walkDistance = 0;
    return {...player};
  }, safeStart);
  await page.keyboard.down('ArrowDown');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(220);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(180);
  assert.equal(await page.evaluate(() => window.mossvale.getState().player.dir), 4, 'turning from SE to south updates the cardinal facing');
  await page.keyboard.up('ArrowDown');
  await page.waitForTimeout(80);
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(260);
  const turnEnd = await page.evaluate(() => ({...window.mossvale.getState().player}));
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('ArrowLeft');
  assert.equal(turnEnd.dir, 7, 'backtracking from SE uses the NW facing');
  assert.ok(Math.hypot(turnEnd.x - turnStart.x, turnEnd.y - turnStart.y) > 0.2, 'turn and backtrack remain playable on the real map');

  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.evaluate(() => localStorage.setItem('mossvale-settings', JSON.stringify({motion: 'reduced'})));
  await page.reload();
  await page.waitForSelector('#loading', {state: 'hidden'});
  await page.locator('#game').click();
  for (const diagonal of diagonals) {
    await page.evaluate(() => {
      window.playerAtlasDraws = [];
      window.capturePlayerMetrics = true;
    });
    for (const key of diagonal.keys) await page.keyboard.down(key);
    await page.waitForTimeout(250);
    const facingWhileHeld = await page.evaluate(() => window.mossvale.getState().player.dir);
    for (const key of diagonal.keys) await page.keyboard.up(key);
    const drawsAtIdle = await page.evaluate(() => window.playerAtlasDraws);
    assert.equal(facingWhileHeld, diagonal.dir, `reduced motion preserves ${diagonal.name} facing while both keys are held`);
    const cells = drawsAtIdle.filter(frame => frame.row === diagonal.sourceRow && frame.flipped === diagonal.flipped);
    assert.ok(cells.length > 0, `reduced motion draws ${diagonal.name} from the expected source row`);
    assert.deepEqual([...new Set(cells.map(frame => frame.column))], [0], `reduced motion holds the ${diagonal.name} idle pose`);
  }
  assert.deepEqual(errors, []);
  console.log(
    `ok real-map diagonal walk/run cycles ${JSON.stringify(scenarios)}; actual-scale foot travel ${JSON.stringify(strides)}; reduced motion, turns and backtracking verified`,
  );
} finally {
  await browser.close();
  server.close();
}
