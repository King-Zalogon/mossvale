import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseTerrainVariant, terrainVariant} from '../dist/src/domain/terrain-family.js';
import {createInventory, moveInventory, sellInventory, validateInventoryRules} from '../dist/src/domain/inventory.js';
import {
  applyObjectiveEvent,
  createObjectiveState,
  recordObjectiveEvent,
  restoreObjectiveState,
  validateObjectiveEvents,
  validateObjectiveState,
} from '../dist/src/domain/objective-events.js';
import {compileComposition} from '../dist/src/domain/composition.js';
import {availableCompanionRoutes, companionCanUseRoute, validateCompanionRoutes} from '../dist/src/domain/companion-routes.js';
import {availableDialogueChoices, selectDialogueChoice, validateDialogueChoices} from '../dist/src/domain/dialogue-choices.js';
import {adventure, mapsById, packContent, rawInventoryRules, rawMaps, rawObjectives, rawPack, rawStory} from './helpers.mjs';
import {buildAdventure} from '../dist/src/domain/adventure.js';

test('terrain family topology and decoration selection are deterministic and leave unsafe rotation disabled', () => {
  const grid = ['ggg', 'gpw', 'ggg'].map(row => [...row]);
  assert.deepEqual(terrainVariant(grid, 1, 1), {
    terrain: 'p',
    key: 'p-edge-nesw',
    cornerKey: 'p-edge-nesw-corner-neseswnw',
    edges: ['n', 'e', 's', 'w'],
    corners: ['ne', 'se', 'sw', 'nw'],
    shape: 'cross',
    transform: 'none',
  });
  const variants = {'p-edge-nesw': ['bridge-a', 'bridge-b']};
  assert.deepEqual(chooseTerrainVariant(grid, 1, 1, variants, 123), chooseTerrainVariant(grid, 1, 1, variants, 123));
  assert.equal(terrainVariant(grid, 1, 1, {safeTransforms: true}).transform, 'rotate-90-safe');
  const straightGrid = ['ggg', 'ppp', 'ggg'].map(row => [...row]);
  const straight = terrainVariant(straightGrid, 1, 1);
  assert.equal(straight.shape, 'straight');
  assert.equal(
    chooseTerrainVariant(straightGrid, 1, 1, {'p-center': ['wrong-center']}, 3),
    null,
    'missing edge art is explicit, never replaced by a center tile',
  );
  const deterministic = chooseTerrainVariant(grid, 1, 1, {'p-edge-nesw': ['a', 'b', 'c']}, 71);
  assert.equal(deterministic.variant, chooseTerrainVariant(grid, 1, 1, {'p-edge-nesw': ['a', 'b', 'c']}, 71).variant);
});

test('optional inventory transactions reject full storage without partial writes and sell only valuables', () => {
  const rules = {
    carryCap: 4,
    storageCap: 1,
    items: {herb: {name: 'Herb', kind: 'usable', price: 2}, shard: {name: 'Shard', kind: 'valuable', price: 0, sellPrice: 7}},
  };
  assert.deepEqual(validateInventoryRules(rules), []);
  const inventory = createInventory();
  inventory.bag = {herb: 2, shard: 1};
  const before = structuredClone(inventory);
  assert.equal(moveInventory(inventory, {item: 'herb', quantity: 2, rules}).reason, 'full');
  assert.deepEqual(inventory, before);
  assert.equal(sellInventory(inventory, 'herb', 1, rules).reason, 'not-for-sale');
  assert.deepEqual(sellInventory(inventory, 'shard', 1, rules), {ok: true, item: 'shard', quantity: 1, coins: 7});
  assert.equal(inventory.coins, 7);
});

test('event objectives progress one stage at a time and emit a reward once', () => {
  const definition = {
    format: 1,
    id: 'lost-parcel',
    stages: [
      {id: 'meet-carrier', on: {type: 'talk', speaker: 'carrier'}, next: 'find-parcel'},
      {id: 'find-parcel', on: {type: 'collect', item: 'parcel'}, reward: {coins: 12}},
    ],
  };
  assert.deepEqual(validateObjectiveEvents(definition), []);
  const state = createObjectiveState(definition);
  assert.equal(applyObjectiveEvent(state, definition, {type: 'talk', speaker: 'other'}).changed, false);
  assert.deepEqual(applyObjectiveEvent(state, definition, {type: 'talk', speaker: 'carrier'}), {changed: true, status: 'active', stage: 'find-parcel'});
  assert.deepEqual(applyObjectiveEvent(state, definition, {type: 'collect', item: 'parcel'}), {changed: true, status: 'rewarded', reward: {coins: 12}});
  assert.equal(applyObjectiveEvent(state, definition, {type: 'collect', item: 'parcel'}).changed, false);
  const restarted = JSON.parse(JSON.stringify(state));
  assert.deepEqual(validateObjectiveState(restarted, definition), []);
  assert.equal(applyObjectiveEvent(restarted, definition, {type: 'collect', item: 'parcel'}).changed, false, 'reload cannot repeat a paid reward');
  const cyclic = {
    ...definition,
    stages: [
      {id: 'a', on: {type: 'talk'}, next: 'b'},
      {id: 'b', on: {type: 'talk'}, next: 'a'},
    ],
  };
  assert.match(validateObjectiveEvents(cyclic).join(' '), /cycle/);
  assert.match(validateObjectiveEvents({...definition, stages: [...definition.stages, {id: 'orphan', on: {type: 'never'}}]}).join(' '), /unreachable/);
});

test('event objective stage journal restores progress and prevents a second reward after reload', () => {
  const definition = {
    format: 1,
    id: 'quiet-corners',
    title: 'Quiet corners',
    stages: [
      {id: 'find-well', on: {type: 'interaction.used', target: 'old-well'}, next: 'read-sign'},
      {id: 'read-sign', on: {type: 'interaction.used', target: 'sign'}, reward: {coins: 8}},
    ],
  };
  const save = {events: []};
  assert.equal(recordObjectiveEvent(save, definition, {type: 'interaction.used', target: 'old-well'}, 'meadow').state.stage, 'read-sign');
  const reloaded = JSON.parse(JSON.stringify(save));
  const completion = recordObjectiveEvent(reloaded, definition, {type: 'interaction.used', target: 'sign'}, 'meadow');
  assert.equal(completion.state.status, 'rewarded');
  assert.deepEqual(completion.reward, {coins: 8});
  assert.deepEqual(validateObjectiveState(restoreObjectiveState(definition, reloaded.events), definition), []);
  assert.equal(recordObjectiveEvent(reloaded, definition, {type: 'interaction.used', target: 'sign'}, 'meadow').changed, false);
  assert.equal(reloaded.events.length, 2);
});

test('event counters restore their partial count across reloads before completing', () => {
  const definition = {
    format: 1,
    id: 'meet-neighbors',
    stages: [{id: 'make-two-friends', count: 2, on: {type: 'capture.completed'}, reward: {potions: 1}}],
  };
  const save = {events: []};
  const first = recordObjectiveEvent(save, definition, {type: 'capture.completed', species: 'fernling'}, 'meadow');
  assert.equal(first.state.status, 'active');
  assert.equal(first.state.count, 1);
  assert.equal(first.reward, undefined);
  const reloaded = JSON.parse(JSON.stringify(save));
  assert.equal(restoreObjectiveState(definition, reloaded.events).count, 1);
  const second = recordObjectiveEvent(reloaded, definition, {type: 'capture.completed', species: 'pebblit'}, 'meadow');
  assert.equal(second.state.status, 'rewarded');
  assert.deepEqual(second.reward, {potions: 1});
  assert.equal(recordObjectiveEvent(reloaded, definition, {type: 'capture.completed', species: 'emberkin'}, 'meadow').changed, false);
  assert.match(validateObjectiveEvents({...definition, stages: [{...definition.stages[0], count: 100}]}).join(' '), /1 to 99/);
});

test('the shipped adventure opts into two event goals and conditional ranger choices', () => {
  assert.deepEqual(adventure.errors, []);
  assert.deepEqual(
    adventure.eventObjectives.map(goal => goal.id),
    ['iris-follow-up', 'quiet-corners'],
  );
  const ranger = mapsById.meadow.objects.find(object => object.ref === 'ranger');
  assert.deepEqual(
    ranger.choices.map(choice => choice.id),
    ['ask-about-trail', 'ask-about-shrine', 'ask-how-to-wake-shrine'],
  );
});

test('packs without event goals or landmark choices keep their simple objective behavior', () => {
  const maps = rawMaps().map(map => ({...map, landmarks: map.landmarks.map(landmark => ({...landmark, choices: undefined}))}));
  const objectives = rawObjectives();
  delete objectives.eventObjectives;
  const built = buildAdventure(maps, packContent, objectives, rawStory(), rawPack(), rawInventoryRules());
  assert.deepEqual(built.errors, []);
  assert.deepEqual(built.eventObjectives, []);
  assert.ok(built.objectives.length > 0);
  assert.equal(built.mapsById.meadow.objects.find(object => object.ref === 'ranger').choices, undefined);
});

test('pack validation rejects unknown choice speakers and objective choices', () => {
  const maps = rawMaps();
  maps.find(map => map.id === 'meadow').landmarks.find(landmark => landmark.id === 'ranger').choices[0].speaker = 'missing-speaker';
  const badSpeaker = buildAdventure(maps, packContent, rawObjectives(), rawStory(), rawPack(), rawInventoryRules());
  assert.match(badSpeaker.errors.join(' '), /unknown stable speaker/);

  const objectives = rawObjectives();
  objectives.eventObjectives[0].stages[1].on.choice = 'missing-choice';
  const badChoice = buildAdventure(rawMaps(), packContent, objectives, rawStory(), rawPack(), rawInventoryRules());
  assert.match(badChoice.errors.join(' '), /unknown stable choice id/);
});

test('conditional dialogue choices use stable IDs and filter by current objective flags', () => {
  const choices = [
    {id: 'ask-route', speaker: 'guide', target: 'ferry', text: 'Can I cross?', reply: 'The ford is open.', when: {met: true}},
    {id: 'ask-reward', speaker: 'guide', target: 'ferry', text: 'Any reward?', reply: 'Take a token.', when: {met: false}},
  ];
  const refs = {speakerIds: new Set(['guide']), targetIds: new Set(['ferry']), mapIds: new Set(['meadow'])};
  assert.deepEqual(validateDialogueChoices(choices, refs), []);
  const save = {met: true, caught: [], seen: [], visited: [], badges: [], chests: []};
  const ctx = {speciesCount: 12, regions: []};
  assert.deepEqual(
    availableDialogueChoices(choices, save, ctx).map(choice => choice.id),
    ['ask-route'],
  );
  assert.equal(selectDialogueChoice(choices, 'ask-route', save, ctx).reply, 'The ford is open.');
  assert.equal(selectDialogueChoice(choices, 'ask-reward', save, ctx), null);
  assert.match(validateDialogueChoices([{...choices[0], target: 'unknown'}], refs).join(' '), /unknown stable target/);

  const branches = [
    {...choices[0], id: 'after-seal', when: {flag: 'meadow.seal'}},
    {...choices[1], id: 'before-seal', when: {not: {flag: 'meadow.seal'}}},
  ];
  const flagSave = {...save, badges: []};
  assert.deepEqual(
    availableDialogueChoices(branches, flagSave, {speciesCount: 12, regions: [{id: 'meadow'}]}).map(choice => choice.id),
    ['before-seal'],
  );
  flagSave.badges.push(0);
  assert.deepEqual(
    availableDialogueChoices(branches, flagSave, {speciesCount: 12, regions: [{id: 'meadow'}]}).map(choice => choice.id),
    ['after-seal'],
  );
});

test('body-plan compilation validates slots and de-duplicates derived abilities', () => {
  const plan = {
    id: 'small-flier',
    slots: [
      {id: 'core', required: true, accepts: ['core']},
      {id: 'wings', required: true, accepts: ['wing']},
      {id: 'feet', required: false, accepts: ['foot']},
    ],
  };
  const parts = {seed: {tags: ['core'], abilities: ['glide'], modifiers: {hp: 0.1}}, leafwing: {tags: ['wing'], abilities: ['glide', 'cross-shallow-water']}};
  assert.deepEqual(compileComposition(plan, parts, {core: 'seed', wings: 'leafwing'}), {
    errors: [],
    species: {parts: {core: 'seed', wings: 'leafwing'}, abilities: ['cross-shallow-water', 'glide'], modifiers: {hp: 0.1}},
  });
  assert.match(compileComposition(plan, parts, {core: 'leafwing', wings: 'leafwing'}).errors.join(' '), /not compatible/);
  const guardedPlan = {
    id: 'river-runner',
    slots: [
      {id: 'core', required: true, accepts: ['core']},
      {id: 'locomotion', required: true, accepts: ['movement'], excludes: ['flight']},
    ],
  };
  const guardedParts = {
    seed: {tags: ['core'], abilities: ['keen-sense'], modifiers: {speed: 0.3}},
    paws: {tags: ['movement'], abilities: ['swim'], modifiers: {speed: 0.1}},
    wings: {tags: ['movement', 'flight'], abilities: ['swim'], modifiers: {speed: 0.3}},
  };
  assert.deepEqual(compileComposition(guardedPlan, guardedParts, {core: 'seed', locomotion: 'paws'}).errors, []);
  assert.deepEqual(compileComposition(guardedPlan, guardedParts, {core: 'seed', locomotion: 'paws'}).species.abilities, ['keen-sense', 'swim']);
  assert.match(compileComposition(guardedPlan, guardedParts, {core: 'seed', locomotion: 'wings'}).errors.join(' '), /excludes/);
  assert.match(
    compileComposition(guardedPlan, {...guardedParts, paws: {tags: ['movement'], modifiers: {speed: 0.3}}}, {core: 'seed', locomotion: 'paws'}).errors.join(
      ' ',
    ),
    /combined modifier/,
  );
});

test('optional companion routes stay optional and every starter can reach recovery', () => {
  const waterway = {requires: {ability: 'cross-shallow-water', habitat: 'wetland'}};
  assert.equal(companionCanUseRoute(waterway, {abilities: ['cross-shallow-water'], habitats: ['wetland']}), true);
  assert.equal(companionCanUseRoute(waterway, {abilities: [], habitats: ['wetland']}), false);
  const routes = [
    {id: 'main-loop', recovery: true},
    {id: 'reed-cut', recovery: false, ...waterway},
  ];
  assert.deepEqual(
    availableCompanionRoutes(routes, {abilities: [], habitats: ['meadow']}).map(route => route.id),
    ['main-loop'],
  );
  const starts = [
    {id: 'seedling', abilities: [], habitats: ['meadow']},
    {id: 'pebblit', abilities: [], habitats: ['ridge']},
  ];
  assert.deepEqual(validateCompanionRoutes(routes, starts), []);
  assert.match(validateCompanionRoutes([{id: 'only-way-home', recovery: true, ...waterway}], starts).join(' '), /no accessible recovery route/);
  assert.match(validateCompanionRoutes([{id: 'optional-only', recovery: false, ...waterway}], starts).join(' '), /no accessible recovery route/);
  assert.deepEqual(
    validateCompanionRoutes(
      [
        {id: 'main-loop', recovery: true},
        {id: 'reed-cut', recovery: true, ...waterway},
      ],
      starts,
    ),
    [],
  );
});
