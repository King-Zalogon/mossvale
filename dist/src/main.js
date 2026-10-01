/* Entry point: builds the app object, wires modules together and starts the loop.
   See docs/ARCHITECTURE.md for module ownership and boundaries. */
import {species} from './data/species.js';
import {regions} from './data/regions.js';
import {assets} from './data/assets.js';
import {MAX_MAP_SIZE} from './config.js';
import * as save from './save.js';
import {seededRng} from './domain/rng.js';
import {effectiveness, level, maxHP} from './domain/rules.js';
import {currentObjective} from './domain/objectives.js';
import {isWalkable, nearestWalkable, zoneAt} from './domain/world.js';
import {buildAdventure} from './domain/adventure.js';
import {followerPoint, movePlayer} from './domain/exploration.js';
import {createAudio} from './services/audio.js';
import {loadAssets} from './services/loader.js';
import {readArchive, restoreArchive, startOver} from './services/profile.js';
import {loadSettings, saveSettings, ZOOM_MAX, ZOOM_MIN} from './services/settings.js';
import {fetchAdventure} from './services/maps.js';
import {describeBuild, fetchBuild} from './services/version.js';
import {createPersistence} from './services/persistence.js';
import {createWorldRenderer} from './render/world.js';
import {sprites} from './render/sprites.js';
import {createController} from './controller.js';
import {direction, installInput, isMoving} from './input.js';
import {$, hideModal, toast} from './ui/dom.js';
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
const codec = save.create({species, regions, size: MAX_MAP_SIZE});
const storage = getStorage();
const loaded = codec.load(storage);
const settings = loadSettings(storage);
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');

const game = {
  save: loaded.save,
  player: {x: loaded.save.x, y: loaded.save.y, dir: 8},
  world: {map: null, tiles: [], objects: []},
  battle: loaded.save.battle ? {...loaded.save.battle, busy: false, over: false} : null,
  phase: 'explore',
  firedTriggers: new Set(),
  trail: [],
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
  zoom: settings.zoom ?? 1.45,
  camera: {x: game.player.x, y: game.player.y},
  now: 0,
};
const app = {
  game,
  ui,
  rng,
  canvas,
  actions: {},
  maps: [],
  objectives: [],
  objCtx: {speciesCount: species.length, regions},
  audio: createAudio(),
  settings,
  build: null,
  buildLabel: () => describeBuild(app.build),
  motionReduced: () => settings.motion === 'reduced' || motionQuery.matches,
  archive: () => readArchive(storage, codec),
  canStartOver: () => loaded.writable,
  persist: createPersistence({storage, codec, game, writable: loaded.writable, onStatus: renderSaveStatus}),
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

/** Runs once the player has passed the title screen: welcome, resume an interrupted fight, recovery notices. */
function postStart() {
  canvas.focus({preventScroll: true});
  toast(game.save.badges.length ? 'Your trail continues. Welcome back, explorer.' : 'The shrines are stirring. Find a new friend in the tall grass.');
  const resumed = actions.resumeBattle();
  if (!resumed && game.save.recap) {
    toast(game.save.recap);
    game.save.recap = '';
  }
  if (['restored', 'recovered', 'future', 'unavailable'].includes(loaded.status)) app.menus.saveNotice(loaded.status, loaded.message);
}

function applyMotion() {
  document.body.classList.toggle('reduce-motion', app.motionReduced());
}

Object.assign(actions, {
  startPlaying() {
    hideModal(ui, canvas);
    postStart();
  },
  menu() {
    if (!ui.ready || ui.modalMode || game.phase !== 'explore') return;
    app.menus.mainMenu();
  },
  setSetting(key, value) {
    if (!(key in settings)) return;
    settings[key] = value;
    if (key === 'sound') {
      app.audio.set(value);
      $('#sound').textContent = value ? 'Sound on' : 'Sound off';
      $('#sound').setAttribute('aria-pressed', String(value));
      app.audio.tone(620);
    }
    if (key === 'run') {
      ui.touchRun = value;
      $('#touch-run').setAttribute('aria-pressed', String(value));
    }
    if (key === 'motion') applyMotion();
    saveSettings(storage, settings);
  },
  /** `null` goes back to the automatic zoom for the screen width. */
  setZoom(value) {
    settings.zoom = value === null ? null : Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100));
    resize();
    saveSettings(storage, settings);
  },
  newGame() {
    const result = startOver({storage, codec, save: game.save});
    if (!result.ok) {
      toast('Could not start over: this browser will not let Mossvale write its save.');
      return;
    }
    app.persist.lock();
    location.reload();
  },
  restoreAdventure() {
    const result = restoreArchive({storage, codec, save: game.save});
    if (!result.ok) {
      toast('Could not restore the earlier adventure.');
      return;
    }
    app.persist.lock();
    location.reload();
  },
});

async function boot() {
  if (!app.build) fetchBuild().then(info => (app.build = info)); // for the menu; never blocks play
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
  if (!app.maps.length) {
    try {
      const {maps: rawMaps, objectives: rawObjectives} = await fetchAdventure();
      const {maps, objectives, errors} = buildAdventure(rawMaps, {assets, species, regions}, rawObjectives);
      if (errors.length) {
        showLoadError('The adventure data is invalid.', errors.slice(0, 5).join(' · '));
        return;
      }
      app.maps.push(...maps);
      app.objectives.push(...objectives);
    } catch (e) {
      showLoadError('Could not load the map data. Check your connection, then try again.', String(e.message || e));
      return;
    }
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
  if (!game.world.map) {
    actions.enterRegion(game.save.region);
    if (!isWalkable(game.world, game.player.x, game.player.y)) Object.assign(game.player, nearestWalkable(game.world, game.player.x, game.player.y));
    actions.resetCamera();
  }
  ui.ready = true;
  loading.hidden = true;
  setBusy(false);
  actions.refresh();
  canvas.focus({preventScroll: true});
  if (debug) postStart();
  else app.menus.mainMenu({title: true});
  if (!started) {
    started = true;
    requestAnimationFrame(loop);
  }
}

function resize() {
  const bounds = canvas.getBoundingClientRect();
  const height = Math.round((960 * bounds.height) / bounds.width);
  if (Number.isFinite(height) && height > 0 && canvas.height !== height) canvas.height = height;
  ui.zoom = settings.zoom ?? (innerWidth < 760 ? 1.9 : 1.45);
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
      const zone = movePlayer({world: game.world, player: game.player, pacing, trail: game.trail}, sx, sy, run, dt);
      if (zone) actions.startWild(zone);
      actions.checkTriggers();
      if (!isWalkable(game.world, game.player.x, game.player.y)) Object.assign(game.player, nearestWalkable(game.world, game.player.x, game.player.y)); // stuck recovery
      const nearest = actions.nearest();
      $('#interact').style.display = nearest ? 'block' : 'none';
      if (nearest) $('#interact').textContent = 'E · ' + nearest.label;
    }
    const smoothing = app.motionReduced() ? 1 : Math.min(1, dt * 7);
    ui.camera.x += (game.player.x - ui.camera.x) * smoothing;
    ui.camera.y += (game.player.y - ui.camera.y) * smoothing;
    const view = {
      save: game.save,
      world: game.world,
      player: game.player,
      follower: followerPoint(game.world, game.player, game.trail),
      camera: ui.camera,
      zoom: ui.zoom,
      now: ui.now,
      paused: ui.paused,
      phase: game.phase,
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
$('#sound').onclick = () => actions.setSetting('sound', !app.audio.enabled);
$('#menu').onclick = () => actions.menu();
$('#pause').onclick = () => {
  if (game.battle || ui.modalMode) return;
  ui.paused = !ui.paused;
  $('#pause').textContent = ui.paused ? 'Resume' : 'Pause';
  ui.keys = {};
  ui.touch = null;
  toast(ui.paused ? 'Taking a breather. Resume when you’re ready.' : 'Back to the adventure.');
};
$('#zoom-in').onclick = () => actions.setZoom(ui.zoom + 0.2);
$('#zoom-out').onclick = () => actions.setZoom(ui.zoom - 0.2);
window.addEventListener('resize', resize);
motionQuery.addEventListener?.('change', applyMotion);

app.audio.set(settings.sound);
if (settings.sound) {
  $('#sound').textContent = 'Sound on';
  $('#sound').setAttribute('aria-pressed', 'true');
}
ui.touchRun = settings.run;
$('#touch-run').setAttribute('aria-pressed', String(settings.run));
applyMotion();
resize();
renderHud(game.save);
boot();
setInterval(app.persist, 6000);

// Test/debug hook: only available with ?debug (optionally ?seed=N for deterministic encounters).
if (debug) {
  window.mossvale = {
    getState: () => ({
      player: game.player,
      save: game.save,
      battle: game.battle,
      paused: ui.paused,
      phase: game.phase,
      modalMode: ui.modalMode,
      world: game.world,
      zoom: ui.zoom,
    }),
    encounter: id => actions.beginBattle({id, level: game.world.map.zones[0]?.level[0] ?? 5}),
    valid: (x, y) => isWalkable(game.world, x, y),
    grass: (x, y) => !!zoneAt(game.world, x, y),
    travel: actions.travel,
    interact: actions.interact,
    objective: () => currentObjective(game.save, app.objectives, app.objCtx),
    level: id => level(game.save, id),
    maxHP: id => maxHP(game.save, id),
    effectiveness,
  };
}
