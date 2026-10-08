import {chromium} from 'playwright';
import http from 'node:http';
import {existsSync, readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../dist/', import.meta.url);
const types = {html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml'};
const server = http
  .createServer((request, response) => {
    const name = decodeURIComponent(request.url.split('?')[0].slice(1)) || 'index.html';
    const file = new URL(name, root);
    if (!existsSync(file)) return void response.writeHead(404).end();
    response.writeHead(200, {'content-type': types[name.split('.').pop()] || 'application/octet-stream'}).end(readFileSync(file));
  })
  .listen(0);
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});

async function play(page, optedIn) {
  await page.goto(`http://localhost:${server.address().port}/?debug&seed=77${optedIn ? '&combatTrace' : ''}`);
  await page.waitForSelector('#loading', {state: 'hidden'});
  await page.evaluate(() => {
    const save = window.mossvale.getState().save;
    save.team[save.active].hp = 10;
    window.mossvale.encounter(11);
    const battle = window.mossvale.getState().battle;
    battle.hp = battle.max = 9999;
  });
  await page.waitForSelector('#attack');
  await page.click('#attack');
  await page.waitForFunction(() => window.mossvale.getState().battle?.turn === 1 && !window.mossvale.getState().battle.busy);
  return page.evaluate(() => {
    const save = structuredClone(window.mossvale.getState().save);
    delete save.playTime; // RAF timing differs slightly between otherwise identical runs.
    return JSON.stringify([save, window.mossvale.getState().battle]);
  });
}

try {
  const traced = await browser.newPage();
  const tracedState = await play(traced, true);
  const records = await traced.evaluate(() => window.mossvale.combatTrace());
  assert.deepEqual(
    records.map(record => record.type),
    ['battle.started', 'battle.decision'],
  );
  const start = records[0];
  assert.equal(start.encounter.speciesId, 'hushram');
  assert.equal(start.party.length, 1);
  const decision = records[1];
  assert.equal(decision.chosen.kind, 'attack');
  assert.equal(decision.active.hp, 10);
  assert.equal(decision.options.find(option => option.kind === 'element').available, true);
  assert.equal(decision.options.find(option => option.kind === 'potion').available, true);
  assert.ok(decision.outcome.events.some(event => event.type === 'enemy'));
  const downloadWait = traced.waitForEvent('download');
  assert.equal(await traced.evaluate(() => window.mossvale.exportCombatTrace()), true);
  const download = await downloadWait;
  assert.match(download.suggestedFilename(), /^mossvale-combat-trace-.*\.json$/);
  const path = await download.path();
  const exportData = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(exportData.schema, 'mossvale.combat-trace');
  assert.equal(exportData.metadata.seed, 77);
  assert.equal(exportData.records.length, 2);

  const ordinary = await browser.newPage();
  const untracedState = await play(ordinary, false);
  assert.deepEqual(await ordinary.evaluate(() => window.mossvale.combatTrace()), []);
  assert.equal(await ordinary.evaluate(() => window.mossvale.exportCombatTrace()), false);
  assert.equal(tracedState, untracedState, 'opt-in observer leaves seeded battle outcomes and saved progress unchanged');
  console.log('ok combat trace is opt-in, local, exportable and observational');
} finally {
  await browser.close();
  server.close();
}
