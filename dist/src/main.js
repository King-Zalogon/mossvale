/* Entry point: builds the app object, wires modules together and starts the loop.
   See docs/ARCHITECTURE.md for module ownership and boundaries. */
import {species} from './data/species.js';
import {regions} from './data/regions.js';
import {assets} from './data/assets.js';
import {MAP_SIZE} from './config.js';
import * as save from './save.js';
import {seededRng} from './domain/rng.js';
import {effectiveness, level, maxHP, objective} from './domain/rules.js';
import {buildWorld, grass, isWalkable, spawnOf} from './domain/world.js';
import {movePlayer} from './domain/exploration.js';
import {createAudio} from './services/audio.js';
import {loadAssets} from './services/loader.js';
import {createPersistence} from './services/persistence.js';
import {createWorldRenderer} from './render/world.js';
import {sprites} from './render/sprites.js';
import {createController} from './controller.js';
import {direction, installInput, isMoving} from './input.js';
import {$, toast} from './ui/dom.js';
import {renderHud, renderSaveStatus} from './ui/hud.js';
import {createMenus} from './ui/menus.js';
import {createBattleView} from './ui/battle-view.js';

function getStorage() {
  try {
    return window.localStorage;
  } catch {
    return {
      getItem() {
        throw new Error('storage denied');
      },
    };
  }
}

const params = new URLSearchParams(location.search);
const debug = params.has('debug');
const rng = debug && params.has('seed') ? seededRng(Number(params.get('seed'))) : Math.random;
const canvas = $('#game');
const codec = save.create({species, regions, size: MAP_SIZE});
const loaded = codec.load(getStorage());

const game = {
  save: loaded.save,
  player: {x: loaded.save.x, y: loaded.save.y, dir: 8},
  world: {tiles: [], objects: []},
  battle: null,
  pacing: {steps: 0, encounterAt: 4, encounterCooldown: 2},
};
const ui = {
  modalMode: '',
  modalFocus: null,
  keys: {},
  touch: null,
  touchRun: false,
  paused: false,
  ready: false,
  zoom: 1.45,
  camera: {x: game.player.x, y: game.player.y},
  now: 0,
};
const app = {
  game,
  ui,
  rng,
  canvas,
  actions: {},
  audio: createAudio(),
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  persist: createPersistence({storage: getStorage(), codec, game, writable: loaded.writable, onStatus: renderSaveStatus}),
};
app.menus = createMenus(app);
app.renderBattle = createBattleView(app);
const actions = createController(app);
installInput(app);
const renderer = createWorldRenderer({canvas, miniCanvas: $('#minimap')});

// --- startup: world, loader, loop ---------------------------------------------------------------
const loading = $('#loading');
let attempt = 0;
let started = false;
const setBusy = busy => document.querySelectorAll('header,main').forEach(e => (e.inert = busy));

function showLoadError(message, detail) {
  loading.hidden = false;
  loading.classList.add('failed');
  $('#load-title').textContent = 'Mossvale could not start';
  $('#load-status').textContent = message;
  $('#load-detail').textContent = detail || '';
  $('#load-retry').hidden = false;
  $('#load-bar').hidden = true;
  setBusy(true);
  $('#load-retry').focus();
}

async function boot() {
  ui.ready = false;
  setBusy(true);
  loading.hidden = false;
  loading.classList.remove('failed');
  $('#load-title').textContent = game.save.badges.length || game.save.caught.length > 1 ? 'Resuming your trail' : 'Preparing Mossvale';
  $('#load-retry').hidden = true;
  $('#load-bar').hidden = false;
  $('#load-detail').textContent = '';
  if (!renderer.context || !renderer.miniContext) {
    showLoadError('This browser does not support the canvas features Mossvale needs.', 'Try a current version of Chrome, Edge, Firefox or Safari.');
    return;
  }
  const missing = await loadAssets({
    manifest: assets,
    sprites,
    attempt,
    onProgress(done, total) {
      $('#load-bar').value = total ? (done / total) * 100 : 100;
      $('#load-status').textContent = `Loading artwork… ${done} / ${total}`;
    },
  });
  if (missing.length) {
    attempt++;
    showLoadError('Some required artwork did not load. Check your connection, then try again.', 'Missing: ' + missing.map(a => a.src).join(', '));
    return;
  }
  ui.ready = true;
  loading.hidden = true;
  setBusy(false);
  actions.refresh();
  canvas.focus({preventScroll: true});
  toast(game.save.badges.length ? 'Your trail continues. Welcome back, explorer.' : 'The shrines are stirring. Find a new friend in the tall grass.');
  if (['restored', 'recovered', 'future', 'unavailable'].includes(loaded.status)) app.menus.saveNotice(loaded.status, loaded.message);
  if (!started) {
    started = true;
    requestAnimationFrame(loop);
  }
}

function resize() {
  const bounds = canvas.getBoundingClientRect();
  const height = Math.round((960 * bounds.height) / bounds.width);
  if (Number.isFinite(height) && height > 0 && canvas.height !== height) canvas.height = height;
  ui.zoom = innerWidth < 760 ? 1.9 : 1.45;
}

let last = 0;
let frame = 0;
function loop(t) {
  const dt = Math.min((t - last) / 1000, 0.04) || 0;
  last = t;
  ui.now = t;
  frame++;
  if (!document.hidden) {
    const {pacing} = game;
    pacing.encounterCooldown = Math.max(0, pacing.encounterCooldown - dt);
    if (!ui.paused && !ui.modalMode) {
      game.save.playTime += dt;
      const [sx, sy] = direction(ui);
      const run = ui.keys.shift || ui.touchRun;
      if (movePlayer({world: game.world, region: game.save.region, player: game.player, pacing}, sx, sy, run, dt)) actions.startBattle();
      const nearest = actions.nearest();
      $('#interact').style.display = nearest ? 'block' : 'none';
      if (nearest) $('#interact').textContent = 'E · ' + nearest.label;
    }
    const smoothing = app.reducedMotion ? 1 : Math.min(1, dt * 7);
    ui.camera.x += (game.player.x - ui.camera.x) * smoothing;
    ui.camera.y += (game.player.y - ui.camera.y) * smoothing;
    const view = {
      save: game.save,
      world: game.world,
      player: game.player,
      camera: ui.camera,
      zoom: ui.zoom,
      now: ui.now,
      paused: ui.paused,
      moving: isMoving(ui) && !ui.modalMode && !ui.paused,
    };
    renderer.drawWorld(view);
    if (frame % 4 === 0) renderer.drawMinimap(view);
  }
  requestAnimationFrame(loop);
}

$('#load-retry').onclick = boot;
$('#worldmap').onclick = actions.worldMap;
$('#quest-map').onclick = actions.worldMap;
$('#journal').onclick = actions.journal;
$('#party').onclick = actions.party;
$('#help').onclick = () => app.menus.help();
$('#camp').onclick = actions.returnToCamp;
$('#interact').onclick = actions.interact;
$('#touch-e').onclick = actions.interact;
$('#sound').onclick = () => {
  const on = app.audio.toggle();
  $('#sound').textContent = on ? 'Sound on' : 'Sound off';
  $('#sound').setAttribute('aria-pressed', String(on));
  app.audio.tone(620);
};
$('#pause').onclick = () => {
  if (game.battle || ui.modalMode) return;
  ui.paused = !ui.paused;
  $('#pause').textContent = ui.paused ? 'Resume' : 'Pause';
  ui.keys = {};
  ui.touch = null;
  toast(ui.paused ? 'Taking a breather. Resume when you’re ready.' : 'Back to the adventure.');
};
$('#zoom-in').onclick = () => (ui.zoom = Math.min(2.5, ui.zoom + 0.2));
$('#zoom-out').onclick = () => (ui.zoom = Math.max(0.85, ui.zoom - 0.2));
window.addEventListener('resize', resize);

actions.enterRegion(game.save.region);
if (!isWalkable(game.world, game.save.region, game.player.x, game.player.y)) Object.assign(game.player, spawnOf(game.save.region));
actions.resetCamera();
resize();
renderHud(game.save);
boot();
setInterval(app.persist, 6000);

// Test/debug hook: only available with ?debug (optionally ?seed=N for deterministic encounters).
if (debug) {
  window.mossvale = {
    getState: () => ({player: game.player, save: game.save, battle: game.battle, paused: ui.paused, modalMode: ui.modalMode, world: game.world, zoom: ui.zoom}),
    encounter: actions.startBattle,
    valid: (x, y) => isWalkable(game.world, game.save.region, x, y),
    grass: (x, y) => grass(x, y, game.save.region),
    travel: actions.travel,
    interact: actions.interact,
    objective: () => objective(game.save),
    level: id => level(game.save, id),
    maxHP: id => maxHP(game.save, id),
    effectiveness,
    buildWorld,
  };
}
