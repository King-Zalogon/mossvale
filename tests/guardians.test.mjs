import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PATTERN, HEAVY_FACTOR, INTENT_TEXT, planOf, TACTICS} from '../dist/src/data/tactics.js';
import {
  battleCheckpoint,
  createBattle,
  enemyAttack,
  guardianLevel,
  lastEnemyAction,
  nextEnemyAction,
  playerStrike,
  resolveTurn,
} from '../dist/src/domain/battle.js';
import {seededRng} from '../dist/src/domain/rng.js';
import {companion, effectiveness, healTeam, level, maxHP} from '../dist/src/domain/rules.js';
import {buildAdventure} from '../dist/src/domain/adventure.js';
import {codec, content, maps, newSave, rawMaps, rawObjectives} from './helpers.mjs';

const shrineOf = i => maps[i].objects.find(o => o.kind === 'shrine');
const guardian = i => shrineOf(i).guardian;
const spec = i => ({...guardian(i), boss: true});
const mid = () => 0.5;

test('each region has its own tactic, and all of them are defined', () => {
  const tactics = maps.map((_, i) => guardian(i).tactic);
  assert.equal(new Set(tactics).size, maps.length);
  for (const t of tactics) assert.ok(TACTICS[t], t);
  for (const a of Object.values(TACTICS).flatMap(t => t.pattern)) assert.ok(INTENT_TEXT[a], `no intent text for ${a}`);
  assert.deepEqual(planOf(undefined), DEFAULT_PATTERN); // wild creatures
});

test('wild creatures keep the simple strike/element rhythm and never carry a tactic', () => {
  const save = newSave();
  const wild = createBattle(save, seededRng(1), {id: 1, level: 6, tactic: 'spore-guard'});
  assert.equal(wild.tactic, undefined);
  const seen = [];
  for (let i = 0; i < 4; i++) {
    seen.push(nextEnemyAction(wild));
    enemyAttack(save, wild, mid);
  }
  assert.deepEqual(seen, ['strike', 'element', 'strike', 'element']);
});

test('spore guard: bracing punishes quick strikes but an elemental move breaks through', () => {
  const save = newSave();
  save.team[0].hp = 1e6;
  const b = createBattle(save, seededRng(1), spec(0));
  assert.deepEqual([b.tactic, nextEnemyAction(b)], ['spore-guard', 'strike']);
  enemyAttack(save, b, mid);
  assert.equal(nextEnemyAction(b), 'brace');
  const brace = enemyAttack(save, b, mid);
  assert.deepEqual([brace.damage, brace.action, lastEnemyAction(b)], [0, 'brace', 'brace']);
  const braced = playerStrike(save, {...b, hp: 1e6}, 'attack', mid);
  const element = playerStrike(save, {...b, hp: 1e6}, 'element', mid);
  b.turn++; // the enemy strikes again: no longer braced
  const open = playerStrike(save, {...b, hp: 1e6}, 'attack', mid);
  assert.equal(braced.braced, true);
  assert.equal(open.braced, false);
  assert.ok(Math.abs(braced.damage / open.damage - TACTICS['spore-guard'].braceQuickFactor) < 0.2, `${braced.damage}/${open.damage}`);
  assert.equal(element.brokeBrace, true);
  assert.ok(element.damage > braced.damage * 3, `${element.damage}/${braced.damage}`);
  assert.match(TACTICS['spore-guard'].intro, /After the brace, quick strikes glance off/);
  assert.match(INTENT_TEXT.brace, /after this will be halved/);
});

test('rolling charge: a charge turn, then a heavy blow that Guard softens', () => {
  const save = newSave();
  save.team[0].hp = 1e6;
  const hit = guard => {
    const b = createBattle(save, seededRng(1), spec(1));
    b.turn = 2; // next is the heavy blow
    b.guard = guard;
    assert.equal(nextEnemyAction(b), 'heavy');
    return {b, hit: enemyAttack(save, b, mid)};
  };
  const plain = enemyAttack(save, {...createBattle(save, seededRng(1), spec(1)), turn: 0}, mid).damage;
  const heavy = hit(false).hit.damage;
  assert.ok(heavy > plain * (HEAVY_FACTOR - 0.3), `heavy ${heavy} vs strike ${plain}`);
  const guarded = hit(true);
  assert.ok(guarded.hit.damage < heavy / 2, 'Guard cuts the heavy blow');
  assert.ok(guarded.hit.counter > 0, 'the timed Guard ripostes');
  assert.ok(guarded.b.hp < createBattle(save, seededRng(1), spec(1)).hp, 'the riposte damages the guardian');
  const charge = enemyAttack(save, {...createBattle(save, seededRng(1), spec(1)), turn: 1}, mid);
  assert.deepEqual([charge.action, charge.damage], ['charge', 0]);
});

test('frost chorus keeps using the elemental move, so the matchup decides the damage', () => {
  const save = newSave();
  save.team[0].hp = 1e6;
  const b = createBattle(save, seededRng(1), spec(2));
  const rounds = [0, 1, 2].map(() => enemyAttack(save, b, mid));
  assert.deepEqual(
    rounds.map(r => r.action),
    ['element', 'element', 'strike'],
  );
  assert.ok(rounds[1].damage > rounds[0].damage, 'the second elemental volley is stronger');
});

test('the tidal lull restores guardian health, and shrine scaling leaves wild encounters alone', () => {
  const save = newSave();
  save.party = [0, 1, 2];
  save.caught = [0, 1, 2];
  save.team[1] = {xp: 5 * 45, hp: 50};
  save.team[2] = {xp: 5 * 45, hp: 50};
  save.team[0].xp = 10 * 45;
  const tidal = {...spec(3), level: guardianLevel(save, guardian(3))};
  assert.equal(tidal.level, guardian(3).level);
  assert.equal(guardianLevel(save, {...guardian(0), level: 4}), 12);
  const scaledBoss = createBattle(save, seededRng(1), {...guardian(0), level: guardianLevel(save, guardian(0)), boss: true});
  save.battle = battleCheckpoint(scaledBoss);
  const restored = codec.normalize(JSON.parse(codec.serialize(save)), false).battle;
  assert.equal(restored.level, 12, 'the already-scaled guardian level survives a reload');
  const wild = createBattle(save, seededRng(1), {id: 9, level: 6});
  assert.equal(wild.level, 6);
  assert.equal(wild.tactic, undefined);

  const b = createBattle(save, seededRng(1), spec(3));
  b.turn = 1; // the tidal current is gathering strength
  b.hp -= 10;
  const before = b.hp;
  const result = resolveTurn(save, b, {kind: 'guard'}, mid);
  const charge = result.events.find(event => event.type === 'enemy');
  assert.equal(charge.action, 'charge');
  assert.equal(charge.recovered, Math.min(10, Math.ceil(b.max * TACTICS['tidal-current'].recoveryOnCharge)));
  assert.equal(b.hp, before + charge.recovered);

  const pressured = createBattle(save, seededRng(1), spec(3));
  pressured.turn = 1;
  pressured.focus = 2;
  pressured.hp -= 10;
  const pressure = resolveTurn(save, pressured, {kind: 'element'}, mid);
  const disrupted = pressure.events.find(event => event.type === 'enemy');
  assert.equal(disrupted.action, 'charge');
  assert.equal(disrupted.interrupted, true);
  assert.equal(disrupted.recovered, 0, 'an elemental hit during the forecast charge cancels its recovery');
  assert.equal(
    pressured.hp,
    pressured.max - 10 - pressure.events.find(event => event.type === 'strike').damage,
    'the cancelled recovery does not restore guardian health',
  );
});

test('a guardian tactic survives a refresh through the battle checkpoint', () => {
  const save = newSave();
  const b = createBattle(save, seededRng(1), spec(1));
  b.turn = 2;
  save.battle = battleCheckpoint(b);
  const back = codec.normalize(JSON.parse(codec.serialize(save)), false).battle;
  assert.deepEqual([back.tactic, back.turn], ['rolling-charge', 2]);
  assert.equal(nextEnemyAction(back), 'heavy');
  const raw = JSON.parse(codec.serialize(save));
  assert.equal(codec.normalize({...raw, battle: {...raw.battle, tactic: 'toString'}}, false).battle.tactic, undefined);
  assert.equal(codec.normalize({...raw, battle: {...raw.battle, boss: false}}, false).battle.tactic, undefined);
});

test('an unknown tactic in map data is reported', () => {
  const m = rawMaps();
  m[0].landmarks.find(l => l.kind === 'shrine').guardian.tactic = 'sneeze';
  assert.ok(buildAdventure(m, content, rawObjectives()).errors.some(e => e.includes('unknown tactic "sneeze"')));
});

// --- tactical guardian play across ordinary and advanced saves -----------------------------------------------
const policies = {
  attackOnly: () => ({kind: 'attack'}),
  burst: (save, b) =>
    companion(save).hp < maxHP(save, save.active) * 0.35 && save.potions > 0 ? {kind: 'potion'} : {kind: b.focus >= 1 ? 'element' : 'attack'},
  responsive: (save, b) => {
    const next = nextEnemyAction(b);
    if (companion(save).hp < maxHP(save, save.active) * 0.35 && save.potions > 0) return {kind: 'potion'};
    if (next === 'heavy') return {kind: 'guard'};
    if (lastEnemyAction(b) === 'brace' && b.focus >= 1) return {kind: 'element'};
    if (next === 'element') {
      const resistant = save.party.filter(id => save.team[id].hp > 0).sort((a, c) => effectiveness(b.id, a) - effectiveness(b.id, c))[0];
      if (resistant !== undefined && resistant !== save.active && effectiveness(b.id, resistant) < effectiveness(b.id, save.active))
        return {kind: 'switch', id: resistant};
    }
    return {kind: b.focus >= 1 ? 'element' : 'attack'};
  },
};

function preparedTeam(levels) {
  const save = newSave();
  save.party = [0, 1, 2];
  save.caught = [0, 1, 2];
  save.seen = [0, 1, 2];
  for (const id of save.party) save.team[id] = {xp: (levels[id] - 5) * 45, hp: 1};
  save.active = 0;
  save.potions = 3;
  healTeam(save);
  return save;
}

function challenge(region, policy, seed, levels) {
  const save = preparedTeam(levels);
  const rng = seededRng(seed);
  const shrine = shrineOf(region);
  const config = guardian(region);
  const b = createBattle(save, rng, {...config, level: guardianLevel(save, config), boss: true});
  const stats = {result: 'stalled', damageTaken: 0, counterDamage: 0, recovered: 0, potionsUsed: 0, switches: 0};
  for (let turns = 0; turns < 80 && !b.over; turns++) {
    const action = policy(save, b);
    if (action.kind === 'potion') stats.potionsUsed++;
    if (action.kind === 'switch') stats.switches++;
    const t = resolveTurn(save, b, action, rng, {sealReward: shrine.reward});
    if (!t) return stats;
    for (const event of t.events)
      if (event.type === 'enemy') {
        stats.damageTaken += event.damage;
        stats.counterDamage += event.counter;
        stats.recovered += event.recovered;
      }
    if (t.ended) {
      stats.result = t.ended;
      break;
    }
  }
  return stats;
}

test('all four guardians reward their distinct tactic while burst and matchup play remain viable', () => {
  const tries = 50;
  const report = [];
  const average = rows => rows.reduce((sum, row) => sum + row.damageTaken, 0) / rows.length;
  for (let region = 0; region < maps.length; region++) {
    const arrival = Math.max(5, guardian(region).level - 1);
    const profiles = {arrival: [arrival, arrival, arrival], 'advanced starter': [15, 10, 10]};
    for (const [profile, levels] of Object.entries(profiles)) {
      const outcomes = Object.fromEntries(
        Object.entries(policies).map(([name, policy]) => [name, Array.from({length: tries}, (_, i) => challenge(region, policy, i + 1, levels))]),
      );
      for (const name of ['burst', 'responsive']) {
        const wins = outcomes[name].filter(row => row.result === 'win').length;
        report.push(`${profile}/${maps[region].id}/${name}: ${wins}/${tries}`);
        assert.ok(wins >= tries * 0.9, `${profile}/${maps[region].id}/${name}: ${wins}/${tries}`);
      }
      const attackWins = outcomes.attackOnly.filter(row => row.result === 'win').length;
      report.push(
        `${profile}/${maps[region].id}: attack ${attackWins}/${tries} · burst ${outcomes.burst.filter(row => row.result === 'win').length}/${tries} · responsive ${outcomes.responsive.filter(row => row.result === 'win').length}/${tries} · damage ${average(outcomes.attackOnly).toFixed(1)}→${average(outcomes.responsive).toFixed(1)}`,
      );
      if (profile === 'advanced starter') {
        const lessDamage = average(outcomes.responsive) <= average(outcomes.attackOnly) * 0.8;
        assert.ok(lessDamage, `${maps[region].id}: responsive average damage ${average(outcomes.responsive)} vs attack-only ${average(outcomes.attackOnly)}`);
      }
      if (profile === 'arrival' && region === 1)
        assert.ok(
          outcomes.responsive.some(row => row.counterDamage > 0),
          'Amber Ridge rewards Guard timing',
        );
      if (profile === 'arrival' && region === 2)
        assert.ok(
          outcomes.responsive.some(row => row.switches > 0),
          'Frostveil rewards switching to a resistant teammate',
        );
    }
  }
  console.log(`guardian win rates (50 deterministic seeds per policy, two team profiles): ${report.join('  ')}`);
});

test('losing a guardian fight neither blocks progress nor pays a reward', () => {
  const save = newSave();
  save.team[0].hp = 1;
  const b = createBattle(save, seededRng(1), spec(0));
  const coins = save.coins;
  const t = resolveTurn(save, b, {kind: 'guard'}, () => 0.99);
  assert.equal(t.ended, 'loss');
  assert.deepEqual([save.badges, save.coins, level(save, 0)], [[], coins, 5]);
  assert.equal(save.team[0].hp, maxHP(save, 0)); // healed, free to try again
});
