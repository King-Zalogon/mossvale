import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseTerrainVariant, terrainVariant} from '../dist/src/domain/terrain-family.js';
import {createInventory, moveInventory, sellInventory, validateInventoryRules} from '../dist/src/domain/inventory.js';
import {applyObjectiveEvent, createObjectiveState, validateObjectiveEvents, validateObjectiveState} from '../dist/src/domain/objective-events.js';
import {compileComposition, createCompositionArtBrief} from '../dist/src/domain/composition.js';
import {validateRegistries} from '../dist/src/domain/registries.js';
import compositionShowcase from '../art/characters/composition-prototypes.json' with {type: 'json'};
import defaultRegistries from '../dist/maps/registries.json' with {type: 'json'};
import {availableCompanionRoutes, companionCanUseRoute, validateCompanionRoutes} from '../dist/src/domain/companion-routes.js';
import {availableDialogueChoices, selectDialogueChoice, validateDialogueChoices} from '../dist/src/domain/dialogue-choices.js';

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

test('composition showcase compiles three ordinary species records and generated art briefs, including a novel data-only plan', () => {
  assert.equal(compositionShowcase.compositions.length, 3);
  assert.equal(compositionShowcase.bodyPlans[compositionShowcase.novelPlan].novel, true);
  const compiledSpecies = [];
  const briefs = [];
  for (const composition of compositionShowcase.compositions) {
    const plan = compositionShowcase.bodyPlans[composition.bodyPlan];
    const compiled = compileComposition(plan, compositionShowcase.parts, composition.assignments);
    assert.deepEqual(compiled.errors, [], composition.id);
    const brief = createCompositionArtBrief(plan, compositionShowcase.parts, composition.assignments, {
      id: composition.species.id,
      name: composition.species.name,
      visualIdentity: composition.identityBrief,
    });
    assert.deepEqual(brief.errors, [], composition.id);
    assert.equal(brief.brief.anatomy.length, Object.keys(composition.assignments).length);
    assert.match(brief.brief.artDirection, /cohesive, full-body creature/);
    briefs.push(brief.brief);
    compiledSpecies.push({...composition.species, ...compiled.species});
  }
  assert.equal(new Set(compiledSpecies.map(entry => entry.id)).size, 3);
  assert.ok(
    compiledSpecies.every(entry => typeof entry.hp === 'number' && entry.stats?.hp === entry.hp && Array.isArray(entry.strong) && Array.isArray(entry.weak)),
  );
  assert.deepEqual(compiledSpecies[2].abilities, ['cross-shallow-water', 'dash', 'glide']);
  assert.equal(new Set(briefs.map(brief => brief.speciesId)).size, 3);

  const registry = {...defaultRegistries, species: [...defaultRegistries.species, ...compiledSpecies]};
  const assetNames = new Set([
    ...defaultRegistries.species.map(entry => entry.sprite),
    ...defaultRegistries.regions.map(entry => entry.preview),
    ...compiledSpecies.map(entry => entry.sprite),
  ]);
  assert.deepEqual(validateRegistries(registry, {assetNames}), [], 'compiled prototypes remain compatible with ordinary pack species records');
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
