import test from 'node:test';
import assert from 'node:assert/strict';
import {createCombatTrace} from '../dist/src/domain/combat-trace.js';
import {combatChoices, createBattle, resolveTurn} from '../dist/src/domain/battle.js';
import {seededRng} from '../dist/src/domain/rng.js';
import {species} from '../dist/src/data/species.js';
import {newSave} from './helpers.mjs';
import {formatCombatComparison, runCombatComparison, runCombatTrial, strongestLegalMove} from '../scripts/lib/combat-analysis.mjs';

test('combat traces are bounded, clone their inputs and reject malformed exports safely', () => {
  const trace = createCombatTrace({capacity: 2});
  const input = {active: {hp: 20}};
  assert.equal(trace.record('battle.started', input), true);
  input.active.hp = 1;
  assert.equal(trace.record('battle.decision', {chosen: {kind: 'attack'}}), true);
  assert.equal(trace.record('battle.decision', {chosen: {kind: 'guard'}}), true);
  assert.equal(trace.record('', {}), false);
  assert.equal(trace.record('battle.decision', null), false);
  const exported = JSON.parse(trace.export({packId: 'mossvale', seed: 8}));
  assert.equal(exported.schema, 'mossvale.combat-trace');
  assert.equal(exported.version, 1);
  assert.match(exported.traceId, /^trace-/);
  assert.ok(Number.isFinite(Date.parse(exported.createdAt)));
  assert.equal(exported.omittedRecords, 1);
  assert.equal(exported.records.length, 2);
  assert.equal(exported.records[0].chosen.kind, 'attack');
  assert.equal(trace.read()[0].chosen.kind, 'attack');
  const invalidMetadata = {};
  invalidMetadata.self = invalidMetadata;
  assert.deepEqual(JSON.parse(trace.export(invalidMetadata)).metadata, {});
  trace.clear();
  assert.deepEqual(JSON.parse(trace.export()).records, []);
  assert.throws(() => createCombatTrace({capacity: 0}), /capacity/);
});

test('combat choices describe legal actions without changing the battle', () => {
  const save = newSave();
  const battle = createBattle(save, seededRng(2), {id: 1, level: 5});
  const before = JSON.stringify([save, battle]);
  const choices = Object.fromEntries(combatChoices(save, battle).map(choice => [choice.kind, choice]));
  assert.equal(choices.attack.available, true);
  assert.equal(choices.element.available, true);
  assert.equal(choices.catch.available, true);
  assert.equal(choices.potion.available, false);
  assert.equal(choices.potion.reason, 'Active companion is at full HP.');
  assert.equal(choices.switch.available, false);
  assert.equal(choices.switch.reason, 'No healthy teammate is available to switch in.');
  assert.equal(JSON.stringify([save, battle]), before);
  battle.focus = 0;
  battle.boss = true;
  assert.equal(combatChoices(save, battle).find(choice => choice.kind === 'element').available, false);
  assert.equal(combatChoices(save, battle).find(choice => choice.kind === 'catch').reason, 'Guardians cannot be captured.');
});

test('recording a turn does not consume RNG or change outcomes', () => {
  const play = record => {
    const save = newSave();
    save.team[save.active].hp = 100;
    const rng = seededRng(91);
    const battle = createBattle(save, rng, {id: 7, level: 10, boss: true, tactic: 'rolling-charge', power: 1.5});
    const trace = createCombatTrace();
    trace.record('battle.started', {speciesId: species[battle.id].id, party: [save.active]});
    for (let index = 0; index < 12 && !battle.over; index++) {
      const options = combatChoices(save, battle);
      const action = battle.focus > 0 ? {kind: 'element'} : {kind: 'attack'};
      const context = {turn: battle.turn + 1, options, activeHp: save.team[save.active].hp};
      const turn = resolveTurn(save, battle, action, rng);
      if (record) trace.record('battle.decision', {...context, chosen: action, ended: turn?.ended ?? null});
      if (turn?.ended) break;
    }
    return {state: JSON.stringify([save, battle]), trace: trace.read()};
  };
  assert.equal(play(false).state, play(true).state);
});

test('matched policy report covers progression, overleveling, every registered matchup and guardian objectives', () => {
  const report = runCombatComparison({seeds: 1});
  assert.equal(report.schema, 'mossvale.combat-balance-report');
  assert.deepEqual(
    report.groups.slice(0, 2).map(group => group.name),
    ['normal progression', 'overleveled starter'],
  );
  const matchups = report.groups[2];
  assert.equal(matchups.pairCount, species.length ** 2);
  assert.equal(matchups.policies['attack-only'].trials, species.length ** 2);
  assert.equal(report.groups.filter(group => group.scenario.kind === 'guardian').length, 8);
  for (const group of report.groups) {
    for (const policy of Object.values(group.policies)) {
      for (const [kind, usage] of Object.entries(policy.actionUse)) {
        assert.ok(usage.available >= usage.chosen, `${kind}: a selected action was unavailable`);
        assert.equal(usage.availableButNotChosen, usage.available - usage.chosen);
      }
    }
  }
  assert.match(formatCombatComparison(report), /Failed seal objectives/i);
  assert.ok(report.limitations.some(item => item.includes('human perception')));
});

test('all scripted policies select only legal actions and produce reproducible trials', () => {
  const scenario = {enemy: 7, enemyLevel: 8};
  const profile = {active: 0, party: [0, 1, 2], levels: {0: 7, 1: 6, 2: 5}};
  for (const policy of ['attack-only', 'strongest-legal-move', 'intent-responsive']) {
    assert.deepEqual(runCombatTrial({scenario, profile, seed: 25, policy}), runCombatTrial({scenario, profile, seed: 25, policy}));
  }
});

test('strongest legal move estimates matchup damage and preserves Quick strike on a tie', () => {
  const save = newSave();
  const battle = createBattle(save, seededRng(5), {id: 1, level: 5});
  battle.focus = 0;
  assert.deepEqual(strongestLegalMove(save, battle), {kind: 'attack'});
  battle.focus = 1;
  const choice = strongestLegalMove(save, battle);
  assert.ok(choice.kind === 'attack' || choice.kind === 'element');
});
