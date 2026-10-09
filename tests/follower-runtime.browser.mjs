// Check directional follower sprites while companions traverse the actual map and renderer.
import {chromium} from 'playwright';
import http from 'node:http';
import {existsSync, readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {assets} from '../dist/src/data/assets.js';
import {DIRECTIONS} from '../dist/src/domain/exploration.js';
import {species} from '../dist/src/data/species.js';

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
  const page = await browser.newPage({viewport: {width: 1200, height: 850}, hasTouch: true});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.followerAtlasDraws = [];
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
      if (
        image?.src?.includes('-follower.png') ||
        /\/creature-(mushmallow|frostowl|sunskitter)\.png$/.test(image?.src ?? '') ||
        image?.src?.endsWith('/tree-oak.png')
      ) {
        window.followerAtlasDraws.push({
          src: image.src,
          column: Math.round(args[0] / 200),
          row: Math.round(args[1] / 200),
          flipped: this.getTransform().a < 0,
          alpha: this.globalAlpha,
        });
      }
      return drawImage.call(this, image, ...args);
    };
  });
  await page.goto(`http://localhost:${server.address().port}/?debug&seed=131`);
  await page.waitForSelector('#loading', {state: 'hidden'});
  const supported = [
    'emberkin',
    'fernling',
    'duskwing',
    'brooklet',
    'hushram',
    'voltkit',
    'mushmallow',
    'frostowl',
    'pebblit',
    'bramblebuck',
    'siltkip',
    'sunskitter',
    'sunsifter',
    'rillume',
  ];
  const ids = supported.map(name => species.findIndex(entry => entry.id === name));
  assert.ok(ids.every(id => id >= 0));
  await page.evaluate(([emberkin, fernling]) => {
    const game = window.mossvale.getState();
    Object.assign(game.save, {
      caught: [emberkin, fernling],
      party: [emberkin, fernling],
      active: emberkin,
      team: {[emberkin]: {xp: 0, hp: 100}, [fernling]: {xp: 0, hp: 100}},
    });
    // Keep this movement-only test out of encounter flow while retaining normal map collision and rendering.
    game.world.map.zones = [];
  }, ids);
  const clearStart = await page.evaluate(() => {
    const game = window.mossvale.getState();
    const tiles = game.world.tiles;
    for (const tile of tiles) {
      const x = tile.x + 0.5;
      const y = tile.y + 0.5;
      let clear = true;
      for (let ix = -7; ix <= 7 && clear; ix++)
        for (let iy = -7; iy <= 7; iy++)
          if (!window.mossvale.valid(x + ix * 0.5, y + iy * 0.5)) {
            clear = false;
            break;
          }
      if (clear) {
        Object.assign(game.player, {x, y, walkDistance: 0});
        return {x, y};
      }
    }
    return null;
  });
  assert.ok(clearStart, 'the test selects a clear start with all eight traversable directions');
  await page.locator('#game').click();

  const expected = Object.fromEntries(
    supported.map(name => {
      const sprite = assets.find(asset => asset.name === `creature-${name}-follower`);
      assert.ok(sprite?.frames?.rowOrder, `${name} has a named directional atlas`);
      return [name, {sprite: sprite.src, rows: sprite.frames.rowOrder, mirror: sprite.frames.mirror ?? {}}];
    }),
  );
  // Independent reviewed source-row contracts for the directions that owners reported mislabeled.
  const reviewedRows = {
    emberkin: {north: 4, northeast: 3, east: 2, southeast: 7, south: 0, southwest: 1, west: 6, northwest: 5},
    brooklet: {north: 0, northeast: 7, east: 6, southeast: 5, south: 4, southwest: 3, west: 2, northwest: 1},
    voltkit: {north: 0, northeast: 1, east: 2, southeast: 3, south: 4, southwest: 6, west: 7, northwest: 5},
    hushram: {north: 0, northeast: 1, east: 2, southeast: 6, south: 4, southwest: 7, west: 3, northwest: 5},
    mushmallow: {north: 0, northeast: 1, east: 2, southeast: 3, south: 4, southwest: 5, west: 6, northwest: 7},
  };
  const reviewedMirrors = {
    emberkin: {southeast: 'southwest'},
    fernling: {northwest: 'northeast'},
  };
  for (const [name, rows] of Object.entries(reviewedRows)) {
    const sprite = assets.find(asset => asset.name === `creature-${name}-follower`);
    assert.deepEqual(
      Object.fromEntries(DIRECTIONS.map(direction => [direction, sprite.frames.rowOrder.indexOf(reviewedMirrors[name]?.[direction] ?? direction)])),
      Object.fromEntries(DIRECTIONS.map(direction => [direction, rows[reviewedMirrors[name]?.[direction] ?? direction]])),
      `${name} manifest row labels match independently reviewed source poses`,
    );
  }
  const directionKeys = [
    ['ArrowUp'],
    ['ArrowUp', 'ArrowRight'],
    ['ArrowRight'],
    ['ArrowDown', 'ArrowRight'],
    ['ArrowDown'],
    ['ArrowDown', 'ArrowLeft'],
    ['ArrowLeft'],
    ['ArrowUp', 'ArrowLeft'],
  ];
  const fallbackId = species.findIndex(entry => entry.id === 'sunskitter');
  const evidence = {};
  for (let speciesIndex = 0; speciesIndex < supported.length; speciesIndex++) {
    const name = supported[speciesIndex];
    const wantedId = ids[speciesIndex];
    const directions = [];
    for (let directionIndex = 0; directionIndex < directionKeys.length; directionIndex++) {
      const keys = directionKeys[directionIndex];
      await page.evaluate(
        ([resetId, point]) => {
          const game = window.mossvale.getState();
          game.save.active = resetId;
          Object.assign(game.player, {x: point.x, y: point.y, walkDistance: 0});
          game.trail.length = 0;
        },
        [fallbackId, clearStart],
      );
      await page.waitForTimeout(100); // reset the renderer's motion state through the static portrait fallback
      await page.evaluate(
        ([id, point]) => {
          const game = window.mossvale.getState();
          game.save.active = id;
          Object.assign(game.player, {x: point.x, y: point.y, walkDistance: 0});
          game.trail.length = 0;
        },
        [wantedId, clearStart],
      );
      await page.evaluate(() => (window.followerAtlasDraws = []));
      const before = await page.evaluate(() => ({
        player: {...window.mossvale.getState().player},
        followerMotion: window.mossvale.getState().followerMotion,
      }));
      for (const key of keys) await page.keyboard.down(key);
      await page.waitForFunction(
        ({start, direction}) => {
          const game = window.mossvale.getState();
          return Math.hypot(game.player.x - start.x, game.player.y - start.y) > 0.5 && game.player.dir === direction;
        },
        {start: before.player, direction: directionIndex},
        {timeout: 10000},
      );
      await page.waitForFunction(
        ({direction, id}) => {
          const motion = window.mossvale.getState().followerMotion;
          return motion.dir === direction && motion.id === id;
        },
        {direction: directionIndex, id: assets.findIndex(asset => asset.name === `creature-${name}-follower`)},
        {timeout: 10000},
      );
      const direction = DIRECTIONS[directionIndex];
      const mirror = reviewedMirrors[name]?.[direction] ?? expected[name].mirror[direction];
      const expectedRow = reviewedRows[name]?.[mirror ?? direction] ?? expected[name].rows.indexOf(mirror ?? direction);
      await page.waitForFunction(
        ({src, row, flipped}) => {
          const columns = window.followerAtlasDraws
            .filter(frame => frame.src.endsWith(src) && frame.row === row && frame.flipped === flipped && frame.column > 0)
            .map(frame => frame.column);
          return new Set(columns).size >= 2;
        },
        {src: expected[name].sprite, row: expectedRow, flipped: !!mirror},
        {timeout: 5000},
      );
      const moved = await page.evaluate(() => ({
        player: {...window.mossvale.getState().player},
        followerMotion: window.mossvale.getState().followerMotion,
      }));
      const player = moved.player;
      assert.equal(player.dir, directionIndex, `${name} player can take direction ${DIRECTIONS[directionIndex]}`);
      assert.ok(Math.hypot(player.x - before.player.x, player.y - before.player.y) > 0.5, `${name} player moves in direction ${DIRECTIONS[directionIndex]}`);
      assert.equal(moved.followerMotion.dir, directionIndex, `${name} follower preserves its own ${DIRECTIONS[directionIndex]} facing`);
      assert.equal(
        moved.followerMotion.id,
        assets.findIndex(asset => asset.name === `creature-${name}-follower`),
        `${name} selects the supported follower atlas`,
      );
      for (const key of keys) await page.keyboard.up(key);
      await page.waitForTimeout(450);
      const ownAtlas = await page.evaluate(src => window.followerAtlasDraws.filter(frame => frame.src.endsWith(src)), expected[name].sprite);
      const directionFrames = ownAtlas.filter(frame => frame.row === expectedRow && frame.flipped === !!mirror);
      assert.ok(
        directionFrames.length,
        `${name} selects the ${DIRECTIONS[directionIndex]} row; observed rows ${JSON.stringify([...new Set(ownAtlas.map(frame => frame.row))])}`,
      );
      const walkColumns = [...new Set(directionFrames.map(frame => frame.column).filter(column => column > 0))].sort((a, b) => a - b);
      assert.ok(walkColumns.length >= 2, `${name} visibly advances walk cells while following ${DIRECTIONS[directionIndex]}`);
      assert.ok(
        directionFrames.some(frame => frame.column === 0),
        `${name} holds idle when the player stops`,
      );
      directions.push({direction: DIRECTIONS[directionIndex], walkColumns});
    }
    evidence[name] = directions;
  }

  await page.evaluate(
    ([resetId, point]) => {
      const game = window.mossvale.getState();
      game.save.active = resetId;
      Object.assign(game.player, {x: point.x, y: point.y, walkDistance: 0});
      game.trail.length = 0;
    },
    [fallbackId, clearStart],
  );
  await page.waitForTimeout(100);
  await page.evaluate(
    ([id, point]) => {
      const game = window.mossvale.getState();
      game.save.active = id;
      Object.assign(game.player, {x: point.x, y: point.y, walkDistance: 0});
      game.trail.length = 0;
    },
    [ids[0], clearStart],
  );
  await page.evaluate(() => (window.followerAtlasDraws = []));
  await page.keyboard.down('ArrowRight');
  const gaitSamples = await page.evaluate(async () => {
    const samples = [];
    for (let i = 0; i < 42; i++) {
      await new Promise(requestAnimationFrame);
      const motion = window.mossvale.getState().followerMotion;
      samples.push({x: motion.x, y: motion.y, distance: motion.distance});
    }
    return samples;
  });
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(120);
  const gaitSteps = gaitSamples.slice(1).map((sample, index) => ({
    moved: Math.hypot(sample.x - gaitSamples[index].x, sample.y - gaitSamples[index].y),
    distance: sample.distance - gaitSamples[index].distance,
  }));
  assert.ok(
    gaitSteps.some(step => step.moved > 0.005),
    'the follower visibly travels during the gait sample',
  );
  assert.ok(
    gaitSteps.every(step => step.moved < 0.16),
    'interpolated follower position has no visible snap between samples',
  );
  assert.ok(
    gaitSteps.every(step => step.distance >= -1e-9),
    'the distance-based walk phase never jitters backward',
  );
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(850);
  await page.keyboard.up('ArrowLeft');
  await page.waitForTimeout(450);
  const backtrack = await page.evaluate(() => ({player: window.mossvale.getState().player.dir, follower: window.mossvale.getState().followerMotion.dir}));
  assert.deepEqual([backtrack.player, backtrack.follower], [6, 6], 'the follower turns west when the player backtracks');

  const oakId = assets.findIndex(asset => asset.name === 'tree-oak');
  assert.notEqual(oakId, -1, 'the actual map renderer has its foreground oak asset');
  await page.evaluate(
    ([id, treeId, point]) => {
      const game = window.mossvale.getState();
      game.save.active = id;
      game.player.x = point.x + 1;
      game.player.y = point.y;
      game.trail.splice(0, game.trail.length, {x: point.x, y: point.y});
      game.world.objects = [...game.world.objects, {x: point.x, y: point.y + 1, id: treeId, w: 100, kind: 'scenery'}];
    },
    [ids[0], oakId, clearStart],
  );
  await page.evaluate(() => (window.followerAtlasDraws = []));
  await page.waitForTimeout(250);
  const foliageOcclusion = await page.evaluate(() => window.followerAtlasDraws.filter(frame => frame.src.endsWith('/tree-oak.png')));
  assert.ok(
    foliageOcclusion.some(frame => frame.alpha < 0.3),
    `foreground foliage renders translucent when overlapping a real follower actor: ${JSON.stringify(foliageOcclusion.slice(0, 8))}`,
  );

  await page.evaluate(
    ([resetId, point]) => {
      const game = window.mossvale.getState();
      game.save.active = resetId;
      Object.assign(game.player, {x: point.x, y: point.y, walkDistance: 0});
      game.trail.length = 0;
    },
    [fallbackId, clearStart],
  );
  await page.waitForTimeout(100);
  await page.evaluate(
    ([id, point]) => {
      const game = window.mossvale.getState();
      game.save.active = id;
      Object.assign(game.player, {x: point.x, y: point.y, walkDistance: 0});
      game.trail.length = 0;
    },
    [ids[0], clearStart],
  );
  await page.setViewportSize({width: 390, height: 844});
  await page.locator('#game').tap(); // actual touch restores the movement HUD after keyboard play
  const northeastPad = page.locator('button[data-dir="1,-1"]');
  await northeastPad.waitFor({state: 'visible'});
  const pad = await northeastPad.boundingBox();
  const touch = await page.context().newCDPSession(page);
  await page.evaluate(() => (window.followerAtlasDraws = []));
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{id: 1, x: pad.x + pad.width / 2, y: pad.y + pad.height / 2}],
  });
  await page.waitForTimeout(850);
  await touch.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await page.waitForTimeout(450);
  const touchPose = await page.evaluate(() => ({
    player: window.mossvale.getState().player.dir,
    follower: window.mossvale.getState().followerMotion,
  }));
  assert.deepEqual([touchPose.player, touchPose.follower.dir], [1, 1], 'touch movement updates player and follower direction');
  const touchFrames = await page.evaluate(src => window.followerAtlasDraws.filter(frame => frame.src.endsWith(src)), expected.emberkin.sprite);
  assert.ok(touchFrames.some(frame => frame.row === expected.emberkin.rows.indexOf('northeast') && frame.column > 0));
  await touch.detach();

  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.evaluate(
    ([resetId, point]) => {
      const game = window.mossvale.getState();
      game.save.active = resetId;
      Object.assign(game.player, {x: point.x, y: point.y, walkDistance: 0});
      game.trail.length = 0;
    },
    [fallbackId, clearStart],
  );
  await page.waitForTimeout(100);
  await page.evaluate(
    ([id, point]) => {
      const game = window.mossvale.getState();
      game.save.active = id;
      Object.assign(game.player, {x: point.x, y: point.y, walkDistance: 0});
      game.trail.length = 0;
    },
    [ids[0], clearStart],
  );
  await page.evaluate(() => (window.followerAtlasDraws = []));
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(850);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(450);
  const calmMotion = await page.evaluate(() => ({
    follower: window.mossvale.getState().followerMotion,
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  }));
  assert.equal(calmMotion.reduced, true);
  assert.equal(calmMotion.follower.dir, 1, 'reduced motion still updates Emberkin facing');
  const calmCells = await page.evaluate(src => window.followerAtlasDraws.filter(frame => frame.src.endsWith(src)), expected.emberkin.sprite);
  assert.ok(calmCells.some(frame => frame.row === expected.emberkin.rows.indexOf('northeast') && frame.column === 0));
  assert.ok(
    calmCells.every(frame => frame.column === 0),
    'reduced motion freezes the follower at idle column 0',
  );

  await page.emulateMedia({reducedMotion: 'no-preference'});
  await page.evaluate(id => {
    const game = window.mossvale.getState();
    game.save.active = id;
    window.mossvale.travel('orchard-ruins');
  }, ids[0]);
  await page.waitForFunction(() => window.mossvale.getState().world.map.id === 'orchard-ruins');
  await page.evaluate(() => (window.mossvale.getState().world.map.zones = []));
  await page.evaluate(id => (window.mossvale.getState().save.active = id), ids[0]);
  await page.evaluate(() => (window.followerAtlasDraws = []));
  const portalStart = await page.evaluate(() => ({...window.mossvale.getState().player}));
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(850);
  await page.keyboard.up('ArrowLeft');
  await page.waitForTimeout(450);
  const afterPortal = await page.evaluate(() => ({
    map: window.mossvale.getState().world.map.id,
    motion: window.mossvale.getState().followerMotion,
    player: window.mossvale.getState().player,
  }));
  assert.equal(afterPortal.map, 'orchard-ruins');
  assert.ok(afterPortal.player.x < portalStart.x - 0.2, 'the portal spawn supports ordinary westward movement');
  assert.notEqual(afterPortal.motion.dir, 4, 'companion does not remain south-facing after portal travel');
  const portalFrames = await page.evaluate(src => window.followerAtlasDraws.filter(frame => frame.src.endsWith(src)), expected.emberkin.sprite);
  assert.ok(portalFrames.some(frame => frame.row === expected.emberkin.rows.indexOf(DIRECTIONS[afterPortal.motion.dir])));
  await page.reload();
  await page.waitForSelector('#loading', {state: 'hidden'});
  assert.equal(await page.evaluate(() => window.mossvale.getState().world.map.id), 'orchard-ruins', 'reload retains the active map');
  const reloadStart = await page.evaluate(id => {
    const game = window.mossvale.getState();
    game.world.map.zones = [];
    Object.assign(game.player, game.world.map.spawns.camp, {walkDistance: 0});
    game.trail.length = 0;
    game.save.active = id;
    return {...game.player};
  }, ids[0]);
  await page.evaluate(() => (window.followerAtlasDraws = []));
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(850);
  await page.keyboard.up('ArrowLeft');
  await page.waitForTimeout(450);
  const afterReload = await page.evaluate(() => ({
    map: window.mossvale.getState().world.map.id,
    motion: window.mossvale.getState().followerMotion,
    player: window.mossvale.getState().player,
  }));
  assert.equal(afterReload.map, 'orchard-ruins');
  assert.ok(afterReload.player.x < reloadStart.x - 0.2, 'ordinary movement resumes after reload');
  assert.notEqual(afterReload.motion.dir, 4, 'companion does not remain south-facing after reload');
  const reloadFrames = await page.evaluate(src => window.followerAtlasDraws.filter(frame => frame.src.endsWith(src)), expected.emberkin.sprite);
  assert.ok(reloadFrames.some(frame => frame.row === expected.emberkin.rows.indexOf(DIRECTIONS[afterReload.motion.dir])));

  // Static fallback remains usable when a supported optional direction atlas fails to load.
  const fallbackPage = await browser.newPage({viewport: {width: 1200, height: 850}});
  const fallbackErrors = [];
  fallbackPage.on('pageerror', error => fallbackErrors.push(error.message));
  await fallbackPage.route('**/assets/creatures/creature-sunskitter-follower.png', route => route.abort());
  await fallbackPage.addInitScript(() => {
    window.followerAtlasDraws = [];
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
      if (/\/creature-sunskitter(?:-follower)?\.png$/.test(image?.src ?? '')) window.followerAtlasDraws.push({src: image.src});
      return drawImage.call(this, image, ...args);
    };
  });
  await fallbackPage.goto(`http://localhost:${server.address().port}/?debug&seed=132`);
  await fallbackPage.waitForSelector('#loading', {state: 'hidden'});
  await fallbackPage.locator('#game').click();
  await fallbackPage.evaluate(id => {
    const save = window.mossvale.getState().save;
    save.caught = [id];
    save.party = [id];
    save.active = id;
    save.team = {[id]: {xp: 0, hp: 100}};
  }, fallbackId);
  await fallbackPage.evaluate(() => (window.followerAtlasDraws = []));
  await fallbackPage.keyboard.down('ArrowUp');
  await fallbackPage.waitForTimeout(500);
  await fallbackPage.keyboard.up('ArrowUp');
  const fallbackDraws = await fallbackPage.evaluate(() => window.followerAtlasDraws);
  assert.equal(fallbackDraws.filter(frame => frame.src.endsWith('creature-sunskitter-follower.png')).length, 0);
  assert.ok(
    fallbackDraws.some(frame => frame.src.endsWith('creature-sunskitter.png')),
    'failed optional atlas keeps the portrait fallback',
  );
  assert.deepEqual(fallbackErrors, []);
  assert.deepEqual(errors, []);
  console.log(`ok live follower renderer ${JSON.stringify(evidence)}; optional portrait fallback and page execution are healthy`);
} finally {
  await browser.close();
  server.close();
}
