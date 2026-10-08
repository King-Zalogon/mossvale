import {readFileSync} from 'node:fs';
import {create} from '../../dist/src/save.js';
import {seededRng} from '../../dist/src/domain/rng.js';
import {combatChoices, createBattle, guardianForecast, guardianLevel, playerStrike, resolveTurn} from '../../dist/src/domain/battle.js';
import {companion, effectiveness, healTeam, maxHP} from '../../dist/src/domain/rules.js';
import {species} from '../../dist/src/data/species.js';
import {regions} from '../../dist/src/data/regions.js';
import {PACK_ID} from '../../dist/src/data/pack.js';
import pack from '../../dist/maps/index.json' with {type: 'json'};

const packRoot = new URL('../../dist/maps/', import.meta.url);
const readJson = path => JSON.parse(readFileSync(new URL(path, packRoot), 'utf8'));
const mapData = pack.maps.map(id => readJson(`${id}.json`));
const codec = create({species, regions, size: 128, pack: PACK_ID});
export function strongestLegalMove(save, battle) {
  if (battle.focus <= 0) return {kind: 'attack'};
  const expectedDamage = kind => {
    const samples = 32;
    let total = 0;
    for (let index = 0; index < samples; index++) {
      const copy = structuredClone(battle);
      total += playerStrike(save, copy, kind, () => (index + 0.5) / samples).damage;
    }
    return total / samples;
  };
  return expectedDamage('element') > expectedDamage('attack') ? {kind: 'element'} : {kind: 'attack'};
}

const policySet = {
  'attack-only': () => ({kind: 'attack'}),
  'strongest-legal-move': strongestLegalMove,
  'intent-responsive': (save, battle, forecast) => {
    const active = companion(save);
    if (active.hp < maxHP(save, save.active) * 0.35 && save.potions > 0) return {kind: 'potion'};
    if (forecast?.action === 'heavy') return {kind: 'guard'};
    if (forecast?.action === 'charge' && forecast.charge?.interruptAvailable) return {kind: 'element'};
    if (forecast?.responses?.some(response => response.available && response.action === 'element' && response.previous === 'brace') && battle.focus > 0)
      return {kind: 'element'};
    const switchResponse = forecast?.responses?.find(response => response.available && response.action === 'switch');
    const switchTarget = switchResponse?.targetIds?.[0];
    if (Number.isInteger(switchTarget)) return {kind: 'switch', id: switchTarget};
    return strongestLegalMove(save, battle);
  },
};

const mean = values => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
function makeSave(activeId, partyIds, partyLevels, regionIndex) {
  const save = codec.fresh(() => activeId / Math.max(1, species.length));
  const ids = [...new Set([activeId, ...partyIds])].slice(0, 3);
  save.caught = [...ids];
  save.party = [...ids];
  save.active = activeId;
  save.region = regionIndex;
  save.team = Object.fromEntries(ids.map(id => [id, {xp: Math.max(0, partyLevels[id] - 5) * 45, hp: 0}]));
  save.potions = 3;
  save.orbs = 12;
  healTeam(save);
  return save;
}

function setup(profile, scenario, seed) {
  const save = makeSave(profile.active, profile.party, profile.levels, scenario.region ?? 0);
  const rng = seededRng(seed);
  const id = scenario.enemy;
  const levelValue = scenario.boss ? guardianLevel(save, scenario.guardian) : scenario.enemyLevel;
  const battle = createBattle(save, rng, {
    id,
    level: levelValue,
    boss: scenario.boss,
    tactic: scenario.guardian?.tactic,
    power: scenario.guardian?.power,
  });
  return {save, rng, battle};
}

export function runCombatTrial({scenario, profile, seed, policy = 'attack-only', maxTurns = 80}) {
  const choose = typeof policy === 'function' ? policy : policySet[policy];
  if (!choose) throw new Error(`Unknown combat policy: ${policy}`);
  const {save, rng, battle} = setup(profile, scenario, seed >>> 0);
  const stats = {
    result: 'stalled',
    turns: 0,
    damageReceived: 0,
    counterDamage: 0,
    healing: 0,
    potionsUsed: 0,
    switches: 0,
    responseWindows: 0,
    responsesUsed: 0,
    availableTurns: Object.create(null),
    chosenActions: Object.create(null),
    coins: 0,
    xp: 0,
    failedProgressionObjective: scenario.boss ? true : null,
  };
  for (let step = 0; step < maxTurns && !battle.over; step++) {
    const forecast = guardianForecast(save, battle);
    const choices = combatChoices(save, battle);
    for (const choice of choices) stats.availableTurns[choice.kind] = (stats.availableTurns[choice.kind] ?? 0) + Number(choice.available);
    const action = choose(save, battle, forecast, choices);
    if (!action || !choices.some(choice => choice.kind === action.kind && choice.available))
      throw new Error(`${policy} selected an unavailable ${action?.kind ?? 'undefined'} action`);
    stats.turns++;
    stats.chosenActions[action.kind] = (stats.chosenActions[action.kind] ?? 0) + 1;
    stats.potionsUsed += Number(action.kind === 'potion');
    stats.switches += Number(action.kind === 'switch');
    const responseWindows = forecast?.responses?.filter(response => response.available) ?? [];
    stats.responseWindows += responseWindows.length;
    if (
      responseWindows.some(
        response => response.action === action.kind && (response.action !== 'switch' || response.targetIds?.includes(species[action.id]?.id)),
      )
    )
      stats.responsesUsed++;
    const turn = resolveTurn(save, battle, action, rng);
    if (!turn)
      throw new Error(
        `${policy} selected an action rejected by the battle resolver: ${JSON.stringify({scenario: scenario.boss ? scenario.guardian.tactic : scenario.enemy, seed, action, hp: companion(save).hp, potions: save.potions, focus: battle.focus, choices})}`,
      );
    for (const event of turn.events) {
      if (event.type === 'enemy') {
        stats.damageReceived += event.damage;
        stats.counterDamage += event.counter;
        stats.healing += event.recovered;
      }
      if (event.type === 'potion') stats.healing += event.healed;
      if (event.type === 'win') {
        stats.coins += event.reward;
        stats.xp += event.xp;
      }
    }
    if (turn.ended) {
      stats.result = turn.ended;
      stats.failedProgressionObjective = scenario.boss ? turn.ended !== 'win' : null;
      break;
    }
  }
  return stats;
}

const makeProfile = (active, levels, withBackups = true) => {
  const party = withBackups
    ? [
        active,
        ...species
          .map((_, id) => id)
          .filter(id => id !== active)
          .slice(0, 2),
      ]
    : [active];
  return {active, party, levels: Object.fromEntries(party.map(id => [id, levels[id] ?? 5]))};
};

function summarize(name, trials) {
  const numeric = field => mean(trials.map(trial => trial[field] ?? 0));
  const results = Object.fromEntries(['win', 'caught', 'loss', 'stalled'].map(result => [result, trials.filter(trial => trial.result === result).length]));
  const actions = [...new Set(trials.flatMap(trial => [...Object.keys(trial.chosenActions)]))].sort();
  return {
    name,
    trials: trials.length,
    results,
    winRate: trials.length ? results.win / trials.length : 0,
    meanTurns: numeric('turns'),
    meanDamageReceived: numeric('damageReceived'),
    meanCounterDamage: numeric('counterDamage'),
    meanHealing: numeric('healing'),
    meanPotions: numeric('potionsUsed'),
    meanSwitches: numeric('switches'),
    meanResponseWindows: numeric('responseWindows'),
    meanResponsesUsed: numeric('responsesUsed'),
    failedProgressionObjectives: trials.filter(trial => trial.failedProgressionObjective === true).length,
    progressionObjectiveTrials: trials.filter(trial => trial.failedProgressionObjective !== null).length,
    meanCoins: numeric('coins'),
    meanXp: numeric('xp'),
    actions: Object.fromEntries(actions.map(kind => [kind, trials.reduce((total, trial) => total + (trial.chosenActions[kind] ?? 0), 0)])),
    actionUse: Object.fromEntries(
      [...new Set([...actions, ...trials.flatMap(trial => Object.keys(trial.availableTurns))])].sort().map(kind => {
        const available = trials.reduce((total, trial) => total + (trial.availableTurns[kind] ?? 0), 0);
        const chosen = trials.reduce((total, trial) => total + (trial.chosenActions[kind] ?? 0), 0);
        return [kind, {available, chosen, availableButNotChosen: Math.max(0, available - chosen)}];
      }),
    ),
    availability: Object.fromEntries(
      [...new Set(trials.flatMap(trial => Object.keys(trial.availableTurns)))]
        .sort()
        .map(kind => [kind, trials.reduce((total, trial) => total + (trial.availableTurns[kind] ?? 0), 0)]),
    ),
  };
}

function runGroup(name, scenario, profileFactory, seeds, policyNames = Object.keys(policySet)) {
  const byPolicy = Object.fromEntries(
    policyNames.map(policy => [
      policy,
      summarize(
        name,
        seeds.map(seed => runCombatTrial({scenario, profile: profileFactory(), seed, policy})),
      ),
    ]),
  );
  return {
    name,
    scenario: {
      kind: scenario.boss ? 'guardian' : 'wild',
      enemy: species[scenario.enemy].id,
      level: scenario.boss ? scenario.guardian.level : scenario.enemyLevel,
      tactic: scenario.guardian?.tactic ?? null,
    },
    policies: byPolicy,
  };
}

export function runCombatComparison({seeds = 50} = {}) {
  if (!Number.isInteger(seeds) || seeds < 1 || seeds > 1000) throw new RangeError('seeds must be 1..1000');
  const seedList = Array.from({length: seeds}, (_, index) => index + 1);
  const starter = 0;
  const normal = runGroup('normal progression', {enemy: 1, enemyLevel: 5}, () => makeProfile(starter, {0: 5, 1: 5, 2: 5}), seedList);
  const overleveled = runGroup('overleveled starter', {enemy: 7, enemyLevel: 12}, () => makeProfile(starter, {0: 15, 1: 5, 2: 5}), seedList);

  const matchupTrials = Object.fromEntries(Object.keys(policySet).map(policy => [policy, []]));
  for (const attacker of species.keys()) {
    for (const defender of species.keys()) {
      const profile = () => makeProfile(attacker, {[attacker]: 8}, false);
      const scenario = {enemy: defender, enemyLevel: 8};
      const category = effectiveness(attacker, defender);
      for (const policy of Object.keys(policySet)) {
        for (const seed of seedList) {
          const trial = runCombatTrial({scenario, profile: profile(), seed, policy});
          matchupTrials[policy].push({...trial, matchup: category});
        }
      }
    }
  }
  const matchups = {
    name: 'all registered elemental matchups',
    scenario: {kind: 'matchup-matrix', level: 8},
    pairCount: species.length ** 2,
    categories: {weak: 0.65, neutral: 1, strong: 1.6},
    policies: Object.fromEntries(
      Object.entries(matchupTrials).map(([policy, trials]) => [
        policy,
        {
          ...summarize('all registered elemental matchups', trials),
          byEffectiveness: Object.fromEntries(
            [0.65, 1, 1.6].map(multiplier => [
              multiplier,
              summarize(
                `effectiveness ${multiplier}`,
                trials.filter(trial => trial.matchup === multiplier),
              ),
            ]),
          ),
        },
      ]),
    ),
  };

  const guardians = [];
  for (let region = 0; region < regions.length; region++) {
    const map = mapData.find(candidate => candidate.id === regions[region].id) ?? mapData.find(candidate => candidate.biome === regions[region].biome);
    const guardian = map.landmarks.find(landmark => landmark.kind === 'shrine').guardian;
    const scenario = {boss: true, enemy: species.findIndex(entry => entry.id === guardian.species), guardian, region};
    for (const profileName of ['normal progression', 'overleveled starter']) {
      const arrivalLevel = Math.max(5, guardian.level - 1);
      const profileFactory =
        profileName === 'normal progression'
          ? () => makeProfile(starter, {0: arrivalLevel, 1: arrivalLevel, 2: arrivalLevel})
          : () => makeProfile(starter, {0: 15, 1: 5, 2: 5});
      guardians.push(runGroup(`${profileName} · ${map.id}`, scenario, profileFactory, seedList));
    }
  }
  return {
    schema: 'mossvale.combat-balance-report',
    version: 1,
    pack: PACK_ID,
    seedRange: [1, seeds],
    policyDefinitions: {
      'attack-only': 'Always use Quick strike; serves as the baseline.',
      'strongest-legal-move':
        'Estimate Quick strike and elemental damage across 32 evenly spaced random rolls; choose the higher-damage legal move, preferring Quick strike on ties.',
      'intent-responsive':
        'Also heal below 35% HP, Guard forecast heavy attacks, use a Focus interrupt against a forecast charge, break an already-active brace, and switch only into a configured resistant counterplay target.',
    },
    metrics: [
      'outcomes',
      'turns',
      'damage received',
      'counter damage',
      'healing and potions',
      'switches',
      'available response windows and responses used',
      'coins',
      'XP',
      'failed guardian seal objectives',
    ],
    limitations: [
      'Synthetic policies do not model human perception, experimentation, enjoyment, party-building or move preference.',
      'Matched policies begin from the same generated profile and seed; their random streams diverge naturally when actions consume different numbers of draws.',
      'The only objective modeled is completing a guardian seal; the current battle format has no pack-authored encounter objectives.',
      'Small deterministic samples expose reproducible examples and outliers but do not establish population balance.',
    ],
    groups: [normal, overleveled, matchups, ...guardians],
  };
}

export function formatCombatComparison(report) {
  const lines = [
    `# Combat policy comparison · ${report.pack}`,
    '',
    `Seeds: ${report.seedRange[0]}–${report.seedRange[1]} · policies start from identical profiles and seed.`,
    '',
    '| Scenario | Policy | Win/loss/stall | Mean turns | Damage received | Healing | Potions | Switches | Response windows used | Failed seal objectives | Mean coins / XP |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const group of report.groups) {
    for (const [policy, row] of Object.entries(group.policies)) {
      const outcomes = `${row.results.win}/${row.results.loss}/${row.results.stalled}`;
      const objective = row.progressionObjectiveTrials ? `${row.failedProgressionObjectives}/${row.progressionObjectiveTrials}` : 'n/a';
      lines.push(
        `| ${group.name} | ${policy} | ${outcomes} | ${row.meanTurns.toFixed(1)} | ${row.meanDamageReceived.toFixed(1)} | ${row.meanHealing.toFixed(1)} | ${row.meanPotions.toFixed(1)} | ${row.meanSwitches.toFixed(1)} | ${row.meanResponsesUsed.toFixed(1)}/${row.meanResponseWindows.toFixed(1)} | ${objective} | ${row.meanCoins.toFixed(1)} / ${row.meanXp.toFixed(1)} |`,
      );
    }
  }
  lines.push('', '## Interpretation limits', '', ...report.limitations.map(item => `- ${item}`), '');
  return lines.join('\n');
}
