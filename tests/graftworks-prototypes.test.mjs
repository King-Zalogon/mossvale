import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bakeTerrainFamily,
  chooseTerrainVariant,
  resolveTerrainFamilyCell,
  serializeTerrainFamilyBake,
  terrainVariant,
  validateTerrainFamilyFixture,
} from '../dist/src/domain/terrain-family.js';
import {createInventory, moveInventory, sellInventory, validateInventoryRules} from '../dist/src/domain/inventory.js';
import {
  applyObjectiveEvent,
  createObjectiveState,
  recordObjectiveEvent,
  restoreObjectiveState,
  validateObjectiveEvents,
  validateObjectiveState,
} from '../dist/src/domain/objective-events.js';
import {compileComposition, createCompositionArtBrief} from '../dist/src/domain/composition.js';
import {validateRegistries} from '../dist/src/domain/registries.js';
import compositionShowcase from '../art/characters/composition-prototypes.json' with {type: 'json'};
import defaultRegistries from '../dist/maps/registries.json' with {type: 'json'};
import mapIndex from '../dist/maps/index.json' with {type: 'json'};
import terrainFamilyFixture from '../dist/maps/terrain-family-fixture.json' with {type: 'json'};
import terrainFamilyBaked from '../dist/maps/terrain-family-fixture.baked.json' with {type: 'json'};
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
    edgeMask: 15,
    connections: [],
    connectionMask: 0,
    cornerMask: 15,
    shape: 'isolated',
    transform: 'none',
  });
  const variants = {'p-edge-nesw': ['bridge-a', 'bridge-b']};
  assert.deepEqual(chooseTerrainVariant(grid, 1, 1, variants, 123), chooseTerrainVariant(grid, 1, 1, variants, 123));
  assert.equal(terrainVariant(grid, 1, 1).transform, 'none', 'source art is not rotated unless an explicit safe transform is applied');
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

test('terrain-family compiler bakes a large connected crossing with authored art, topology, collision and seeded variants', () => {
  assert.deepEqual(validateTerrainFamilyFixture(terrainFamilyFixture), []);
  assert.ok(!mapIndex.maps.includes(terrainFamilyFixture.id), 'authoring fixture is not a shipped game map');
  const detailedBake = bakeTerrainFamily(terrainFamilyFixture);
  assert.deepEqual(serializeTerrainFamilyBake(terrainFamilyFixture, detailedBake), terrainFamilyBaked, 'checked-in bake exactly matches the compiler');
  assert.deepEqual(terrainFamilyFixture.size, {w: 32, h: 20});
  assert.equal(terrainFamilyBaked.counts.cells, 640, 'the repeated-meadow fixture compiles every tile');
  assert.equal(terrainFamilyFixture.surfaces.g.walkable, true);
  assert.equal(terrainFamilyFixture.surfaces.p.walkable, true);
  assert.equal(terrainFamilyFixture.surfaces.w.walkable, false);

  const base = [];
  const alternate = [];
  const shapes = new Set();
  const grid = terrainFamilyFixture.grid.map(row => [...row]);
  for (let y = 0; y < terrainFamilyFixture.size.h; y++) {
    for (let x = 0; x < terrainFamilyFixture.size.w; x++) {
      const resolved = resolveTerrainFamilyCell(terrainFamilyFixture, x, y, terrainFamilyFixture.seed);
      const repeated = resolveTerrainFamilyCell(terrainFamilyFixture, x, y, terrainFamilyFixture.seed);
      const changedSeed = resolveTerrainFamilyCell(terrainFamilyFixture, x, y, terrainFamilyFixture.seed + 1);
      assert.ok(resolved, 'all cells need a source recipe at ' + x + ',' + y);
      assert.deepEqual(repeated, resolved);
      assert.equal(resolved.walkable, resolved.bridgeId ? true : terrainFamilyFixture.surfaces[resolved.cellTerrain].walkable);
      assert.ok(terrainFamilyFixture.artwork[resolved.artwork].src.endsWith('.svg'));
      assert.equal(terrainFamilyFixture.artwork[resolved.artwork].lighting, 'northwest');
      assert.equal(terrainFamilyFixture.artwork[resolved.artwork].safeTransforms.length, 0, 'directional source art stays in its canonical orientation');
      shapes.add(terrainVariant(grid, x, y).shape);
      base.push(resolved.artVariant);
      alternate.push(changedSeed.artVariant);
    }
  }
  assert.ok([...shapes].includes('corner'));
  assert.ok([...shapes].includes('tee'));
  assert.ok([...shapes].includes('cross'));
  assert.ok(terrainFamilyBaked.counts.shoreTiles > 0, 'shoreline edges are compiled on both sides of the water transition');
  assert.ok(terrainFamilyBaked.cells.shoreMask.some(row => /[1-9a-f]/i.test(row)));
  assert.ok(terrainFamilyBaked.cells.walkable.every(row => row.length === terrainFamilyFixture.size.w && /^[01]+$/.test(row)));
  assert.ok(
    terrainFamilyBaked.artwork &&
      Object.values(terrainFamilyBaked.artwork).every(source => source.anchor.join(',') === terrainFamilyFixture.tile.anchor.join(',')),
  );
  assert.equal(terrainFamilyBaked.transformPolicy, 'canonical-only');
  assert.ok(Object.values(terrainFamilyBaked.artwork).every(source => source.safeTransforms.length === 0));
  assert.ok(terrainFamilyBaked.cells.connectionMask.some(row => /[1-9a-f]/i.test(row)));
  assert.ok(terrainFamilyBaked.cells.cornerMask.some(row => /[1-9a-f]/i.test(row)));
  assert.ok(
    terrainFamilyBaked.bridges[0].cells.every(([x, y]) => terrainFamilyBaked.cells.walkable[y][x] === '1' && terrainFamilyBaked.grid[y][x] === 'w'),
    'bridge cells override blocked-water collision explicitly while preserving water as the underlying terrain',
  );
  assert.ok(
    base.some(id => id === 'g-bank-corner-0' || id === 'g-bank-corner-1'),
    'exact corner recipe overrides its cardinal edge recipe',
  );
  assert.ok(
    base.some(id => id === 'p-bend-corner-0' || id === 'p-bend-corner-1'),
    'path turn uses its authored corner recipe',
  );
  assert.ok(
    base.some((variant, index) => variant !== alternate[index]),
    'changing the seed changes some repeated-area decoration',
  );

  const bridges = new Map(terrainFamilyFixture.bridges.flatMap(bridge => bridge.cells.map(([x, y]) => [x + ',' + y, bridge])));
  const isWalkable = ([x, y]) => {
    const bridge = bridges.get(x + ',' + y);
    return bridge ? bridge.walkable : terrainFamilyFixture.surfaces[terrainFamilyFixture.grid[y][x]].walkable;
  };
  const pending = [[0, 3]];
  const visited = new Set(['0,3']);
  while (pending.length) {
    const [x, y] = pending.shift();
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      const key = nx + ',' + ny;
      if (nx < 0 || ny < 0 || nx >= terrainFamilyFixture.size.w || ny >= terrainFamilyFixture.size.h || visited.has(key) || !isWalkable([nx, ny])) continue;
      visited.add(key);
      pending.push([nx, ny]);
    }
  }
  assert.ok(visited.has('28,9'), 'the path crosses the blocked river through the explicit bridge deck');
  assert.ok(visited.has('8,16'), 'the crossing remains connected to the path junction and branch');

  const invalid = structuredClone(terrainFamilyFixture);
  invalid.bridges[0].walkable = false;
  assert.match(validateTerrainFamilyFixture(invalid).join(' '), /explicitly walkable/);
  const missingArt = structuredClone(terrainFamilyFixture);
  delete missingArt.surfaceDefaults.p;
  assert.match(validateTerrainFamilyFixture(missingArt).join(' '), /missing source recipe/);
  const unsafeOrientation = structuredClone(terrainFamilyFixture);
  unsafeOrientation.artwork['reed-bridge-a'].orientation = 'north-south';
  assert.match(validateTerrainFamilyFixture(unsafeOrientation).join(' '), /needs authored east-west artwork/);
  assert.throws(() => bakeTerrainFamily(terrainFamilyFixture, -1), /unsigned 32-bit integer/);
  assert.throws(() => bakeTerrainFamily(terrainFamilyFixture, 0x1_0000_0000), /unsigned 32-bit integer/);
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
