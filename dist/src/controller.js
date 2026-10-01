/* Game flow: connects domain rules, menus and services. Owns timers (battle pacing) and screen transitions.
   Everything here may touch the DOM through ui/*; domain/* stays pure. */
import {species} from './data/species.js';
import {regions} from './data/regions.js';
import {clampHealth, companion, flagDone, healTeam, unlocked} from './domain/rules.js';
import {createBattle, ensureHealthyCompanion, resolveTurn, rollWild} from './domain/battle.js';
import {transition} from './domain/phase.js';
import {createTimeline} from './services/timeline.js';
import {buildWorld, nearestInteractive, triggersAt} from './domain/world.js';
import {hideModal, toast} from './ui/dom.js';
import {renderHud, renderRegion} from './ui/hud.js';

export function createController(app) {
  const {game, ui, audio, rng, persist, reducedMotion, canvas, actions, menus, maps} = app;
  const save = () => game.save;
  const tone = (f, d) => audio.tone(f, d);
  const renderBattle = (message, animation, snap, battle) => app.renderBattle(message, animation, snap, battle);
  const timeline = (app.timeline = createTimeline());
  const wait = ms => (reducedMotion ? 250 : ms);

  function refresh() {
    clampHealth(save());
    renderHud(save());
    persist();
  }

  function resetCamera() {
    ui.camera = {x: game.player.x, y: game.player.y};
  }

  function enterRegion(region) {
    game.world = buildWorld(maps[region]);
    renderRegion(region);
  }

  function close() {
    if (game.battle?.busy || timeline.active) return;
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
    Object.assign(game.player, maps[id].spawns[spawn] || maps[id].spawns.camp);
    resetCamera();
    game.pacing.encounterCooldown = 3;
    game.pacing.steps = 0;
    enterRegion(id);
    close();
    refresh();
    tone(600);
    toast(`Welcome to ${regions[id].name}. The next chapter is yours.`);
  }

  function selectCompanion(id) {
    const s = save();
    if (!s.caught.includes(id) || companion(s, id).hp <= 0 || game.battle?.busy) return;
    if (game.battle) {
      if (id !== s.active) performTurn({kind: 'switch', id});
      return;
    }
    s.active = id;
    refresh();
    tone(560);
    close();
    toast(`${species[id].name} is ready to travel with you.`);
  }

  function rest() {
    healTeam(save());
    save().orbs = Math.max(save().orbs, 12);
    refresh();
    tone(640);
    menus.ranger('Everyone is rested, and your capture orbs are topped up. Safe travels!');
  }

  function buy(item) {
    const s = save();
    if (item === 'potion') {
      if (s.coins < 10) return;
      s.coins -= 10;
      s.potions++;
      refresh();
      menus.ranger('One potion for the trail. Use it when your companion needs a little help.');
    } else {
      if (s.coins < 15) return;
      s.coins -= 15;
      s.orbs += 5;
      refresh();
      menus.ranger('Five fresh capture orbs. There’s always room for one more friend.');
    }
  }

  function returnToCamp() {
    if (game.battle) {
      toast('Finish your encounter before returning to camp.');
      return;
    }
    Object.assign(game.player, maps[save().region].spawns.camp);
    resetCamera();
    game.pacing.encounterCooldown = 3;
    game.pacing.steps = 0;
    close();
    persist();
    toast('Back at camp. Talk to Iris just northwest of the trail to rest.');
  }

  function nearest() {
    return nearestInteractive(game.world, game.player);
  }

  const sealOf = flag => regions.find(r => r.id === flag.split('.')[0]).seal.toLowerCase();

  function interact() {
    if (game.battle || ui.modalMode || ui.paused) return;
    const o = nearest();
    if (!o) {
      const t = triggersAt(game.world, game.player, 'interact')[0];
      if (t) runTrigger(t);
      else toast('Follow the trail, or wander into tall grass to meet a friend.');
      return;
    }
    const s = save();
    tone(480);
    if (o.kind === 'ranger') menus.ranger();
    else if (o.kind === 'sign') toast(o.text);
    else if (o.kind === 'chest') {
      if (flagDone(s, o.flag)) {
        toast('This treasure chest is empty. The next island may have another.');
        return;
      }
      s.chests.push(s.region);
      s.coins += o.reward.coins;
      s.potions += o.reward.potions;
      s.orbs += o.reward.orbs;
      refresh();
      showResult({
        title: 'A little trail treasure',
        copy: 'Something useful for the road ahead.',
        sprite: 23,
        rewards: [`${o.reward.coins} coins`, `${o.reward.potions} potions`, `${o.reward.orbs} capture orbs`],
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
      toast('Your team needs a rest. Talk to Iris at camp.');
      return;
    }
    timeline.cancel();
    game.battle = createBattle(s, rng, spec);
    refresh();
    tone(spec.boss ? 230 : 660);
    renderBattle(`${spec.boss ? 'The shrine guardian' : 'A wild ' + species[game.battle.id].name} appeared! Choose your next move.`);
  }

  /** Wild encounter from an encounter zone. */
  function startWild(zone) {
    if (game.battle || game.phase !== 'explore') return;
    if (!ensureHealthyCompanion(save())) {
      toast('Your team needs a rest. Talk to Iris at camp.');
      return;
    }
    beginBattle(rollWild(save(), rng, zone));
  }

  /** Shrine guardian `{id, level}` from map data. */
  function startGuardian(guardian) {
    beginBattle({id: guardian.id, level: guardian.level, boss: true});
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
    const turn = resolveTurn(s, b, action, rng);
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
        Object.assign(game.player, maps[s.region].spawns.camp);
        resetCamera();
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

  /** Turns resolved events into display frames (presentation only; no state changes). */
  function framesFor(turn, before, b) {
    const frames = [];
    let player = '';
    for (const e of turn.events) {
      const a = species[e.type === 'switch' ? e.id : before.active];
      if (e.type === 'strike') {
        player = `${species[before.active].name} used ${e.move} for ${e.damage} damage.${e.eff > 1 ? ' Super effective!' : e.eff < 1 ? ' Not very effective.' : ''}`;
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
          message: `${player} ${foe.name} used ${e.element ? foe.move : 'Quick strike'} for ${e.damage} damage.`,
          animation: 'enemy',
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
        rewards: [last.reward + ' coins', last.xp + ' XP', ...(last.newSeal ? ['2 potions'] : [])],
        note: last.xpText,
        button: next ? 'Visit ' + regions[s.region + 1].short : 'Back to the trail',
        onContinue: next ? () => travel(s.region + 1) : undefined,
      });
    } else if (turn.ended === 'caught') {
      tone(880, 0.35);
      showResult({
        title: last.isNew ? species[last.id].name + ' is your new friend!' : 'Another friendly face.',
        copy: last.isNew
          ? 'Choose them from your companion team to travel and battle together.'
          : `You already befriended ${species[last.id].name}. This one heads home happily.`,
        id: last.id,
        rewards: ['10 coins', '20 XP'],
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
        copy: 'Iris brought your team back safely. Everyone is rested. Try switching companions or using potions next time.',
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
    rest,
    buy,
    returnToCamp,
    interact,
    startWild,
    startGuardian,
    beginBattle,
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
