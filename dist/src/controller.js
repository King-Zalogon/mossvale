/* Game flow: connects domain rules, menus and services. Owns timers (battle pacing) and screen transitions.
   Everything here may touch the DOM through ui/*; domain/* stays pure. */
import {species} from './data/species.js';
import {regions} from './data/regions.js';
import {addToParty, clampHealth, companion, flagDone, healTeam, inParty, removeFromParty, setActive, unlocked} from './domain/rules.js';
import {createBattle, ensureHealthyCompanion, resolveTurn, rollWild} from './domain/battle.js';
import {transition} from './domain/phase.js';
import {createTimeline} from './services/timeline.js';
import {buildWorld, nearestInteractive, triggersAt} from './domain/world.js';
import {$, hideModal, toast} from './ui/dom.js';
import {TACTICS} from './data/tactics.js';
import {buy as buyOffer, claimChest, restAtCamp} from './domain/economy.js';
import {currentObjective, pickLine} from './domain/objectives.js';
import {renderHud, renderRegion} from './ui/hud.js';

export function createController(app) {
  const {game, ui, audio, rng, persist, canvas, actions, menus, maps, objCtx} = app;
  const save = () => game.save;
  const tone = (f, d) => audio.tone(f, d);
  const renderBattle = (message, animation, snap, battle) => app.renderBattle(message, animation, snap, battle);
  const timeline = (app.timeline = createTimeline());
  const wait = ms => (app.motionReduced() ? 250 : ms);

  function refresh() {
    clampHealth(save());
    const goal = app.objectives.length ? currentObjective(save(), app.objectives, objCtx) : null;
    renderHud(save(), goal);
    if (goal && goal.id !== save().goal) {
      if (save().goal && ui.ready) toast(`New goal: ${goal.title}`); // first run and reloads stay quiet
      save().goal = goal.id;
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
    game.world = buildWorld(maps[region]);
    renderRegion(region);
  }

  function close() {
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
    if (game.phase === 'result') transition(game, 'explore');
    persist();
  }

  function travel(id, spawn = 'camp') {
    const s = save();
    if (game.battle || !unlocked(s, id)) {
      toast('Awaken the previous shrine to open this trail.');
      return;
    }
    s.region = id;
    s.visited = [...new Set([...s.visited, id])];
    place(maps[id].spawns[spawn] || maps[id].spawns.camp);
    game.pacing.encounterCooldown = 3;
    game.pacing.steps = 0;
    enterRegion(id);
    fadeIn();
    close();
    refresh();
    tone(600);
    toast(`Welcome to ${regions[id].name}. The next chapter is yours.`);
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
    tone(560);
    close();
    toast(swapped ? `${species[id].name} joined the team in place of ${species[previous].name}.` : `${species[id].name} is ready to travel with you.`);
  }

  /** Team editing outside battle: move a companion between the team and the reserve. */
  function partyEdit(kind, id) {
    if (game.battle) return;
    const ok = kind === 'add' ? addToParty(save(), id) : removeFromParty(save(), id);
    if (!ok) return;
    refresh();
    tone(520);
    menus.party();
  }

  const rangerLandmark = () => game.world.objects.find(o => o.kind === 'ranger');
  const rangerName = () => rangerLandmark()?.name ?? 'the ranger';

  /** Opens the ranger menu with `message`, or the first matching line from the map data. */
  function openRanger(message) {
    const o = rangerLandmark();
    menus.ranger({name: o?.name ?? 'The ranger', message: message ?? pickLine(o?.lines, save(), objCtx) ?? 'Welcome back. Rest here whenever you need to.'});
  }

  function rest() {
    restAtCamp(save());
    refresh();
    tone(640);
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
    tone(520);
    openRanger(result.offer.thanks);
  }

  function returnToCamp() {
    if (game.battle) {
      toast('Finish your encounter before returning to camp.');
      return;
    }
    place(maps[save().region].spawns.camp);
    game.pacing.encounterCooldown = 3;
    game.pacing.steps = 0;
    close();
    persist();
    toast(`Back at camp. Talk to ${rangerName()} to rest.`);
  }

  function nearest() {
    return nearestInteractive(game.world, game.player);
  }

  let lastInteract = -Infinity;
  const INTERACT_COOLDOWN_MS = 250;
  const sealOf = flag => regions.find(r => r.id === flag.split('.')[0]).seal.toLowerCase();

  function interact() {
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
    const s = save();
    tone(480);
    if (o.kind === 'ranger') openRanger();
    else if (o.kind === 'sign') toast(o.text ?? pickLine(o.lines, s, objCtx));
    else if (o.kind === 'chest') {
      const got = claimChest(s, o);
      if (!got) {
        toast('This treasure chest is empty. The next island may have another.');
        return;
      }
      refresh();
      showResult({
        title: 'A little trail treasure',
        copy: 'Something useful for the road ahead.',
        sprite: 23,
        rewards: [`${got.coins} coins`, `${got.potions} potions`, `${got.orbs} capture orbs`],
        button: 'Keep exploring',
      });
    } else if (o.kind === 'gate') {
      if (o.requires && !flagDone(s, o.requires)) toast(`This trail opens when you earn the ${sealOf(o.requires)}. Visit the blue shrine marker.`);
      else travel(o.target, o.spawn);
    } else if (o.kind === 'shrine') shrine(o);
  }

  function runTrigger(t) {
    if (t.once) {
      if (game.firedTriggers.has(`${game.world.map.id}/${t.id}`)) return;
      game.firedTriggers.add(`${game.world.map.id}/${t.id}`);
    }
    for (const a of t.actions) if (a.type === 'toast') toast(a.text);
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

  /** Opens a result screen: phase 'result', and the pending recap (shown after a reload) is no longer needed. */
  function showResult(descriptor) {
    transition(game, 'result');
    save().recap = '';
    persist();
    menus.result(descriptor);
  }

  function beginBattle(spec) {
    if (game.battle || !transition(game, 'battle')) return;
    const s = save();
    if (!ensureHealthyCompanion(s)) {
      transition(game, 'explore');
      toast(`Your team needs a rest. Talk to ${rangerName()} at camp.`);
      return;
    }
    timeline.cancel();
    game.battle = createBattle(s, rng, spec);
    refresh();
    tone(spec.boss ? 230 : 660);
    renderBattle(
      `${spec.boss ? 'The shrine guardian' : 'A wild ' + species[game.battle.id].name} appeared! ${spec.boss && TACTICS[spec.tactic] ? TACTICS[spec.tactic].intro : 'Choose your next move.'}`,
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
    beginBattle({id: guardian.id, level: guardian.level, boss: true, tactic: guardian.tactic, power: guardian.power});
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
    const turn = resolveTurn(s, b, action, rng, {sealReward: game.world.objects.find(o => o.kind === 'shrine')?.reward});
    if (!turn) return;
    b.busy = true;
    const frames = framesFor(turn, before, b);
    if (turn.ended) {
      game.battle = null;
      game.pacing.steps = 0;
      game.pacing.encounterAt = 4 + rng() * 3;
      game.pacing.encounterCooldown = 4;
      transition(game, 'result');
      if (turn.ended === 'loss') {
        place(maps[s.region].spawns.camp);
      }
      s.recap = recapFor(turn, b);
    }
    refresh();
    timeline.play(frames, {
      render: f => {
        if (f.tone) tone(...f.tone);
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
    if (e.action === 'charge') return `${foe.name} is gathering strength…`;
    if (e.action === 'brace') return `${foe.name} braces itself. Your next attack will glance off.`;
    if (e.action === 'heavy') return `${foe.name} unleashes a heavy blow for ${e.damage} damage!`;
    return `${foe.name} used ${e.element ? foe.move : 'Quick strike'} for ${e.damage} damage.`;
  }

  /** Turns resolved events into display frames (presentation only; no state changes). */
  function framesFor(turn, before, b) {
    const frames = [];
    let player = '';
    for (const e of turn.events) {
      const a = species[e.type === 'switch' ? e.id : before.active];
      if (e.type === 'strike') {
        player = `${species[before.active].name} used ${e.move} for ${e.damage} damage.${e.braced ? ' It was braced for the hit.' : e.eff > 1 ? ' Super effective!' : e.eff < 1 ? ' Not very effective.' : ''}`;
        frames.push({message: player, animation: 'attack', after: e.after, tone: [e.kind === 'element' ? 490 : 330], wait: wait(650)});
      } else if (e.type === 'throw') {
        player = 'The creature broke free of the orb.';
        frames.push({message: 'The orb glows… will your new friend stay?', animation: 'capture', after: e.after, tone: [760], wait: wait(850)});
      } else if (e.type === 'break-free') {
        frames.push({message: 'The creature broke free of the orb!', animation: '', after: e.after, wait: wait(650)});
      } else if (e.type === 'potion') {
        player = `${species[before.active].name} recovered ${e.healed} HP.`;
        frames.push({message: player, animation: '', after: e.after, tone: [610], wait: wait(650)});
      } else if (e.type === 'guard') {
        player = `${species[before.active].name} braced for the next hit.`;
        frames.push({message: player, animation: '', after: e.after, tone: [400], wait: wait(650)});
      } else if (e.type === 'switch') {
        player = `${a.name} joined the encounter.`;
        frames.push({message: `${a.name} joined the encounter!`, animation: '', after: e.after, tone: [560], wait: wait(650)});
      } else if (e.type === 'enemy') {
        const foe = species[b.id];
        frames.push({
          message: `${player} ${enemyText(foe, e)}`,
          animation: e.damage > 0 ? 'enemy' : '',
          after: e.after,
          tone: [210],
          wait: 0,
        });
      } else if (e.type === 'faint-switch') {
        frames[frames.length - 1] = {
          message: `${species[e.fainted].name} needs a rest. ${species[e.replacement].name} stepped in!`,
          animation: 'enemy',
          after: e.after,
          tone: [210],
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
    if (turn.ended === 'win')
      return last.newSeal
        ? `${regions[save().region].seal} awakened! +${last.reward} coins.`
        : `You defeated ${species[b.id].name}: +${last.reward} coins, ${last.xp} XP.`;
    if (turn.ended === 'caught')
      return last.isNew ? `${species[b.id].name} became your friend! +10 coins, 20 XP.` : `${species[b.id].name} was released happily: +10 coins, 20 XP.`;
    return 'Your team was defeated and rested at camp. Everyone is healed.';
  }

  /** Shows the result screen for a finished encounter. State was already applied when the turn resolved. */
  function showEnd(turn, b) {
    const s = save();
    const last = turn.events.at(-1);
    const r = regions[s.region];
    if (turn.ended === 'win') {
      tone(840, 0.3);
      const next = last.newSeal && s.region < 2;
      showResult({
        title: last.newSeal ? r.seal + ' awakened!' : 'A little stronger.',
        copy: last.newSeal
          ? s.region < 2
            ? `The eastern trail to ${regions[s.region + 1].name} is open. Your team is rested and ready.`
            : 'All three shrines shine again. You’ve become a keeper of the Verdant Isles!'
          : `${species[b.id].name} retreated into the wild.`,
        id: b.id,
        rewards: [last.reward + ' coins', last.xp + ' XP', ...(last.potions ? [`${last.potions} potions`] : [])],
        note: last.xpText,
        button: next ? 'Visit ' + regions[s.region + 1].short : 'Back to the trail',
        onContinue: next ? () => travel(s.region + 1) : undefined,
      });
    } else if (turn.ended === 'caught') {
      tone(880, 0.35);
      showResult({
        title: last.isNew ? species[last.id].name + ' is your new friend!' : 'Another friendly face.',
        copy: last.isNew
          ? last.joined === 'reserve'
            ? 'Your team is full, so they wait in the reserve. Swap them in from the companion screen any time.'
            : 'Choose them from your companion team to travel and battle together.'
          : `You already befriended ${species[last.id].name}. This one heads home happily.`,
        id: last.id,
        rewards: [`${last.coins} coins`, `${last.xp} XP`],
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
    game.pacing.encounterAt = 4 + rng() * 3;
    game.pacing.encounterCooldown = 4;
    transition(game, 'explore');
    hideModal(ui, canvas);
    refresh();
    toast('You returned safely to the trail.');
  }

  /** Called when the tab is hidden or the page is leaving: skip animations, keep the (already saved) state. */
  function flushPlayback() {
    timeline.flush();
  }

  Object.assign(actions, {
    close,
    travel,
    selectCompanion,
    partyEdit,
    rest,
    buy,
    returnToCamp,
    interact,
    startWild,
    startGuardian,
    beginBattle,
    openRanger,
    checkTriggers,
    battleAction,
    performTurn,
    resumeBattle,
    flushPlayback,
    flee,
    refresh,
    enterRegion,
    resetCamera,
    nearest,
    renderBattle,
    party: () => menus.party(),
    worldMap: () => menus.worldMap(),
    journal: () => menus.journal(),
  });
  return actions;
}
