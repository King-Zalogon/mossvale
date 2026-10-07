/* Game flow: connects domain rules, menus and services. Owns timers (battle pacing) and screen transitions.
   Everything here may touch the DOM through ui/*; domain/* stays pure. */
import {species} from './data/species.js';
import {moves} from './data/moves.js';
import {regions} from './data/regions.js';
import {maxHP} from './domain/rules.js';
import {addToParty, healthyParty, clampHealth, companion, flagDone, healTeam, inParty, removeFromParty, setActive, setFlag, unlocked} from './domain/rules.js';
import {createBattle, encounterDistance, ensureHealthyCompanion, guardianLevel, resolveTurn, rollWild} from './domain/battle.js';
import {transition} from './domain/phase.js';
import {createTimeline} from './services/timeline.js';
import {buildWorld, isWalkable, nearestInteractive, triggersAt, zoneAt} from './domain/world.js';
import {findScenePath} from './domain/scene-path.js';
import {movementFacing} from './domain/exploration.js';
import {GRACE_AFTER_BATTLE, GRACE_ON_ARRIVAL} from './config.js';
import {$, environmentalMessage, hideModal, toast} from './ui/dom.js';
import {TACTICS} from './data/tactics.js';
import {spriteId} from './data/assets.js';
import {buy as buyOffer, claimChest, restAtCamp} from './domain/economy.js';
import {currentObjective, pickLine} from './domain/objectives.js';
import {endingDue, markSeen, pendingHint} from './domain/story.js';
import {renderHud, renderRegion} from './ui/hud.js';
import {discover, entryFor, landmarkLabel, reveal, SECRET_RANGE} from './domain/discovery.js';
import {applySceneActions, markSceneRun, sceneConditionHolds, sceneHasRun} from './domain/scenes.js';
import {recordObjectiveEvent, restoreObjectiveState} from './domain/objective-events.js';
import {availableDialogueChoices} from './domain/dialogue-choices.js';
import {approachedWithinRadius, companionCanUseRoute, companionRouteDiscovered, companionRouteVisible} from './domain/companion-routes.js';
import {grant as grantReward} from './domain/economy.js';
import {createSpeech} from './ui/speech.js';
import {buyInventory, commitInventory, deposit, inventoryToSupplies, sellInventory, withdraw} from './domain/inventory.js';

export function createController(app) {
  const {game, ui, audio, rng, persist, canvas, actions, menus, maps, mapsById, objCtx} = app;
  const save = () => game.save;
  let applyingObjectiveEvent = false;
  const emit = (type, data = {}) => {
    app.events?.emit(type, data);
    if (!applyingObjectiveEvent) applyOptionalObjectiveEvent(type, data);
  };
  const sfx = name => {
    emit('audio.cue', {cue: name});
    audio.play(name);
  };
  const renderBattle = (message, animation, snap, battle) => app.renderBattle(message, animation, snap, battle);
  const timeline = (app.timeline = createTimeline());
  let sceneMotion = null;
  const speech = createSpeech({ui, canvas, onEvent: emit});
  const wait = ms => (app.motionReduced() ? 250 : ms);

  function optionalObjectiveStates() {
    return (app.eventObjectives ?? []).map(definition => ({definition, state: restoreObjectiveState(definition, save().events ?? [])}));
  }

  function renderOptionalObjectives() {
    const container = $('#optional-objectives');
    const rows = optionalObjectiveStates();
    container.replaceChildren();
    container.hidden = rows.length === 0;
    for (const {definition, state} of rows) {
      const stage = definition.stages.find(item => item.id === state.stage);
      const row = document.createElement('p');
      row.className = `optional-objective ${state.status}`;
      const title = document.createElement('strong');
      title.textContent = definition.title ?? definition.id;
      const detail = document.createElement('span');
      const count = stage?.count > 1 && state.count > 0 ? ` (${state.count}/${stage.count})` : '';
      detail.textContent =
        state.status === 'rewarded' || state.status === 'complete'
          ? 'Complete · reward claimed'
          : `${state.status === 'active' ? 'In progress · ' : 'Optional · '}${stage?.label ?? stage?.id ?? ''}${count}`;
      row.append(title, detail);
      container.append(row);
    }
  }

  function applyOptionalObjectiveEvent(type, data) {
    if (!app.eventObjectives?.length) return;
    applyingObjectiveEvent = true;
    const before = structuredClone(save());
    const outcomes = [];
    try {
      for (const definition of app.eventObjectives) {
        const result = recordObjectiveEvent(save(), definition, {type, ...data}, save().mapId);
        if (result.reason === 'event-limit') {
          game.save = before;
          toast('The saved event journal is full. This optional goal could not advance.');
          return;
        }
        if (result.changed) {
          const gained = result.reward ? grantReward(save(), result.reward) : null;
          outcomes.push({definition, state: result.state, gained});
        }
      }
      if (!outcomes.length) return;
      if (!persist()) {
        game.save = before;
        toast('That goal update could not be saved, so its progress and reward were rolled back.');
        return;
      }
      refresh();
      for (const {definition, state, gained} of outcomes) {
        app.events?.emit('objective.stage', {id: definition.id, stage: state.stage, status: state.status, mapId: save().mapId});
        const rewards = gained
          ? Object.entries(gained)
              .filter(([, amount]) => amount > 0)
              .map(([key, amount]) => `${amount} ${key}`)
              .join(', ')
          : '';
        toast(
          state.status === 'rewarded'
            ? `${definition.title ?? definition.id} complete${rewards ? ` · ${rewards} earned` : ''}.`
            : `${definition.title ?? definition.id} · ${definition.stages.find(stage => stage.id === state.stage)?.label ?? state.stage}`,
        );
      }
    } finally {
      applyingObjectiveEvent = false;
    }
  }

  /** Distance to walk before the next encounter, from the zone the player stands in (or the default range). */
  const nextDistance = () => encounterDistance(zoneAt(game.world, Math.round(game.player.x), Math.round(game.player.y)), rng);

  function refresh() {
    clampHealth(save());
    const goal = app.objectives.length ? currentObjective(save(), app.objectives, objCtx) : null;
    renderHud(save(), goal);
    renderOptionalObjectives();
    if (goal && goal.id !== save().goal) {
      if (save().goal && ui.ready) toast(`New goal: ${goal.title}`); // first run and reloads stay quiet
      save().goal = goal.id;
      emit('objective.changed', {id: goal.id, step: goal.step, mapId: save().mapId});
    }
    persist();
  }

  function resetCamera() {
    ui.camera = {x: game.player.x, y: game.player.y};
  }

  /** Teleports the player (travel, camp, defeat). The companion's trail restarts so it appears beside the player. */
  function place(point) {
    Object.assign(game.player, point);
    game.trail.length = 0;
    resetCamera();
  }

  /** Brief fade-in on arrival so map changes read as a transition. Skipped for calm motion. */
  function fadeIn() {
    const el = $('#fade');
    if (!el || app.motionReduced()) return;
    el.style.transition = 'none';
    el.style.opacity = '1';
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        el.style.transition = 'opacity .35s ease-out';
        el.style.opacity = '0';
      }),
    );
  }

  function enterRegion(region) {
    let map = mapsById[save().mapId];
    if (!map || map.biome !== regions[region].biome) {
      map = maps[region];
      save().mapId = map.id;
    }
    game.world = buildWorld(map);
    renderRegion(region, map);
    audio.setRegion(regions[region].id);
  }

  function close() {
    cancelSceneMotion();
    if (game.battle?.busy || timeline.active || ui.modalMode === 'title') return; // the title screen is left with a choice, not Escape
    if (game.battle && ui.modalMode === 'battle') {
      flee();
      return;
    }
    if (game.battle && ui.modalMode === 'party') {
      renderBattle('Choose your next move.');
      return;
    }
    hideModal(ui, canvas);
    if (game.phase === 'result') {
      transition(game, 'explore');
      save().recap = '';
    }
    persist();
    const after = ui.afterModal;
    ui.afterModal = null;
    after?.(); // e.g. continue the start-up sequence after the opening card
  }

  function travel(id, spawn = 'camp') {
    cancelSceneMotion();
    const s = save();
    const fromMap = s.mapId;
    const map = typeof id === 'number' ? maps[id] : mapsById[id];
    const region = map ? regions.findIndex(r => r.biome === map.biome) : -1;
    if (!map || region < 0 || game.battle || (region !== s.region && !unlocked(s, region))) {
      toast('Awaken the previous shrine to open this trail.');
      return;
    }
    s.region = region;
    s.mapId = map.id;
    s.visited = [...new Set([...s.visited, region])];
    s.visitedMaps = [...new Set([...s.visitedMaps, map.id])];
    place(map.spawns[spawn] || map.spawns.camp);
    game.pacing.encounterCooldown = GRACE_ON_ARRIVAL;
    game.pacing.steps = 0;
    enterRegion(region);
    emit('portal.traveled', {fromMap, toMap: map.id, spawn});
    fadeIn();
    close();
    refresh();
    sfx('welcome');
    toast(`Welcome to ${map.name}. The next trail is yours.`);
  }

  function selectCompanion(id) {
    const s = save();
    if (!s.caught.includes(id) || companion(s, id).hp <= 0 || game.battle?.busy) return;
    if (game.battle) {
      if (id !== s.active && inParty(s, id)) performTurn({kind: 'switch', id});
      return;
    }
    const previous = s.active;
    const swapped = !inParty(s, id) && s.party.length >= 3;
    setActive(s, id);
    refresh();
    sfx('ready');
    close();
    toast(swapped ? `${species[id].name} joined the team in place of ${species[previous].name}.` : `${species[id].name} is ready to travel with you.`);
  }

  /** Team editing outside battle: move a companion between the team and the reserve. */
  function partyEdit(kind, id) {
    if (game.battle) return;
    const ok = kind === 'add' ? addToParty(save(), id) : removeFromParty(save(), id);
    if (!ok) return;
    refresh();
    sfx('confirm');
    menus.party();
  }

  const rangerLandmark = () => game.world.objects.find(o => o.kind === 'ranger');
  const rangerName = () => rangerLandmark()?.name ?? 'the ranger';

  function speakLandmark(o, text, onComplete, {includeChoices = true} = {}) {
    const choices = includeChoices ? availableDialogueChoices(o?.choices, save(), objCtx) : [];
    const anchor = line => {
      const actor = game.world.objects.find(object => object.ref === line.speaker) ?? o;
      return actor ? app.projectWorld(actor.x, actor.y) : null;
    };
    speech.show([{text, speaker: o?.ref ?? 'narrator', name: o?.name ?? 'Mossvale'}], anchor, onComplete, {
      choices,
      onChoice: choice => {
        const event = {mapId: save().mapId, speaker: choice.speaker, target: choice.target, choice: choice.id};
        emit('dialogue.choice', event);
        if (choice.event && choice.event.type !== 'dialogue.choice') emit(choice.event.type, {...event, ...choice.event});
        const speakerObject = game.world.objects.find(object => object.ref === choice.speaker);
        speech.show([{text: choice.reply, speaker: choice.speaker, name: speakerObject?.name ?? choice.speaker}], anchor, onComplete);
      },
    });
  }

  /** Opens the ranger menu with `message`, or the first matching line from the map data. */
  function openRanger(message) {
    const o = rangerLandmark();
    const line = message ?? pickLine(o?.lines, save(), objCtx) ?? 'Welcome back. Rest here whenever you need to.';
    speakLandmark(o, line + tip('first-ranger'), () => menus.ranger({name: o?.name ?? 'The ranger', sprite: o?.id, message: ''}), {
      includeChoices: message === undefined,
    });
  }

  function rest() {
    restAtCamp(save());
    refresh();
    sfx('rest');
    openRanger('Everyone is rested, and your supplies are topped up. Safe travels!');
  }

  function buy(offerId) {
    const result = buyOffer(save(), offerId);
    if (!result.ok) {
      openRanger(
        result.reason === 'full'
          ? 'Your bag is already full of those. Come back when you have used some.'
          : 'You are a little short on coins for that one. Chests and battles will fill your pockets.',
      );
      return;
    }
    refresh();
    sfx('buy');
    openRanger(result.offer.thanks);
  }

  function inventoryTransaction(action) {
    const rules = app.inventoryRules;
    if (!rules || !save().inventory) return {ok: false, reason: 'unavailable'};
    const previous = save();
    const result = commitInventory(save().inventory, action, draft => {
      const next = inventoryToSupplies(draft, previous, rules);
      next.inventory = draft;
      game.save = next;
      if (persist()) return true;
      game.save = previous;
      return false;
    });
    if (!result.ok) {
      toast(result.reason === 'persist' ? 'The change could not be saved. Your bag was left as it was.' : 'That item change is not available.');
      return result;
    }
    refresh();
    sfx('buy');
    menus.inventory();
    return result;
  }

  function buyPackItem(item) {
    return inventoryTransaction(draft => buyInventory(draft, item, 1, app.inventoryRules));
  }

  function movePackItem(item, from) {
    return inventoryTransaction(draft => (from === 'bag' ? deposit : withdraw)(draft, item, 1, app.inventoryRules));
  }

  function sellPackItem(item) {
    return inventoryTransaction(draft => sellInventory(draft, item, 1, app.inventoryRules));
  }

  function returnToCamp() {
    if (game.battle) {
      toast('Finish your encounter before returning to camp.');
      return;
    }
    place((mapsById[save().mapId] ?? maps[save().region]).spawns.camp);
    game.pacing.encounterCooldown = GRACE_ON_ARRIVAL;
    game.pacing.steps = 0;
    close();
    persist();
    toast(`Back at camp. Talk to ${rangerName()} to rest.`);
  }

  function nearest() {
    const object = nearestInteractive(game.world, game.player);
    return object && companionRouteVisible(save(), game.world.map.id, object) ? object : null;
  }

  /** Marks what the player can see as explored and notes landmarks they have come across (domain/discovery.js). */
  let exploredAt = '';
  let previousRoutePosition = null;
  function discoverRoute(o) {
    const mapId = game.world.map.id;
    const route = o.route;
    if (companionRouteDiscovered(save(), mapId, route.id)) return true;
    const before = structuredClone(save());
    if (!markSceneRun(save(), mapId, `route-${route.id}`)) {
      toast('This adventure has reached its saved event limit.');
      return false;
    }
    const reward = grantReward(save(), route.reward);
    if (!persist()) {
      game.save = before;
      toast('This route could not be saved, so it remains undiscovered.');
      return false;
    }
    refresh();
    emit('route.unlocked', {mapId, routeId: route.id});
    emit('reward.granted', {source: 'route', target: o.ref ?? o.id, ...reward});
    sfx('chest');
    toast(route.unlockedText);
    return true;
  }

  function discoverCompanionRoutes(map) {
    const here = {mapId: map.id, x: game.player.x, y: game.player.y};
    const previous = previousRoutePosition;
    previousRoutePosition = here;
    if (!previous || previous.mapId !== here.mapId || Math.hypot(here.x - previous.x, here.y - previous.y) < 1e-4) return;
    for (const o of game.world.objects) {
      if (!o.route || companionRouteDiscovered(save(), map.id, o.route.id)) continue;
      if (!companionCanUseRoute(o.route, species[save().active])) continue;
      if (approachedWithinRadius(previous, here, o, SECRET_RANGE)) discoverRoute(o);
    }
  }

  function explore() {
    const map = game.world.map;
    if (!map?.size) return;
    discoverCompanionRoutes(map);
    const key = `${map.id}:${Math.floor(game.player.x / 2)},${Math.floor(game.player.y / 2)}`; // every couple of tiles, not every frame
    if (key === exploredAt) return;
    exploredAt = key;
    const {w, h} = map.size;
    const explored = (save().explored ??= {});
    const entry = entryFor(explored, map.id, w, h);
    reveal(entry, w, h, game.player.x, game.player.y);
    const discoverable = game.world.objects.filter(o => !o.route && !o.routeHint);
    for (const o of discover(entry, discoverable, game.player.x, game.player.y)) if (o.secret) toast(`You found something hidden: ${landmarkLabel(o)}.`);
  }

  let lastInteract = -Infinity;
  const INTERACT_COOLDOWN_MS = 250;
  const sealOf = flag => regions.find(r => r.id === flag.split('.')[0]).seal.toLowerCase();

  function interact() {
    if (ui.speechActive) {
      speech.advance();
      return;
    }
    if (game.battle || ui.modalMode || ui.paused) return;
    if (ui.now - lastInteract < INTERACT_COOLDOWN_MS && ui.now >= lastInteract) return; // double taps do nothing
    lastInteract = ui.now;
    const o = nearest();
    if (!o) {
      const t = triggersAt(game.world, game.player, 'interact')[0];
      if (t) runTrigger(t);
      else toast('Follow the trail, or wander into tall grass to meet a friend.');
      return;
    }
    emit('interaction.used', {mapId: game.world.map.id, target: o.ref ?? o.id ?? o.kind, kind: o.kind});
    const s = save();
    sfx('tap');
    if (o.kind === 'ranger') openRanger();
    else if (o.kind === 'sign') speakLandmark(o, o.text ?? pickLine(o.lines, s, objCtx), undefined);
    else if (o.kind === 'chest') {
      const got = claimChest(s, o);
      if (!got) {
        toast('This treasure chest is empty. The next island may have another.');
        return;
      }
      refresh();
      emit('reward.granted', {source: 'chest', target: o.ref ?? o.id, coins: got.coins, potions: got.potions, orbs: got.orbs});
      sfx('chest');
      showResult({
        title: 'A little trail treasure',
        copy: 'Something useful for the road ahead.',
        sprite: spriteId('chest-wooden'),
        rewards: [`${got.coins} coins`, `${got.potions} potions`, `${got.orbs} capture orbs`],
        button: 'Keep exploring',
        onContinue: () => (close(), checkEnding()),
      });
    } else if (o.kind === 'gate') {
      if (o.requires && !flagDone(s, o.requires)) toast(`This trail opens when you earn the ${sealOf(o.requires)}. Visit the blue shrine marker.`);
      else if (o.route) {
        const discovered = companionRouteDiscovered(s, game.world.map.id, o.route.id);
        if (!discovered && !companionCanUseRoute(o.route, species[s.active])) {
          toast(o.route.hint);
          return;
        }
        if (!discovered) {
          if (!discoverRoute(o)) return;
        }
        travel(o.target, o.spawn);
      } else travel(o.target, o.spawn);
    } else if (o.kind === 'shrine') shrine(o);
  }

  function runTrigger(t) {
    emit('interaction.triggered', {mapId: game.world.map.id, target: t.id, trigger: t.on});
    if (t.once) {
      if (game.firedTriggers.has(`${game.world.map.id}/${t.id}`)) return;
      game.firedTriggers.add(`${game.world.map.id}/${t.id}`);
    }
    for (const a of t.actions) {
      if (a.type === 'toast') toast(a.text);
      else if (a.type === 'environment') environmentalMessage(a.text);
      else if (a.type === 'battle') beginBattle({id: a.id, level: a.level}); // a scripted wild encounter
    }
    for (const event of t.events ?? []) {
      if (!event.repeatable && sceneHasRun(save(), game.world.map.id, event.id)) continue;
      if (!sceneConditionHolds(event, save(), objCtx)) continue;
      const before = structuredClone(save());
      if (!event.repeatable && !markSceneRun(save(), game.world.map.id, event.id)) {
        toast('This adventure has reached its saved event limit.');
        continue;
      }
      const result = applySceneActions(save(), event, {setFlag: flag => setFlag(save(), flag)});
      if (result.reward) grantReward(save(), result.reward);
      if (!persist()) {
        game.save = before;
        refresh();
        toast('That scene could not be saved, so its progress and rewards were rolled back.');
        continue;
      } // durable results are committed before cancellable scene presentation begins
      const mapId = game.world.map.id;
      const present = () => {
        if (mapId !== game.world.map.id || ui.paused || ui.modalMode || !result.dialogue.length) return;
        const lines = result.dialogue.map(line => {
          const actor = line.speaker === 'player' ? null : game.world.objects.find(object => object.ref === line.speaker);
          return {...line, name: actor?.name ?? (line.speaker === 'player' ? 'You' : line.speaker === 'narrator' ? 'Mossvale' : actor?.kind)};
        });
        speech.show(lines, line => {
          if (line.speaker === 'player') return app.projectWorld(game.player.x, game.player.y);
          const actor = game.world.objects.find(object => object.ref === line.speaker);
          return actor ? app.projectWorld(actor.x, actor.y) : null;
        });
      };
      const continueEvent = async () => {
        let status = {status: 'arrived'};
        if (result.choreography.length) status = await playSceneChoreography(result.choreography, mapId);
        emit('scene.choreography', {mapId, eventId: event.id, status: status.status, actor: status.actor});
        present();
        if (result.challenge && mapId === game.world.map.id && !ui.paused && !ui.modalMode) beginBattle(result.challenge);
      };
      if (result.choreography.length) void continueEvent();
      else {
        present();
        if (result.challenge) beginBattle(result.challenge);
      }
    }
  }

  function sceneActor(id) {
    if (id === 'player') return game.player;
    return game.world.objects.find(object => object.ref === id && object.kind === 'ranger') ?? null;
  }

  function cancelSceneMotion() {
    const task = sceneMotion;
    if (!task) return;
    task.cancelled = true;
    clearTimeout(task.timer);
    task.releaseDelay?.();
    sceneMotion = null;
    ui.sceneBusy = false;
    ui.sceneMoving = false;
    ui.keys = {};
    ui.touch = null;
    for (const object of game.world.objects) object.sceneMoving = false;
  }

  async function playSceneChoreography(actions, mapId) {
    cancelSceneMotion();
    const task = {cancelled: false, timer: null, releaseDelay: null};
    sceneMotion = task;
    ui.sceneBusy = true;
    ui.sceneMoving = false;
    ui.keys = {};
    ui.touch = null;
    const delay = ms =>
      new Promise(resolve => {
        task.releaseDelay = resolve;
        task.timer = setTimeout(() => {
          task.releaseDelay = null;
          resolve();
        }, ms);
      });
    try {
      for (const action of actions) {
        if (task.cancelled || game.world.map.id !== mapId) return {status: 'cancelled', actor: action.actor};
        if (action.type === 'wait') {
          await delay(app.motionReduced() ? Math.min(action.ms, 80) : action.ms);
          continue;
        }
        const actor = sceneActor(action.actor);
        if (!actor) return {status: 'blocked', actor: action.actor};
        if (action.type === 'face') {
          const target = sceneActor(action.target);
          if (!target) return {status: 'blocked', actor: action.actor};
          const dir = movementFacing(target.x - actor.x, target.y - actor.y);
          if (dir !== null) {
            if (action.actor === 'player') actor.dir = dir;
            else actor.sceneDir = dir;
          }
          continue;
        }
        if (action.type === 'react') {
          actor.sceneReaction = action.pose;
          actor.sceneReactionUntil = ui.now + (app.motionReduced() ? 400 : 900);
          continue;
        }
        if (action.type !== 'move') continue;
        const route = findScenePath(game.world, actor, action.to);
        if (route.status !== 'arrived') return {status: 'blocked', actor: action.actor};
        const waypoints = [...route.path];
        if (!waypoints.length && Math.hypot(action.to[0] - actor.x, action.to[1] - actor.y) > 0.01) waypoints.push({x: action.to[0], y: action.to[1]});
        for (const point of waypoints) {
          const from = {x: actor.x, y: actor.y};
          if (!isWalkable(game.world, point.x, point.y)) return {status: 'blocked', actor: action.actor};
          const others = ['player', ...game.world.objects.filter(object => object.kind === 'ranger').map(object => object.ref)]
            .filter(id => id !== action.actor)
            .map(sceneActor)
            .filter(Boolean);
          if (others.some(other => Math.hypot(other.x - point.x, other.y - point.y) < 0.34)) return {status: 'blocked', actor: action.actor};
          const distance = Math.hypot(point.x - from.x, point.y - from.y);
          const duration = app.motionReduced() ? 1 : Math.max(90, Math.min(320, distance * 190));
          const start = performance.now();
          let lastProgress = 0;
          actor.sceneMoving = true;
          ui.sceneMoving = action.actor === 'player';
          while (true) {
            await delay(app.motionReduced() ? duration : 32);
            if (task.cancelled || game.world.map.id !== mapId) return {status: 'cancelled', actor: action.actor};
            const progress = Math.min(1, app.motionReduced() ? 1 : (performance.now() - start) / duration);
            actor.x = from.x + (point.x - from.x) * progress;
            actor.y = from.y + (point.y - from.y) * progress;
            const dir = movementFacing(point.x - from.x, point.y - from.y);
            if (dir !== null) {
              if (action.actor === 'player') {
                actor.dir = dir;
                actor.walkDistance = (actor.walkDistance ?? 0) + distance * (progress - lastProgress);
              } else actor.sceneDir = dir;
            }
            lastProgress = progress;
            if (progress >= 1) break;
          }
        }
        actor.sceneMoving = false;
        ui.sceneMoving = false;
      }
      return {status: 'arrived'};
    } finally {
      if (sceneMotion === task) {
        sceneMotion = null;
        ui.sceneBusy = false;
        ui.sceneMoving = false;
        for (const object of game.world.objects) object.sceneMoving = false;
      }
    }
  }

  /** Called every frame from the main loop: fires 'enter' triggers the player is standing in. */
  function checkTriggers() {
    for (const t of triggersAt(game.world, game.player, 'enter')) runTrigger(t);
  }

  function shrine(o) {
    const s = save();
    const r = regions[s.region];
    if (flagDone(s, o.flag)) {
      toast(`The ${r.seal.toLowerCase()} glows warmly. This shrine is awake.`);
      return;
    }
    if (s.caught.length < 2) {
      toast('The shrine stirs… Befriend a wild creature before challenging its guardian.');
      return;
    }
    menus.shrine(o);
  }

  /** Opens a result screen while retaining its short recap until the player acknowledges the result. */
  function showResult(descriptor) {
    transition(game, 'result');
    persist();
    const {onContinue, onSecondary, ...result} = descriptor;
    menus.result({
      ...result,
      onContinue: () => {
        save().recap = '';
        persist();
        (onContinue ?? close)();
      },
      onSecondary: onSecondary
        ? () => {
            save().recap = '';
            persist();
            onSecondary();
          }
        : undefined,
    });
  }

  /** The unseen tip for `event` as a sentence to append to a message, marking it seen. Empty when none. */
  function tip(event) {
    const hint = pendingHint(app.story, event, save());
    if (!hint) return '';
    markSeen(save(), hint.id);
    return ' ' + hint.text;
  }

  /** Opening card on a brand-new adventure. Returns whether it was shown; `next` runs when it is closed. */
  function showPremise(next) {
    const premise = app.story?.premise;
    const s = save();
    if (app.skipPremise || !premise || s.hints.includes('premise') || s.met || s.wins > 0 || s.caught.length > 1 || s.badges.length) return false;
    markSeen(s, 'premise');
    persist();
    ui.afterModal = next;
    menus.story(premise);
    return true;
  }

  /** The ending, once: marks the adventure complete (the world stays open for roaming and collecting). */
  function checkEnding() {
    const ending = endingDue(app.story, save(), objCtx);
    if (!ending || ui.modalMode || game.battle) return false;
    save().completed = true;
    persist();
    menus.story(ending);
    return true;
  }

  function beginBattle(spec) {
    cancelSceneMotion();
    if (game.battle || !transition(game, 'battle')) return;
    const s = save();
    if (!ensureHealthyCompanion(s)) {
      transition(game, 'explore');
      toast(`Your team needs a rest. Talk to ${rangerName()} at camp.`);
      return;
    }
    timeline.cancel();
    game.battle = createBattle(s, rng, spec);
    emit(spec.boss ? 'challenge.started' : 'battle.started', {
      mapId: game.world.map.id,
      species: species[game.battle.id].id,
      level: game.battle.level,
      boss: !!spec.boss,
    });
    refresh();
    sfx(spec.boss ? 'guardian' : 'encounter');
    renderBattle(
      `${spec.boss ? 'The shrine guardian' : 'A wild ' + species[game.battle.id].name} appeared! ${spec.boss && TACTICS[spec.tactic] ? TACTICS[spec.tactic].intro : 'Choose your next move.'}${spec.boss ? '' : tip('first-battle')}${healthyParty(save()).length > 1 ? tip('can-switch') : ''}`,
    );
  }

  /** Wild encounter from an encounter zone. */
  function startWild(zone) {
    if (game.battle || game.phase !== 'explore') return;
    if (!ensureHealthyCompanion(save())) {
      toast(`Your team needs a rest. Talk to ${rangerName()} at camp.`);
      return;
    }
    beginBattle(rollWild(save(), rng, zone));
  }

  /** Shrine guardian `{id, level}` from map data. */
  function startGuardian(guardian) {
    beginBattle({id: guardian.id, level: guardianLevel(save(), guardian), boss: true, tactic: guardian.tactic, power: guardian.power});
  }

  /** Re-opens an encounter that was saved mid-fight. Invalid leftovers are dropped without penalty. */
  function resumeBattle() {
    const s = save();
    const b = game.battle;
    if (!b) return false;
    const stale = (b.boss && flagDone(s, `${regions[s.region].id}.seal`)) || !ensureHealthyCompanion(s);
    if (stale || !transition(game, 'battle')) {
      if (!ensureHealthyCompanion(s)) healTeam(s);
      game.battle = null;
      game.phase = 'explore';
      refresh();
      return false;
    }
    b.busy = false;
    emit('battle.resumed', {mapId: s.mapId, species: species[b.id].id, turn: b.turn, boss: b.boss});
    renderBattle('Your encounter was waiting for you. Choose your next move.');
    return true;
  }

  function battleAction(kind) {
    performTurn({kind});
  }

  /** Resolves a full round in the domain at once (and saves it), then replays it as timed frames. */
  function performTurn(action) {
    const b = game.battle;
    if (!b || b.busy || b.over || game.phase !== 'battle' || (ui.modalMode !== 'battle' && action.kind !== 'switch')) return;
    const s = save();
    const before = {active: s.active};
    const turn = resolveTurn(s, b, action, rng, {
      sealReward: game.world.objects.find(o => o.kind === 'shrine')?.reward,
      inventoryRules: app.inventoryRules,
    });
    if (!turn) return;
    emit('turn.resolved', {
      mapId: game.world.map.id,
      species: species[b.id].id,
      turn: b.turn,
      action: action.kind,
      ended: turn.ended,
      events: turn.events.map(event => ({type: event.type, damage: event.damage, healed: event.healed, reward: event.reward, xp: event.xp})),
    });
    if (action.kind === 'catch') emit('capture.attempted', {mapId: game.world.map.id, species: species[b.id].id, ended: turn.ended});
    if (turn.ended === 'caught') {
      const capture = turn.events.find(event => event.type === 'caught');
      emit('capture.completed', {species: species[b.id].id, isNew: capture.isNew, joined: capture.joined});
      emit('reward.granted', {source: 'capture', species: species[b.id].id, coins: capture.coins, xp: capture.xp, itemRewards: capture.itemRewards});
    } else if (turn.ended === 'win') {
      const reward = turn.events.find(event => event.type === 'win');
      emit('reward.granted', {
        source: reward.newSeal ? 'shrine' : 'battle',
        species: species[b.id].id,
        coins: reward.reward,
        xp: reward.xp,
        newSeal: reward.newSeal,
        counterplay: reward.responseLabels,
        itemRewards: reward.itemRewards,
      });
    }
    b.busy = true;
    const frames = framesFor(turn, before, b);
    if (!turn.ended && companion(s).hp < maxHP(s, s.active) * 0.35 && frames.length) frames.at(-1).message += tip('low-health');
    if (turn.ended) {
      game.battle = null;
      game.pacing.steps = 0;
      game.pacing.encounterAt = nextDistance();
      game.pacing.encounterCooldown = GRACE_AFTER_BATTLE;
      transition(game, 'result');
      if (turn.ended === 'loss') {
        place((mapsById[s.mapId] ?? maps[s.region]).spawns.camp);
      }
      s.recap = recapFor(turn, b);
    }
    refresh();
    timeline.play(frames, {
      render: f => {
        if (f.sfx) sfx(f.sfx);
        renderBattle(f.message, f.animation, f.after, b);
      },
      done: () => finishPlayback(turn, b),
    });
  }

  function finishPlayback(turn, b) {
    if (!turn.ended) {
      b.busy = false;
      if (game.battle === b) renderBattle(lastMessage, '');
      return;
    }
    showEnd(turn, b);
  }

  let lastMessage = '';

  /** One line describing the enemy's turn. */
  function enemyText(foe, e) {
    if (e.action === 'charge')
      return `${foe.name} is gathering strength…${e.interrupted ? ' Your elemental pressure disrupts the recovery.' : e.recovered ? ` The current restores ${e.recovered} HP.` : ''}`;
    if (e.action === 'brace') return `${foe.name} braces itself. Quick strikes glance off; an elemental move breaks through.`;
    const hit =
      e.action === 'heavy'
        ? `${foe.name} unleashes a heavy blow for ${e.damage} damage!`
        : `${foe.name} used ${e.element ? (moves[foe.move]?.name ?? foe.move) : 'Quick strike'} for ${e.damage} damage.`;
    return `${hit}${e.counter ? ` Your Guard ripostes for ${e.counter} damage.` : ''}`;
  }

  /** Turns resolved events into display frames (presentation only; no state changes). */
  function framesFor(turn, before, b) {
    const frames = [];
    let player = '';
    for (const e of turn.events) {
      const a = species[e.type === 'switch' ? e.id : before.active];
      if (e.type === 'strike') {
        player = `${species[before.active].name} used ${e.move} for ${e.damage} damage.${e.brokeBrace ? ' It broke through the brace!' : e.braced ? ' It was braced for the hit.' : e.eff > 1 ? ' Super effective!' : e.eff < 1 ? ' Not very effective.' : ''}`;
        frames.push({
          message: player,
          animation: e.kind === 'element' ? 'element' : 'attack',
          after: e.after,
          sfx: e.kind === 'element' ? 'element' : 'strike',
          wait: wait(650),
        });
      } else if (e.type === 'throw') {
        player = 'The creature broke free of the orb.';
        frames.push({message: 'The orb glows… will your new friend stay?', animation: 'capture', after: e.after, sfx: 'throw', wait: wait(850)});
      } else if (e.type === 'break-free') {
        frames.push({message: 'The creature broke free of the orb!', animation: '', after: e.after, sfx: 'broke', wait: wait(650)});
      } else if (e.type === 'potion' || e.type === 'item') {
        const itemName = e.item && app.inventoryRules?.items?.[e.item]?.name;
        player = `${species[before.active].name} recovered ${e.healed} HP${itemName ? ` with ${itemName}` : ''}.`;
        frames.push({message: player, animation: '', after: e.after, sfx: 'heal', wait: wait(650)});
      } else if (e.type === 'guard') {
        player = `${species[before.active].name} braced for the next hit.`;
        frames.push({message: player, animation: '', after: e.after, sfx: 'guard', wait: wait(650)});
      } else if (e.type === 'switch') {
        player = `${a.name} joined the encounter.`;
        frames.push({message: `${a.name} joined the encounter!`, animation: '', after: e.after, sfx: 'join', wait: wait(650)});
      } else if (e.type === 'enemy') {
        const foe = species[b.id];
        frames.push({
          message: `${player} ${enemyText(foe, e)}`,
          animation: e.damage > 0 ? 'enemy' : '',
          after: e.after,
          sfx: 'hurt',
          wait: 0,
        });
      } else if (e.type === 'faint-switch') {
        frames[frames.length - 1] = {
          message: `${species[e.fainted].name} needs a rest. ${species[e.replacement].name} stepped in!`,
          animation: 'enemy',
          after: e.after,
          sfx: 'hurt',
          wait: 0,
        };
      }
    }
    lastMessage = frames.at(-1)?.message ?? '';
    if (turn.ended === 'win' || turn.ended === 'caught')
      frames.push({message: lastMessage, animation: turn.ended === 'win' ? 'attack' : 'capture', after: turn.events.at(-1).after, wait: 0});
    return frames;
  }

  function recapFor(turn, b) {
    const last = turn.events.at(-1);
    const itemText = rewards =>
      rewards?.length ? ` · ${rewards.map(({item, quantity}) => `${quantity} ${app.inventoryRules?.items?.[item]?.name ?? item}`).join(', ')}` : '';
    if (turn.ended === 'win')
      return last.newSeal
        ? `${regions[save().region].seal} awakened! +${last.reward} coins${itemText(last.itemRewards)}${last.responseLabels?.length ? ` · ${last.responseLabels.join(', ')}` : ''}.`
        : `You defeated ${species[b.id].name}: +${last.reward} coins, ${last.xp} XP${itemText(last.itemRewards)}${last.responseLabels?.length ? ` · ${last.responseLabels.join(', ')}` : ''}.`;
    if (turn.ended === 'caught')
      return last.isNew
        ? `${species[b.id].name} became your friend! +10 coins, 20 XP${itemText(last.itemRewards)}.`
        : `${species[b.id].name} was released happily: +10 coins, 20 XP${itemText(last.itemRewards)}.`;
    return 'Your team was defeated and rested at camp. Everyone is healed.';
  }

  /** Shows the result screen for a finished encounter. State was already applied when the turn resolved. */
  function showEnd(turn, b) {
    const s = save();
    const last = turn.events.at(-1);
    const r = regions[s.region];
    if (turn.ended === 'win') {
      sfx(last.newSeal ? 'seal' : 'win');
      const next = last.newSeal && s.region < regions.length - 1;
      showResult({
        title: last.newSeal ? r.seal + ' awakened!' : 'A little stronger.',
        copy: last.newSeal
          ? s.region < regions.length - 1
            ? `The eastern trail to ${regions[s.region + 1].name} is open. Your team is rested and ready.`
            : `All ${regions.length} shrines shine again. You’ve become a keeper of the Verdant Isles!`
          : `${species[b.id].name} retreated into the wild.`,
        id: b.id,
        rewards: [
          last.reward + ' coins',
          last.xp + ' XP',
          ...(last.potions ? [`${last.potions} potions`] : []),
          ...(last.responseCoins ? [`+${last.responseCoins} counterplay coins`] : []),
          ...(last.itemRewards ?? []).map(({item, quantity}) => `${quantity} ${app.inventoryRules?.items?.[item]?.name ?? item}`),
        ],
        note: last.xpText,
        button: next ? 'Visit ' + regions[s.region + 1].short : 'Back to the trail',
        onContinue: next ? () => travel(s.region + 1) : () => (close(), checkEnding()),
      });
    } else if (turn.ended === 'caught') {
      sfx('caught');
      showResult({
        title: last.isNew ? species[last.id].name + ' is your new friend!' : 'Another friendly face.',
        copy: last.isNew
          ? last.joined === 'reserve'
            ? 'Your team is full, so they wait in the reserve. Swap them in from the companion screen any time.'
            : 'Choose them from your companion team to travel and battle together.'
          : `You already befriended ${species[last.id].name}. This one heads home happily.`,
        id: last.id,
        rewards: [
          `${last.coins} coins`,
          `${last.xp} XP`,
          ...(last.itemRewards ?? []).map(({item, quantity}) => `${quantity} ${app.inventoryRules?.items?.[item]?.name ?? item}`),
        ],
        note: last.xpText,
        button: 'Keep exploring',
        secondary: last.isNew ? 'Travel with ' + species[last.id].name : undefined,
        onSecondary: () => {
          s.active = last.id;
          refresh();
          close();
          toast(species[last.id].name + ' is ready for the trail.');
        },
      });
    } else {
      showResult({
        title: 'A fresh start at camp.',
        copy: `${rangerName()} brought your team back safely. Everyone is rested. Try switching companions or using potions next time.`,
        id: last.id,
        rewards: ['Team fully healed'],
        button: 'Back to the trail',
      });
    }
  }

  function flee() {
    if (!game.battle || game.battle.busy) return;
    timeline.cancel();
    game.battle = null;
    game.pacing.steps = 0;
    game.pacing.encounterAt = nextDistance();
    game.pacing.encounterCooldown = GRACE_AFTER_BATTLE;
    transition(game, 'explore');
    emit('battle.interrupted', {mapId: game.world.map.id, turn: game.save.battle?.turn ?? 0});
    hideModal(ui, canvas);
    refresh();
    toast('You returned safely to the trail.');
  }

  /** Called when the tab is hidden or the page is leaving: skip animations, keep the (already saved) state. */
  function flushPlayback() {
    cancelSceneMotion();
    timeline.flush();
  }

  Object.assign(actions, {
    close,
    cancelSceneMotion,
    travel,
    selectCompanion,
    partyEdit,
    rest,
    buy,
    buyPackItem,
    movePackItem,
    sellPackItem,
    returnToCamp,
    interact,
    startWild,
    startGuardian,
    beginBattle,
    showPremise,
    checkEnding,
    openRanger,
    checkTriggers,
    explore,
    battleAction,
    performTurn,
    resumeBattle,
    flushPlayback,
    flee,
    refresh,
    enterRegion,
    resetCamera,
    nearest,
    advanceSpeech: () => speech.advance(),
    dismissSpeech: () => speech.dismiss(),
    positionSpeech: () => speech.position(),
    previewSpeech: lines =>
      speech.show(
        lines.map(line => {
          const actor = line.speaker === 'player' ? null : game.world.objects.find(object => object.ref === line.speaker);
          return {...line, name: line.name ?? actor?.name ?? (line.speaker === 'player' ? 'You' : line.speaker === 'narrator' ? 'Mossvale' : undefined)};
        }),
        line => {
          const actor = line.speaker === 'player' ? game.player : game.world.objects.find(object => object.ref === line.speaker);
          return actor ? app.projectWorld(actor.x, actor.y) : null;
        },
      ),
    renderBattle,
    party: () => menus.party(),
    worldMap: () => (cancelSceneMotion(), menus.worldMap()),
    journal: () => (cancelSceneMotion(), menus.journal()),
    menu: () => (cancelSceneMotion(), menus.mainMenu()),
  });
  return actions;
}
