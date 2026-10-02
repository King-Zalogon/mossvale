import test from 'node:test';
import assert from 'node:assert/strict';
import {BRACE_FACTOR, DEFAULT_PATTERN, HEAVY_FACTOR, INTENT_TEXT, planOf, TACTICS} from '../dist/src/data/tactics.js';
import {battleCheckpoint, createBattle, enemyAttack, lastEnemyAction, nextEnemyAction, playerStrike, resolveTurn} from '../dist/src/domain/battle.js';
import {seededRng} from '../dist/src/domain/rng.js';
import {companion, healTeam, level, maxHP} from '../dist/src/domain/rules.js';
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

test('spore guard: bracing does no damage and halves the next attack, and the intent is shown one move ahead', () => {
  const save = newSave();
  save.team[0].hp = 1e6;
  const b = createBattle(save, seededRng(1), spec(0));
  assert.deepEqual([b.tactic, nextEnemyAction(b)], ['spore-guard', 'strike']);
  enemyAttack(save, b, mid);
  assert.equal(nextEnemyAction(b), 'brace');
  const brace = enemyAttack(save, b, mid);
  assert.deepEqual([brace.damage, brace.action, lastEnemyAction(b)], [0, 'brace', 'brace']);
  const braced = playerStrike(save, {...b, hp: 1e6}, 'attack', mid);
  b.turn++; // the enemy strikes again: no longer braced
  const open = playerStrike(save, {...b, hp: 1e6}, 'attack', mid);
  assert.equal(braced.braced, true);
  assert.equal(open.braced, false);
  assert.ok(Math.abs(braced.damage / open.damage - BRACE_FACTOR) < 0.2, `${braced.damage}/${open.damage}`);
});

test('rolling charge: a charge turn, then a heavy blow that Guard softens', () => {
  const save = newSave();
  save.team[0].hp = 1e6;
  const hit = guard => {
    const b = createBattle(save, seededRng(1), spec(1));
    b.turn = 2; // next is the heavy blow
    b.guard = guard;
    assert.equal(nextEnemyAction(b), 'heavy');
    return enemyAttack(save, b, mid).damage;
  };
  const plain = enemyAttack(save, {...createBattle(save, seededRng(1), spec(1)), turn: 0}, mid).damage;
  const heavy = hit(false);
  assert.ok(heavy > plain * (HEAVY_FACTOR - 0.3), `heavy ${heavy} vs strike ${plain}`);
  assert.ok(hit(true) < heavy / 2, 'Guard cuts the heavy blow');
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

// --- more than one sensible way to win -------------------------------------------------------------------------
const policies = {
  // Spend Focus on the elemental move whenever possible; drink a potion when low.
  burst: (save, b) =>
    companion(save).hp < maxHP(save, save.active) * 0.35 && save.potions > 0 ? {kind: 'potion'} : {kind: b.focus >= 1 ? 'element' : 'attack'},
  // Read the intent: Guard before a heavy blow or while the foe braces, otherwise attack; heal when low.
  careful: (save, b) => {
    const next = nextEnemyAction(b);
    if (companion(save).hp < maxHP(save, save.active) * 0.4 && save.potions > 0) return {kind: 'potion'};
    if (next === 'heavy' || next === 'brace') return {kind: 'guard'};
    return {kind: b.focus >= 1 ? 'element' : 'attack'};
  },
  // Slow and steady: strike, guard when hurt, heal early.
  steady: save => {
    if (companion(save).hp < maxHP(save, save.active) * 0.55 && save.potions > 0) return {kind: 'potion'};
    if (companion(save).hp < maxHP(save, save.active) * 0.45) return {kind: 'guard'};
    return {kind: 'attack'};
  },
};

function challenge(region, policy, seed, companionLevel) {
  const save = newSave();
  save.team[0].xp = (companionLevel - 5) * 45;
  save.potions = 3;
  healTeam(save);
  const rng = seededRng(seed);
  const b = createBattle(save, rng, spec(region));
  for (let turns = 0; turns < 80 && !b.over; turns++) {
    const t = resolveTurn(save, b, policy(save, b), rng, {sealReward: shrineOf(region).reward});
    if (t?.ended) return t.ended;
    if (!t) return 'stalled';
  }
  return 'stalled';
}

test('every guardian can be beaten more than one sensible way, and mindless striking is not enough', () => {
  const tries = 30;
  const report = [];
  let mindlessFailures = 0;
  for (let region = 0; region < maps.length; region++) {
    const arrivalLevel = guardian(region).level - 1; // typically one level under when you first arrive; retries are free
    const rates = {};
    for (const [name, policy] of Object.entries(policies)) {
      let wins = 0;
      for (let seed = 1; seed <= tries; seed++) if (challenge(region, policy, seed, arrivalLevel) === 'win') wins++;
      rates[name] = wins / tries;
      report.push(`${maps[region].id}/${name}: ${wins}/${tries}`);
    }
    const sensible = [rates.burst, rates.careful].filter(r => r >= 0.4).length;
    assert.ok(sensible >= 2, `${maps[region].id}: burst ${rates.burst}, careful ${rates.careful} at level ${arrivalLevel}`);
    assert.ok(Math.min(...Object.values(rates)) < 1, `${maps[region].id} is trivial: every policy always wins`);
    if (rates.steady < 0.4) mindlessFailures++;
  }
  assert.ok(mindlessFailures >= 2, 'at least two challenges must demand more than plain striking');
  console.log(`guardian win rates (30 tries each, level = guardian level - 1): ${report.join('  ')}`);
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
