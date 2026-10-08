import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assets} from '../dist/src/data/assets.js';
import {biomes} from '../dist/src/data/biomes.js';
import {moves} from '../dist/src/data/moves.js';
import {regions} from '../dist/src/data/regions.js';
import {species} from '../dist/src/data/species.js';
import {buildAdventure} from '../dist/src/domain/adventure.js';
import {playerStrike, createBattle, enemyAttack} from '../dist/src/domain/battle.js';
import {currentObjective} from '../dist/src/domain/objectives.js';
import {endingDue} from '../dist/src/domain/story.js';
import {codec, newSave, objCtx, rawMaps, rawObjectives} from './helpers.mjs';

const idOf = id => species.findIndex(s => s.id === id);
const story = JSON.parse(readFileSync(new URL('../dist/maps/story.json', import.meta.url), 'utf8'));

test('the fifteen stable species stay findable in their four home biomes', () => {
  assert.equal(species.length, 15);
  assert.equal(new Set(species.map(s => s.id)).size, species.length);
  assert.deepEqual(
    species.slice(0, 12).map(s => s.id),
    ['fernling', 'emberkin', 'brooklet', 'duskwing', 'voltkit', 'mushmallow', 'frostowl', 'pebblit', 'bramblebuck', 'siltkip', 'sunskitter', 'hushram'],
  );
  assert.deepEqual(
    species.slice(12).map(s => s.id),
    ['sedgegnaw', 'petalunge', 'cindercurl'],
  );
  assert.equal(biomes.length, 4);
  const residentCounts = {meadow: 5, wetland: 3, badlands: 4, 'snowy-forest': 3};
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
  for (const speciesId of ['sedgegnaw', 'petalunge', 'cindercurl']) {
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
