import {assets, spriteId} from './data/assets.js';
import {species} from './data/species.js';
import {regions} from './data/regions.js';
import {FACING, playerFrame} from './domain/exploration.js';
import {fetchAdventure} from './services/maps.js';
import {buildAdventure} from './domain/adventure.js';
import {createWorldRenderer} from './render/world.js';
import {drawSpriteFrame, sprites} from './render/sprites.js';
import {loadImage} from './services/loader.js';

const directions = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
const poseNames = ['Idle', 'Walk 1', 'Walk 2', 'Walk 3', 'Walk 4', 'Loop'];
const playerId = spriteId('person-red-cap-motion');
const travelerId = spriteId('person-traveler');
const gardenerId = spriteId('person-gardener');
const treeId = spriteId('tree-oak');
const buddyId = species[0].sprite;
const scale = 1.45;
const worldWidth = 36 * scale;
const imageIds = [playerId, travelerId, gardenerId, treeId, buddyId];

await Promise.all(imageIds.map(async id => (sprites[id] = await loadImage(assets[id].src))));

const canvasFor = (host, name, row, column, loop = false) => {
  const card = document.createElement('div');
  card.className = 'pose-card';
  const canvas = document.createElement('canvas');
  canvas.width = 104;
  canvas.height = 124;
  canvas.setAttribute('aria-label', `${name} ${poseNames[loop ? 5 : column]}`);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#a8ad7333';
  ctx.beginPath();
  ctx.ellipse(52, 106, 22, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  drawSpriteFrame(ctx, playerId, column, row, 52, 105, worldWidth);
  card.append(canvas, Object.assign(document.createElement('span'), {textContent: poseNames[loop ? 5 : column]}));
  if (loop) {
    const frame = () => {
      const reduced = document.querySelector('#reduced-motion').checked;
      const distance = (performance.now() / 1000) * 2.8;
      const cell = playerFrame(distance, true, reduced);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#a8ad7333';
      ctx.beginPath();
      ctx.ellipse(52, 106, 22, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      drawSpriteFrame(ctx, playerId, cell, row, 52, 105, worldWidth);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  host.append(card);
};

const playerGrid = document.querySelector('#player-grid');
directions.forEach((direction, row) => {
  const line = document.createElement('div');
  line.className = 'pose-row';
  line.append(Object.assign(document.createElement('strong'), {className: 'direction-label', textContent: direction}));
  for (let column = 0; column < 5; column++) canvasFor(line, direction, row, column);
  canvasFor(line, direction, row, 0, true);
  playerGrid.append(line);
});

const npcGrid = document.querySelector('#npc-grid');
for (const [name, id] of [
  ['Backpack traveler', travelerId],
  ['Apron gardener', gardenerId],
]) {
  const set = document.createElement('div');
  set.className = 'npc-set';
  set.append(Object.assign(document.createElement('h3'), {textContent: name}));
  const facings = document.createElement('div');
  facings.className = 'npc-facings';
  for (const [column, direction] of ['north', 'east', 'south', 'west'].entries()) {
    const card = document.createElement('div');
    card.className = 'pose-card';
    const canvas = document.createElement('canvas');
    canvas.width = 104;
    canvas.height = 124;
    canvas.setAttribute('aria-label', `${name}, ${direction}`);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#a8ad7333';
    ctx.beginPath();
    ctx.ellipse(52, 106, 22, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    drawSpriteFrame(ctx, id, column, 0, 52, 105, worldWidth);
    card.append(canvas, Object.assign(document.createElement('span'), {textContent: direction}));
    facings.append(card);
  }
  set.append(facings);
  npcGrid.append(set);
}

const adventure = await fetchAdventure('./maps/');
const appData = buildAdventure(adventure.maps, {assets, species, regions}, adventure.objectives, adventure.story);
if (appData.errors.length) throw new Error(appData.errors.join('\n'));
const map = appData.maps.find(entry => entry.id === 'meadow');
const world = {
  map: {...map, terrainAt: () => 'ground'},
  tiles: [],
  objects: [
    {x: -2.6, y: 0.2, id: travelerId, w: 36, kind: 'ranger', tag: 'TRAVELER'},
    {x: 2.6, y: 0.2, id: gardenerId, w: 36, kind: 'ranger', tag: 'GARDENER'},
    {x: 0.25, y: 0.4, id: treeId, w: 56, kind: 'scenery'},
  ],
};
const sceneCanvas = document.querySelector('#renderer-scene');
const renderer = createWorldRenderer({canvas: sceneCanvas, miniCanvas: document.createElement('canvas')});
const player = {x: 0, y: 0, dir: FACING.south, walkDistance: 0};
const save = {region: 0, active: 0, badges: [], chests: []};
const sceneState = {
  save,
  world,
  player,
  follower: {x: -20, y: 20},
  camera: {x: 0, y: 0},
  zoom: scale,
  now: 0,
  paused: false,
  moving: true,
  reducedMotion: false,
};
let renderedSprites = [];
const drawImage = renderer.context.drawImage.bind(renderer.context);
renderer.context.drawImage = (image, ...args) => {
  const id = sprites.indexOf(image);
  if (id >= 0) renderedSprites.push({name: assets[id].name, alpha: renderer.context.globalAlpha});
  drawImage(image, ...args);
};
let started = performance.now();
let looping = true;
const renderScene = () => {
  const elapsed = (performance.now() - started) / 1000;
  sceneState.now = elapsed * 1000;
  sceneState.moving = looping;
  sceneState.reducedMotion = document.querySelector('#reduced-motion').checked;
  player.walkDistance = sceneState.reducedMotion ? 0 : elapsed * 2.8;
  player.dir = FACING.south;
  renderedSprites = [];
  renderer.drawWorld(sceneState);
  sceneCanvas.dataset.frame = String(playerFrame(player.walkDistance, sceneState.moving, sceneState.reducedMotion));
  sceneCanvas.dataset.reducedMotion = String(sceneState.reducedMotion);
  requestAnimationFrame(renderScene);
};
requestAnimationFrame(renderScene);

document.querySelector('#toggle-walk').addEventListener('click', event => {
  looping = !looping;
  event.currentTarget.textContent = looping ? 'Pause walk loop' : 'Resume walk loop';
  event.currentTarget.setAttribute('aria-pressed', String(looping));
});

window.characterPreview = {
  frameFor: (distance, moving, reducedMotion = false) => playerFrame(distance, moving, reducedMotion),
  rendererState: () => ({frame: Number(sceneCanvas.dataset.frame), reducedMotion: sceneCanvas.dataset.reducedMotion}),
  rendererOrder: () => renderedSprites,
  assets: {player: assets[playerId].name, traveler: assets[travelerId].name, gardener: assets[gardenerId].name},
  regions,
};
