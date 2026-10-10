import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assets} from '../dist/src/data/assets.js';
import {biomes} from '../dist/src/data/biomes.js';
import {moves} from '../dist/src/data/moves.js';
import {regions} from '../dist/src/data/regions.js';
import {species} from '../dist/src/data/species.js';
import {buildAdventure} from '../dist/src/domain/adventure.js';
import {playerStrike, createBattle, enemyAttack, resolveTurn, battleCheckpoint} from '../dist/src/domain/battle.js';
import {setActive, reserve} from '../dist/src/domain/rules.js';
import {currentObjective} from '../dist/src/domain/objectives.js';
import {endingDue} from '../dist/src/domain/story.js';
import {codec, newSave, objCtx, rawMaps, rawObjectives} from './helpers.mjs';

const idOf = id => species.findIndex(s => s.id === id);
const story = JSON.parse(readFileSync(new URL('../dist/maps/story.json', import.meta.url), 'utf8'));

test('the eighteen stable species stay findable in their four home biomes', () => {
  assert.equal(species.length, 18);
  assert.equal(new Set(species.map(s => s.id)).size, species.length);
  assert.deepEqual(
    species.slice(0, 12).map(s => s.id),
    ['fernling', 'emberkin', 'brooklet', 'duskwing', 'voltkit', 'mushmallow', 'frostowl', 'pebblit', 'bramblebuck', 'siltkip', 'sunskitter', 'hushram'],
  );
  assert.deepEqual(
    species.slice(12).map(s => s.id),
    ['sedgegnaw', 'petalunge', 'cindercurl', 'sunsifter', 'rillume', 'lanternix'],
  );
  assert.equal(biomes.length, 4);
  const residentCounts = {meadow: 5, wetland: 4, badlands: 6, 'snowy-forest': 3};
  for (const biome of biomes) {
    assert.equal(species.filter(s => s.biome === biome.id).length, residentCounts[biome.id], biome.id);
    assert.ok(
      regions.some(r => r.biome === biome.id),
      `${biome.id} needs a playable region`,
    );
    const residents = species.filter(s => s.biome === biome.id).map(s => s.id);
    const available = new Set(
      rawMaps()
        .filter(m => m.biome === biome.id)
        .flatMap(m => m.zones.flatMap(z => z.pool.map(e => (typeof e === 'string' ? e : e.species)))),
    );
    for (const resident of residents) assert.ok(available.has(resident), `${resident} is not findable in ${biome.name}`);
  }
  assert.deepEqual(buildAdventure(rawMaps(), {assets, species, regions}, rawObjectives()).errors, []);
});

test('each species has a distinct battle role, move, and habitat clue', () => {
  assert.equal(new Set(species.map(s => s.move)).size, species.length);
  for (const s of species) {
    assert.ok(s.role.length > 3 && s.personality.length > 10 && s.encounterHint.length > 10, s.id);
    assert.ok(Number.isInteger(s.stats.hp) && s.stats.hp >= 30 && s.stats.hp <= 60, `${s.id} hp`);
    assert.ok(Number.isInteger(s.stats.attack) && s.stats.attack >= 6 && s.stats.attack <= 15, `${s.id} attack`);
    assert.ok(Number.isInteger(s.stats.defense) && s.stats.defense >= 6 && s.stats.defense <= 18, `${s.id} defense`);
    assert.ok(Object.hasOwn(moves, s.move), `${s.id} move`);
    assert.ok(assets[s.sprite]?.name, `${s.id} sprite`);
  }
  assert.ok(moves['glass-dash'].power > moves['leaf-burst'].power);
  assert.ok(moves['briar-brace'].power < moves['leaf-burst'].power);
  assert.ok(species.find(s => s.id === 'sedgegnaw').stats.defense > species.find(s => s.id === 'fernling').stats.defense);
  assert.ok(species.find(s => s.id === 'sedgegnaw').stats.attack < species.find(s => s.id === 'fernling').stats.attack);
  assert.ok(species.find(s => s.id === 'petalunge').stats.attack > species.find(s => s.id === 'bramblebuck').stats.attack);
  assert.ok(species.find(s => s.id === 'petalunge').stats.defense < species.find(s => s.id === 'bramblebuck').stats.defense);
  assert.ok(species.find(s => s.id === 'cindercurl').stats.defense > species.find(s => s.id === 'emberkin').stats.defense);
  assert.ok(species.find(s => s.id === 'cindercurl').stats.attack < species.find(s => s.id === 'emberkin').stats.attack);
  assert.ok(species.find(s => s.id === 'sunsifter').stats.attack > species.find(s => s.id === 'pebblit').stats.attack);
  assert.ok(species.find(s => s.id === 'sunsifter').stats.defense < species.find(s => s.id === 'pebblit').stats.defense);
  assert.ok(species.find(s => s.id === 'rillume').stats.attack > species.find(s => s.id === 'brooklet').stats.attack);
  assert.ok(species.find(s => s.id === 'rillume').stats.defense < species.find(s => s.id === 'brooklet').stats.defense);
  assert.ok(species.find(s => s.id === 'lanternix').stats.attack < species.find(s => s.id === 'voltkit').stats.attack);
  assert.ok(species.find(s => s.id === 'lanternix').stats.defense > species.find(s => s.id === 'voltkit').stats.defense);
});

test('different stats and move definitions create distinct battle choices', () => {
  const fernling = idOf('fernling');
  const sunskitter = idOf('sunskitter');
  const siltkip = idOf('siltkip');
  const attack = id => {
    const save = newSave();
    save.active = id;
    return playerStrike(save, {id: siltkip, hp: 500, max: 500, level: 5, turn: 0}, 'attack', () => 0).damage;
  };
  assert.ok(attack(sunskitter) > attack(fernling), 'Sunskitter should hit harder than balanced Fernling');

  const incoming = defender => {
    const save = newSave();
    save.active = defender;
    save.caught = [defender];
    save.party = [defender];
    save.team = {[defender]: {xp: 0, hp: 100}};
    const battle = createBattle(save, () => 0, {id: idOf('sunskitter'), level: 20});
    return enemyAttack(save, battle, () => 0).damage;
  };
  assert.ok(incoming(idOf('brooklet')) < incoming(idOf('duskwing')), 'Brooklet should take less damage than Duskwing');
});

test('the new creatures keep stable IDs in discovery, party and save round trips', () => {
  for (const speciesId of ['sedgegnaw', 'petalunge', 'cindercurl', 'sunsifter', 'rillume', 'lanternix']) {
    const save = newSave();
    const newId = idOf(speciesId);
    save.caught.push(newId);
    save.seen.push(newId);
    save.party = [newId];
    save.active = newId;
    save.team[newId] = {xp: 90, hp: 31};
    const raw = codec.serialize(save);
    const serialized = JSON.parse(raw);
    assert.ok(serialized.caught.includes(speciesId));
    assert.ok(serialized.seen.includes(speciesId));
    assert.ok(serialized.party.includes(speciesId));
    const back = codec.normalize(serialized, false);
    assert.equal(species[back.caught.find(i => species[i].id === speciesId)].id, speciesId);
    assert.equal(back.team[newId].xp, 90);
  }
});

test('The roster additions can be captured into a full reserve, activated, used in battle and reloaded', () => {
  for (const name of ['sunsifter', 'rillume', 'lanternix']) {
    const save = newSave();
    for (const id of [1, 2]) {
      save.caught.push(id);
      save.party.push(id);
      save.team[id] = {xp: 0, hp: 30};
    }
    const id = idOf(name);
    const battle = createBattle(save, () => 0, {id, level: 6});
    battle.hp = 1;
    const result = resolveTurn(save, battle, {kind: 'catch'}, () => 0);
    assert.equal(result.ended, 'caught');
    assert.equal(result.events.find(event => event.type === 'caught').joined, 'reserve');
    assert.ok(reserve(save).includes(id));
    assert.equal(setActive(save, id), true);
    assert.ok(save.party.includes(id));
    const restored = codec.normalize(JSON.parse(codec.serialize(save)), false);
    assert.equal(restored.active, id);
    assert.ok(restored.caught.includes(id));
    const next = createBattle(restored, () => 0, {id: idOf('duskwing'), level: 6});
    assert.ok(resolveTurn(restored, next, {kind: 'element'}, () => 0).events.some(event => event.type === 'strike'));
  }
});

test('all four seals finish the story without requiring the optional species collection', () => {
  const save = newSave();
  save.badges = [0, 1, 2, 3];
  save.caught.push(1);
  const objective = currentObjective(save, JSON.parse(readFileSync(new URL('../dist/maps/objectives.json', import.meta.url), 'utf8')).objectives, objCtx);
  assert.equal(objective.id, 'keeper');
  assert.deepEqual(
    objective.lines.map(([done]) => done),
    [true, false],
  );
  assert.equal(endingDue(story, save, objCtx).title, story.ending.title);
});

test('Lanternix uses the shared bounded relay, persists its source ID and leaves immediate attacking viable', () => {
  const lanternix = idOf('lanternix');
  const rillume = idOf('rillume');
  const trial = (foe, actions) => {
    const save = newSave();
    Object.assign(save, {
      caught: [lanternix, rillume],
      party: [lanternix, rillume],
      active: lanternix,
      team: {[lanternix]: {xp: 0, hp: 38}, [rillume]: {xp: 0, hp: 42}},
    });
    const battle = createBattle(save, () => 0, {id: idOf(foe), level: 5});
    battle.hp = battle.max = 999;
    const strikes = [];
    for (const kind of actions) {
      const turn = resolveTurn(save, battle, {kind, id: rillume}, () => 0);
      assert.ok(turn, `${foe} ${kind} is legal`);
      strikes.push(...turn.events.filter(event => event.type === 'strike'));
      if (kind === 'setup') {
        save.battle = battleCheckpoint(battle);
        const restored = codec.normalize(JSON.parse(codec.serialize(save)), false);
        assert.equal(restored.battle.condition.source, lanternix);
        assert.equal(restored.battle.condition.remaining, 1);
        assert.equal(species[restored.battle.condition.source].id, 'lanternix');
        save.battle = null;
      }
    }
    assert.equal(battle.condition, null);
    assert.equal(battle.relayReady, false);
    return strikes;
  };
  for (const foe of ['pebblit', 'brooklet']) {
    const relay = trial(foe, ['setup', 'switch', 'element']);
    const direct = trial(foe, ['element', 'switch', 'element']);
    assert.equal(relay.length, 1);
    assert.equal(relay[0].prepared, true);
    assert.ok(relay[0].damage > direct[1].damage, `${foe}: the one-use teammate strike is amplified`);
    if (foe === 'brooklet')
      assert.ok(
        direct.reduce((sum, strike) => sum + strike.damage, 0) > relay[0].damage,
        'attacking the Water opponent directly remains a better three-turn damage choice',
      );
  }
});
