// A normal first chapter through the real UI, no debug damage: fight and capture wild creatures with ordinary
// actions, rest at the ranger, challenge the meadow guardian at its shrine and earn the seal. Run: node tests/playthrough.browser.mjs
import {chromium} from 'playwright';
import http from 'node:http';
import {readFileSync, existsSync, mkdtempSync} from 'node:fs';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {codec, newSave} from './helpers.mjs';
import {inputForWorldTarget, rangerToShrineScript} from './action-script.mjs';
import {runDomainActionScript} from './action-script-domain.mjs';

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
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
const ctx = await browser.newContext();
await ctx.addInitScript(`localStorage.setItem('mossvale-settings', JSON.stringify({motion: 'reduced'}))`); // shorter waits between rounds
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(url + '?debug&seed=42');
await page.waitForSelector('#loading', {state: 'hidden'});
const bootstrapEvents = await page.evaluate(() => window.mossvale.events());
for (const type of ['objective.changed', 'save.write'])
  assert.ok(
    bootstrapEvents.some(event => event.type === type),
    `startup records ${type}; saw ${bootstrapEvents.map(event => event.type).join(', ')}`,
  );

const state = () =>
  page.evaluate(() => {
    const g = window.mossvale.getState();
    const s = g.save;
    return {
      phase: g.phase,
      battle: g.battle && {
        hp: g.battle.hp,
        max: g.battle.max,
        busy: g.battle.busy,
        boss: g.battle.boss,
        focus: g.battle.focus,
        turn: g.battle.turn,
        tactic: g.battle.tactic,
      },
      caught: s.caught.length,
      caughtIds: s.caught,
      active: s.active,
      party: s.party,
      reserve: s.caught.filter(i => !s.party.includes(i)),
      team: s.team,
      badges: s.badges.length,
      level: window.mossvale.level(s.active),
      hp: s.team[s.active].hp,
      maxHp: window.mossvale.maxHP(s.active),
      potions: s.potions,
      orbs: s.orbs,
      wins: s.wins,
    };
  });
const dismissResults = async () => {
  while (await page.locator('#result-continue').isVisible()) {
    await page.click('#result-continue');
    await page.waitForTimeout(50);
    if (await page.locator('#story-ok').isVisible()) await page.click('#story-ok');
  }
};
/** Plays the open battle like a careful player: capture when weak (wild only), heal when low, guard before big hits. */
async function fightOut(wantCapture) {
  for (let i = 0; i < 160; i++) {
    if (await page.locator('#result-continue').isVisible()) return;
    const s = await state();
    if (s.phase === 'explore' && !s.battle) return;
    if (s.battle && !s.battle.busy) {
      const low = s.hp < s.maxHp * 0.4 && s.potions > 0;
      const intent = (await page.locator('.battle-intent').count()) ? await page.textContent('.battle-intent') : '';
      let key = '2';
      if (low) key = '4';
      else if (wantCapture && !s.battle.boss && s.battle.hp / s.battle.max <= 0.45 && s.orbs > 0) key = '3';
      else if (/heavy|bracing/.test(intent)) key = '5';
      else if (s.battle.focus < 1) key = '1';
      await page.keyboard.press(key);
    }
    await page.waitForTimeout(120);
  }
}
const rest = async () => {
  await page.evaluate(() => Object.assign(window.mossvale.getState().player, {x: 10.3, y: 10.4}));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.mossvale.interact());
  await page.click('#speech-next');
  await page.click('#rest-team');
  await page.click('#speech-next');
  await page.keyboard.press('Escape');
};

let guardianTries = 0;
for (let round = 0; round < 40 && (await state()).badges === 0; round++) {
  const s = await state();
  if (s.caught >= 2 && s.level >= 7 && guardianTries < 6) {
    guardianTries++;
    await rest();
    await page.evaluate(() => Object.assign(window.mossvale.getState().player, {x: 12, y: 6.4}));
    await page.waitForTimeout(400);
    await page.evaluate(() => window.mossvale.interact());
    await page.click('#challenge');
    await fightOut(false);
    await dismissResults();
  } else {
    await rest();
    await page.evaluate(id => window.mossvale.encounter(id), s.caught < 2 ? 1 : 2);
    await fightOut(s.caught < 2);
    await dismissResults();
  }
}
const end = await state();
assert.equal(end.badges, 1, `the meadow seal was earned through normal play (${JSON.stringify(end)}, ${guardianTries} guardian tries)`);
assert.ok(end.caught >= 2);
const gameplayEvents = await page.evaluate(() => window.mossvale.events());
for (const type of ['capture.attempted', 'capture.completed', 'reward.granted', 'audio.cue'])
  assert.ok(
    gameplayEvents.some(event => event.type === type),
    `local event stream records ${type}`,
  );

// Fill the three-member battle team and place another captured creature in reserve through real battle actions.
// The starter is random, so capture whichever creatures are still missing until both are true.
let stocked = await state();
for (const id of [3, 4, 5, 6, 7, 1, 2]) {
  if (stocked.party.length === 3 && stocked.reserve.length > 0) break;
  if (stocked.caughtIds.includes(id)) continue;
  await page.evaluate(id => window.mossvale.encounter(id), id);
  await fightOut(true);
  await dismissResults();
  stocked = await state();
}
assert.equal(stocked.party.length, 3);
assert.ok(stocked.reserve.length > 0);

// Choose a reserve companion, bench a teammate, then reload and confirm the collection and health records persist.
await page.click('#party');
await page.waitForSelector('[data-select]');
const selected = stocked.reserve[0];
await page.click(`[data-select="${selected}"]`);
await page.waitForFunction(id => window.mossvale.getState().save.active === id, selected);
let managed = await state();
assert.ok(managed.party.includes(selected));
assert.ok(!managed.reserve.includes(selected));
const benched = managed.party.find(i => i !== managed.active);
await page.click('#party');
await page.waitForSelector(`[data-bench="${benched}"]`);
await page.click(`[data-bench="${benched}"]`);
managed = await state();
assert.ok(managed.reserve.includes(benched));
assert.ok(managed.caughtIds.includes(benched));
const savedParty = managed.party;
const savedTeam = managed.team;
await page.reload();
await page.waitForSelector('#loading', {state: 'hidden'});
const restored = await state();
assert.deepEqual(restored.party, savedParty);
assert.deepEqual(restored.team, savedTeam);
assert.deepEqual(restored.caughtIds, managed.caughtIds);
assert.deepEqual(errors, []);
console.log(`ok party/reserve selection and persistence plus meadow guardian playthrough (level ${end.level}, ${guardianTries} tries)`);

// The same compact action script runs through pure domain rules and real browser controls, with no player teleport.
{
  const seed = 97;
  const initial = newSave();
  const friend = 1;
  initial.caught.push(friend);
  initial.seen.push(friend);
  initial.party.push(friend);
  initial.team[friend] = {xp: 0, hp: (await import('../dist/src/data/species.js')).species[friend].stats.hp};
  initial.met = true;
  const ctx = await browser.newContext();
  await ctx.addInitScript(
    `if (!localStorage.getItem('mossvale-v3')) localStorage.setItem('mossvale-v3', ${JSON.stringify(codec.serialize(initial))}); localStorage.setItem('mossvale-settings', '{"motion":"reduced"}')`,
  );
  const page = await ctx.newPage();
  const scriptErrors = [];
  page.on('pageerror', error => scriptErrors.push(error.message));
  const shotsDir = mkdtempSync(join(tmpdir(), 'mossvale-action-script-'));
  const screenshots = [];
  const capture = async label => {
    const path = join(shotsDir, `${label}.png`);
    const bytes = await page.screenshot({path});
    assert.ok(bytes.length > 0, `${label} screenshot is non-empty`);
    screenshots.push({label, path});
  };
  const state = () => page.evaluate(() => window.mossvale.getState());
  const walkTo = async target => {
    let held = [];
    let arrived = false;
    try {
      for (let frame = 0; frame < 500; frame++) {
        const player = (await state()).player;
        if (Math.hypot(player.x - target.x, player.y - target.y) < 0.3) {
          arrived = true;
          break;
        }
        const next = inputForWorldTarget(player, target).keys;
        for (const key of held.filter(key => !next.includes(key))) await page.keyboard.up(key);
        for (const key of next.filter(key => !held.includes(key))) await page.keyboard.down(key);
        held = next;
        await page.waitForTimeout(20);
      }
    } finally {
      for (const key of held) await page.keyboard.up(key);
    }
    assert.ok(arrived, `walk to ${JSON.stringify(target)} stopped at ${JSON.stringify((await state()).player)}`);
  };

  await page.goto(url + `?debug&seed=${seed}&clock=0`);
  await page.waitForSelector('#loading', {state: 'hidden'});
  await page.waitForFunction(() => window.mossvale.getState().world.map.id === 'meadow');
  let beforeReloadEvents = [];
  for (const action of rangerToShrineScript) {
    if (action.type === 'walk-to') {
      await walkTo(action.target);
      if (action.label === 'ranger-approach') await capture('01-ranger-approach');
      if (action.label === 'shrine-approach') await capture('02-shrine-approach');
    } else if (action.type === 'interact' && action.target === 'ranger') {
      await page.keyboard.press('e');
      await page.waitForSelector('#speech-bubble:not([hidden])');
    } else if (action.type === 'finish-dialogue') {
      await page.click('#speech-next');
      await page.waitForSelector('#speech-bubble[hidden]', {state: 'hidden'});
      await page.waitForSelector('#modal:not([hidden])');
      await page.keyboard.press('Escape');
      await page.waitForSelector('#modal[hidden]', {state: 'hidden'});
    } else if (action.type === 'advance-clock') {
      await page.evaluate(milliseconds => window.mossvale.advanceClock(milliseconds), action.milliseconds);
      await page.waitForFunction(tick => window.mossvale.getState().now >= tick, action.milliseconds);
    } else if (action.type === 'interact' && action.target === 'shrine') {
      await page.keyboard.press('e');
      try {
        await page.waitForSelector('#challenge', {timeout: 1500});
      } catch {
        const state = await page.evaluate(() => {
          const game = window.mossvale.getState();
          return {
            map: game.world.map.id,
            phase: game.phase,
            player: game.player,
            caught: game.save.caught,
            modal: document.querySelector('#modal')?.innerText,
            toast: document.querySelector('#toast')?.textContent,
            nearby: game.world.objects
              .map(object => ({ref: object.ref, kind: object.kind, distance: Math.hypot(object.x - game.player.x, object.y - game.player.y)}))
              .sort((a, b) => a.distance - b.distance)
              .slice(0, 4),
          };
        });
        throw new Error(`the shrine did not offer its challenge: ${JSON.stringify(state)}`);
      }
      await capture('03-shrine-challenge');
    } else if (action.type === 'challenge') {
      await page.click('#challenge');
      await page.waitForSelector('#guard');
      assert.equal((await state()).battle.boss, true);
    } else if (action.type === 'battle-action') {
      await page.keyboard.press('5');
      await page.waitForFunction(() => window.mossvale.getState().battle?.busy === false && window.mossvale.getState().battle?.turn === 1, null, {
        timeout: 12000,
      });
      beforeReloadEvents = await page.evaluate(() => window.mossvale.events());
      await capture('04-guardian-before-reload');
    } else if (action.type === 'interrupt-reload') {
      const before = await state();
      const checkpoint = JSON.parse(await page.evaluate(() => localStorage.getItem('mossvale-v3'))).battle;
      assert.equal(checkpoint.turn, 1, 'the current turn is already checkpointed before interruption');
      await page.reload();
      await page.waitForSelector('#loading', {state: 'hidden'});
      await page.waitForFunction(() => window.mossvale?.getState().world.map);
      await page.waitForTimeout(250);
      const after = await state();
      assert.ok(
        after.battle && (await page.locator('#guard').count()),
        `battle resumed with controls: ${JSON.stringify({phase: after.phase, mode: after.modalMode, battle: after.battle, saveBattle: after.save.battle, modal: await page.locator('#modal').innerText()})}`,
      );
      assert.equal(after.phase, 'battle');
      assert.deepEqual(
        [after.battle.id, after.battle.hp, after.battle.max, after.battle.turn, after.battle.focus],
        [before.battle.id, before.battle.hp, before.battle.max, before.battle.turn, before.battle.focus],
      );
      const resumedEvents = await page.evaluate(() => window.mossvale.events());
      assert.ok(resumedEvents.some(event => event.type === 'battle.resumed' && event.turn === 1));
      await capture('05-guardian-restored');
    }
  }

  const observed = beforeReloadEvents.filter(event =>
    ['interaction.used', 'dialogue.started', 'dialogue.line', 'dialogue.finished', 'challenge.started', 'turn.resolved'].includes(event.type),
  );
  assert.deepEqual(
    observed.map(event => event.type),
    ['interaction.used', 'dialogue.started', 'dialogue.line', 'dialogue.finished', 'interaction.used', 'challenge.started', 'turn.resolved'],
  );
  assert.ok(beforeReloadEvents.every(event => event.schema === 'mossvale.game-event' && event.version === 1 && event.id && Number.isFinite(event.tick)));
  assert.equal(new Set(beforeReloadEvents.map(event => event.id)).size, beforeReloadEvents.length, 'event ids are unique in this run');
  const domainTurn = runDomainActionScript(seed).events.find(event => event.type === 'turn.resolved');
  const browserTurn = observed.find(event => event.type === 'turn.resolved');
  assert.deepEqual(browserTurn.events, domainTurn.events, 'same seeded action resolves the same domain events in Node and Chromium');
  const turnIndex = beforeReloadEvents.indexOf(browserTurn);
  assert.ok(beforeReloadEvents.slice(turnIndex + 1).some(event => event.type === 'audio.cue' && event.cue === 'guard'));
  assert.ok(beforeReloadEvents.slice(turnIndex + 1).some(event => event.type === 'audio.cue' && event.cue === 'hurt'));
  assert.deepEqual(scriptErrors, []);
  assert.deepEqual(
    screenshots.map(shot => shot.label),
    ['01-ranger-approach', '02-shrine-approach', '03-shrine-challenge', '04-guardian-before-reload', '05-guardian-restored'],
  );
  console.log(
    `ok shared deterministic action script, event/state parity and interrupted-battle restore; labeled screenshots: ${screenshots.map(shot => shot.path).join(', ')}`,
  );
  await ctx.close();
}
await browser.close();
server.close();
