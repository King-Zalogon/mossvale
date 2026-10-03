# Shared API inventory

This table is generated from `dist/src/**/*.js` by the existing module-boundary check. It lists the checked-in ES-module paths and their named exports; it is a navigation aid, not a promise that every export is stable. `npm run validate` fails when a module or export is added, removed, or renamed without refreshing the table. After an intentional API change, run `node scripts/check-boundaries.mjs --write-api-inventory`, review the diff, then run `npm run validate`.

## Canonical contracts and extension points

| Change area | Reuse or extend | Contract |
| --- | --- | --- |
| Save schema, migrations, serialization | `dist/src/save.js`; storage adapter in `dist/src/services/persistence.js` | [Save format](SAVE_FORMAT.md) |
| Seeded randomness | `dist/src/domain/rng.js`; inject its function into domain operations | [Architecture](ARCHITECTURE.md#state) |
| Sprite and map loading | `dist/src/services/loader.js` and `dist/src/services/maps.js` | [Assets](ASSETS.md), [map format](MAP_FORMAT.md) |
| Adventure content and pack validation | `dist/src/domain/pack.js`, `dist/src/domain/registries.js`, `dist/src/domain/adventure.js` | [Packs](PACKS.md), [content integration](CONTENT_INTEGRATION.md) |
| Map geometry and authored events | `dist/src/domain/mapdata.js`, `dist/src/domain/scenes.js`, `dist/src/domain/objectives.js`, `dist/src/domain/story.js` | [Map format](MAP_FORMAT.md), [objectives](OBJECTIVES.md), [story](STORY.md) |
| Game flow and player actions | `dist/src/controller.js`; rules stay in `dist/src/domain/` | [Architecture](ARCHITECTURE.md), [battle](BATTLE.md) |

Before adding a persistence codec, RNG, sprite loader, or map loader, check these modules and the live issue/claim links in [Agent start here](AGENT_START_HERE.md). Extend the owning API and its tests instead of creating a parallel implementation.

## Export and module inventory

<!-- BEGIN GENERATED MODULE INVENTORY -->
| Module | Layer | Named exports |
| --- | --- | --- |
| `character-preview.js` | root | — |
| `compatibility.js` | root | `ENGINE_VERSION`, `SAVE_SCHEMA_VERSION` |
| `config.js` | root | `BASE_LEVEL`, `BENCH_SHARE`, `CATCH_UP_BONUS`, `CATCH_UP_GAP`, `ELEMENT_COST`, `ELEMENT_POWER`, `FOCUS_GAIN`, `FOCUS_MAX`, `FOCUS_START`, `FOLLOW_GAP`, `GRACE_AFTER_BATTLE`, `GRACE_ON_ARRIVAL`, `GUARD_FACTOR`, `MAX_LEVEL`, `MAX_MAP_SIZE`, `MAX_XP`, `MOVE_STEP`, `MOVE_UPGRADE_LEVEL`, `PARTY_SIZE`, `PLAYER_RADIUS`, `TILE_H`, `TILE_W`, `TYPE_ADVANTAGE`, `TYPE_DISADVANTAGE`, `UNSEEN_PREFERENCE`, `UPGRADED_ELEMENT_POWER`, `XP_PER_LEVEL`, `configurePackRules` |
| `controller.js` | root | `createController` |
| `creature-combat-preview.js` | root | — |
| `data/assets.js` | data | `assets`, `spriteId` |
| `data/biomes.js` | data | `biomes` |
| `data/economy.js` | data | `CAPS`, `REST_FLOOR`, `REWARDS`, `SHOP`, `replaceEconomy` |
| `data/moves.js` | data | `moves` |
| `data/pack.js` | data | `PACK_ID`, `setPackId` |
| `data/regions.js` | data | `regions`, `replaceRegions` |
| `data/registry.js` | data | `configureRegistry` |
| `data/sounds.js` | data | `AMBIENCE`, `SFX`, `VOLUMES` |
| `data/species.js` | data | `replaceSpecies`, `species` |
| `data/tactics.js` | data | `BRACE_FACTOR`, `DEFAULT_PATTERN`, `HEAVY_FACTOR`, `INTENT_TEXT`, `TACTICS`, `planOf`, `replaceTactics` |
| `domain/adventure.js` | domain | `buildAdventure` |
| `domain/battle.js` | domain | `POTION_HEAL`, `battleCheckpoint`, `captureChance`, `createBattle`, `encounterDistance`, `enemyAttack`, `ensureHealthyCompanion`, `lastEnemyAction`, `nextEnemyAction`, `playerStrike`, `resolveCapture`, `resolveFaint`, `resolveLoss`, `resolveTurn`, `resolveWin`, `rollWild`, `throwOrb`, `usePotion` |
| `domain/clock.js` | domain | `createTestClock` |
| `domain/companion-routes.js` | domain | `companionCanUseRoute`, `validateCompanionRoutes` |
| `domain/composition.js` | domain | `compileComposition`, `validateBodyPlan` |
| `domain/economy.js` | domain | `buy`, `canBuy`, `claimChest`, `grant`, `restAtCamp` |
| `domain/events.js` | domain | `GAME_EVENT_SCHEMA`, `GAME_EVENT_VERSION`, `createEventLog` |
| `domain/exploration.js` | domain | `DIRECTIONS`, `FACING`, `RUN_SPEED`, `WALK_FRAME_DISTANCE`, `WALK_SPEED`, `facing`, `followerPoint`, `movePlayer`, `playerFrame`, `pushTrail` |
| `domain/inventory.js` | domain | `createInventory`, `moveInventory`, `sellInventory`, `validateInventoryRules` |
| `domain/mapdata.js` | domain | `LANDMARK_KINDS`, `MAP_FORMAT`, `MAX_CELLS`, `MAX_SIZE`, `TERRAIN`, `compileMap`, `validateMaps`, `walkableAt`, `zoneMatches` |
| `domain/objective-events.js` | domain | `applyObjectiveEvent`, `createObjectiveState`, `validateObjectiveEvents` |
| `domain/objectives.js` | domain | `OBJECTIVES_FORMAT`, `collectFlags`, `currentObjective`, `holds`, `pickLine`, `validateLines`, `validateObjectives` |
| `domain/pack.js` | domain | `PACK_FORMAT`, `milestonesOf`, `packFileEntries`, `validatePack`, `validatePackMetadata` |
| `domain/phase.js` | domain | `PHASES`, `transition` |
| `domain/prefabs.js` | domain | `expandMapPrefabs` |
| `domain/registries.js` | domain | `resolveRegistries`, `validateRegistries` |
| `domain/rng.js` | domain | `seededRng` |
| `domain/rules.js` | domain | `addToParty`, `addXP`, `awardXP`, `clampHealth`, `companion`, `effectiveness`, `elementPower`, `flagDone`, `healTeam`, `healthyParty`, `inParty`, `level`, `maxHP`, `moveName`, `moveUpgraded`, `normalizeParty`, `removeFromParty`, `reserve`, `setActive`, `setFlag`, `unlocked`, `xpProgress` |
| `domain/scenes.js` | domain | `MAX_SCENE_EVENTS`, `SCENE_ACTIONS`, `applySceneActions`, `markSceneRun`, `sceneConditionHolds`, `sceneEventKey`, `sceneHasRun`, `validateSceneEvent` |
| `domain/story.js` | domain | `HINT_EVENTS`, `MAX_HINTS`, `STORY_FORMAT`, `endingDue`, `markSeen`, `pendingHint`, `validateStory` |
| `domain/terrain-family.js` | domain | `chooseTerrainVariant`, `terrainSeed`, `terrainVariant` |
| `domain/world.js` | domain | `INTERACTIVE_KINDS`, `buildWorld`, `isLand`, `isWalkable`, `nearestInteractive`, `nearestWalkable`, `objectsInBounds`, `rnd`, `spawnOf`, `terrainAt`, `tilesInBounds`, `triggersAt`, `zoneAt` |
| `input.js` | root | `direction`, `installInput`, `isMoving` |
| `main.js` | root | — |
| `map-editor.js` | root | — |
| `render/sprites.js` | render | `drawCreature`, `drawCreatureAnimated`, `drawSprite`, `drawSpriteFrame`, `sprites` |
| `render/world.js` | render | `createWorldRenderer` |
| `save.js` | root | `KEYS`, `VERSION`, `commitSaveTransaction`, `create`, `packOf`, `readSaveItem`, `recoverSaveTransaction` |
| `services/audio.js` | services | `createAudio` |
| `services/backup.js` | services | `BACKUP_FORMAT`, `BACKUP_KIND`, `MAX_BACKUP_BYTES`, `exportBackup`, `exportFileName`, `importSave`, `parseBackup`, `readCheckpoint`, `restoreCheckpoint` |
| `services/loader.js` | services | `TIMEOUT_MS`, `loadAssets`, `loadImage` |
| `services/maps.js` | services | `fetchAdventure` |
| `services/persistence.js` | services | `createPersistence` |
| `services/profile.js` | services | `hasProgress`, `readArchive`, `restoreArchive`, `startOver`, `summarize` |
| `services/settings.js` | services | `DEFAULTS`, `MOTION`, `SETTINGS_KEY`, `TEXT_SIZES`, `VOLUME_STEPS`, `ZOOM_MAX`, `ZOOM_MIN`, `loadSettings`, `normalizeSettings`, `saveSettings` |
| `services/timeline.js` | services | `createTimeline` |
| `services/version.js` | services | `describeBuild`, `fetchBuild` |
| `ui/battle-view.js` | ui | `createBattleView` |
| `ui/dom.js` | ui | `$`, `downloadText`, `header`, `hideModal`, `openModal`, `setBackgroundInert`, `toast` |
| `ui/hud.js` | ui | `renderHud`, `renderRegion`, `renderSaveStatus` |
| `ui/menus.js` | ui | `createMenus` |
| `ui/speech.js` | ui | `createSpeech` |
<!-- END GENERATED MODULE INVENTORY -->
