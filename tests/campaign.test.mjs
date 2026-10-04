import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattle, nextEnemyAction, resolveTurn, rollWild} from '../dist/src/domain/battle.js';
import {seededRng} from '../dist/src/domain/rng.js';
import {companion, healTeam, level, maxHP} from '../dist/src/domain/rules.js';
import {currentObjective} from '../dist/src/domain/objectives.js';
import {endingDue} from '../dist/src/domain/story.js';
import {regions} from '../dist/src/data/regions.js';
import {species} from '../dist/src/data/species.js';
import {codec, content, newSave, objCtx, rawMaps, rawObjectives, rawStory, rawPack, rawInventoryRules} from './helpers.mjs';
import {buildAdventure} from '../dist/src/domain/adventure.js';

const pack = JSON.parse(JSON.stringify(rawPack()));
const story = rawStory();
const objectives = rawObjectives().objectives;
const mapData = rawMaps();
const rawById = new Map(mapData.map(map => [map.id, map]));
const adventure = buildAdventure(mapData, content, rawObjectives(), story, pack, rawInventoryRules());

function actionFor(save, battle, boss) {
  const c = companion(save);
  const hp = maxHP(save, save.active);
  if (c.hp < hp * 0.4 && save.potions > 0) return {kind: 'potion'};
  if (!boss && battle.hp / battle.max <= 0.35 && save.orbs > 0) return {kind: 'catch'};
  if (['heavy', 'brace'].includes(nextEnemyAction(battle))) return {kind: 'guard'};
  return {kind: battle.focus >= 1 ? 'element' : 'attack'};
}

function fight(save, spec, rng, reward) {
  const battle = createBattle(save, rng, spec);
  for (let turn = 0; turn < 100 && !battle.over; turn++) {
    const result = resolveTurn(save, battle, actionFor(save, battle, spec.boss), rng, {sealReward: reward});
    if (!result) throw new Error('the selected battle action was rejected');
    if (result.ended) return result.ended;
  }
  return 'stalled';
}

function rest(save) {
  healTeam(save);
  // Model the ordinary free rest at each region's ranger supply point.
  save.potions = Math.max(save.potions, 2);
  save.orbs = Math.max(save.orbs, 6);
}

function activeLevel(save) {
  return Math.max(...save.party.map(id => level(save, id)));
}

test('all eight map files connect from the opening map and every roster member has a home encounter', () => {
  assert.deepEqual(adventure.errors, []);
  const reached = new Set(['meadow']);
  const queue = ['meadow'];
  while (queue.length) {
    const map = rawById.get(queue.shift());
    for (const exit of map.exits) {
      if (!reached.has(exit.to.map)) {
        reached.add(exit.to.map);
        queue.push(exit.to.map);
      }
    }
  }
  assert.deepEqual([...reached].sort(), pack.maps.toSorted());
  for (const member of species) {
    const found = mapData
      .filter(map => map.biome === member.biome)
      .some(map => map.zones.some(zone => zone.pool.some(entry => (typeof entry === 'string' ? entry : entry.species) === member.id)));
    assert.ok(found, `${member.id} is available in its home biome`);
  }
  for (const region of regions) {
    const map = rawById.get(region.id);
    assert.ok(
      map.landmarks.some(landmark => landmark.kind === 'shrine' && landmark.guardian),
      `${region.id} has a challenge`,
    );
    assert.ok(
      map.exits.some(exit => exit.to.map !== region.id),
      `${region.id} has a route onward`,
    );
  }
});

test('a careful new-save playthrough earns every seal, keeps rewards once, and reaches the ending', () => {
  const save = newSave();
  const rng = seededRng(3901);
  const seals = [];
  const reports = [];

  for (let index = 0; index < regions.length; index++) {
    const region = regions[index];
    const map = adventure.mapsById[region.id];
    const shrine = map.objects.find(object => object.kind === 'shrine');
    assert.ok(shrine?.guardian, `${region.id} has an integrated guardian`);
    save.region = index;
    save.mapId = region.id;

    let wildFights = 0;
    while (activeLevel(save) < shrine.guardian.level - 1 && wildFights < 60) {
      rest(save);
      const zone = map.zones[wildFights % map.zones.length];
      const wild = rollWild(save, rng, zone);
      const outcome = fight(save, wild, rng, shrine.reward);
      if (outcome === 'loss') rest(save);
      else assert.ok(['win', 'caught'].includes(outcome), `${region.id} wild encounter resolves`);
      wildFights++;
    }
    assert.ok(activeLevel(save) >= shrine.guardian.level - 1, `${region.id} can be trained for its shrine`);
    assert.ok(save.caught.length >= 2, 'the opening grass can provide a second friend before the first shrine');

    rest(save);
    const beforeCoins = save.coins;
    let attempts = 0;
    let outcome;
    do {
      outcome = fight(save, {...shrine.guardian, boss: true}, rng, shrine.reward);
      attempts++;
      if (outcome === 'loss') rest(save);
      assert.ok(attempts <= 8, `${region.id} guardian remains beatable with retries`);
    } while (outcome !== 'win');

    assert.ok(save.badges.includes(index), `${region.id} awarded its seal`);
    assert.equal(save.badges.filter(value => value === index).length, 1, `${region.id} does not duplicate its seal`);
    assert.ok(save.coins > beforeCoins, `${region.id} shrine reward was granted`);
    const restored = codec.normalize(JSON.parse(codec.serialize(save)), false);
    assert.deepEqual(restored.badges, save.badges, `${region.id} seal survives save/load`);
    assert.equal(restored.mapId, region.id);
    seals.push(index);
    reports.push(`${region.id}: level ${activeLevel(save)}, ${wildFights} training battles, ${attempts} shrine attempt${attempts === 1 ? '' : 's'}`);
  }

  assert.deepEqual(seals, [0, 1, 2, 3]);
  assert.equal(currentObjective(save, objectives, objCtx).id, 'keeper');
  assert.equal(endingDue(story, save, objCtx).title, story.ending.title);
  console.log(`campaign report: ${reports.join('; ')}`);
});
