/* Game flow: connects domain rules, menus and services. Owns timers (battle pacing) and screen transitions.
   Everything here may touch the DOM through ui/*; domain/* stays pure. */
import {species} from './data/species.js';
import {regions} from './data/regions.js';
import {clampHealth, companion, flagDone, healTeam, unlocked} from './domain/rules.js';
import {
  createBattle,
  ensureHealthyCompanion,
  enemyAttack,
  captureChance,
  rollWild,
  playerStrike,
  resolveCapture,
  resolveFaint,
  resolveLoss,
  resolveWin,
  throwOrb,
  usePotion,
} from './domain/battle.js';
import {buildWorld, nearestInteractive, triggersAt} from './domain/world.js';
import {hideModal, toast} from './ui/dom.js';
import {renderHud, renderRegion} from './ui/hud.js';

export function createController(app) {
  const {game, ui, audio, rng, persist, reducedMotion, canvas, actions, menus, maps} = app;
  const save = () => game.save;
  const tone = (f, d) => audio.tone(f, d);
  const renderBattle = (message, animation) => app.renderBattle(message, animation);

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
    if (game.battle?.busy) return;
    if (game.battle && ui.modalMode === 'battle') {
      flee();
      return;
    }
    if (game.battle && ui.modalMode === 'party') {
      renderBattle('Choose your next move.');
      return;
    }
    hideModal(ui, canvas);
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
    s.active = id;
    refresh();
    tone(560);
    if (game.battle) {
      game.battle.busy = true;
      renderBattle(`${species[id].name} joined the encounter!`);
      enemyTurn(`${species[id].name} joined the encounter.`);
    } else {
      close();
      toast(`${species[id].name} is ready to travel with you.`);
    }
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
      menus.result({
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

  function beginBattle(spec) {
    if (game.battle) return;
    const s = save();
    if (!ensureHealthyCompanion(s)) {
      toast('Your team needs a rest. Talk to Iris at camp.');
      return;
    }
    game.battle = createBattle(s, rng, spec);
    refresh();
    tone(spec.boss ? 230 : 660);
    renderBattle(`${spec.boss ? 'The shrine guardian' : 'A wild ' + species[game.battle.id].name} appeared! Choose your next move.`);
  }

  /** Wild encounter from an encounter zone. */
  function startWild(zone) {
    if (game.battle) return;
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

  function battleAction(kind) {
    const b = game.battle;
    if (!b || b.busy || ui.modalMode !== 'battle') return;
    const s = save();
    const a = species[s.active];
    let message = '';
    let animation = '';
    if (kind === 'attack' || kind === 'element') {
      const r = playerStrike(s, b, kind, rng);
      message = `${a.name} used ${kind === 'element' ? a.move : 'Quick strike'} for ${r.damage} damage.${r.eff > 1 ? ' Super effective!' : r.eff < 1 ? ' Not very effective.' : ''}`;
      animation = 'attack';
      tone(kind === 'element' ? 490 : 330);
      if (r.defeated) {
        winBattle();
        return;
      }
    } else if (kind === 'catch') {
      if (!throwOrb(s, b)) return;
      tone(760);
      b.busy = true;
      renderBattle('The orb glows… will your new friend stay?', 'capture');
      refresh();
      const token = b.token;
      setTimeout(
        () => {
          if (game.battle?.token !== token) return;
          if (rng() < captureChance(s, game.battle)) caughtBattle();
          else {
            game.battle.busy = true;
            renderBattle('The creature broke free of the orb!');
            enemyTurn('The creature broke free of the orb.');
          }
        },
        reducedMotion ? 250 : 850,
      );
      return;
    } else if (kind === 'potion') {
      const healed = usePotion(s);
      if (healed === null) return;
      message = `${a.name} recovered ${healed} HP.`;
      tone(610);
    } else if (kind === 'guard') {
      b.guard = true;
      message = `${a.name} braced for the next hit.`;
      tone(400);
    }
    b.busy = true;
    refresh();
    renderBattle(message, animation);
    enemyTurn(message);
  }

  function enemyTurn(previous) {
    if (!game.battle) return;
    const token = game.battle.token;
    setTimeout(
      () => {
        if (game.battle?.token !== token) return;
        const b = game.battle;
        const s = save();
        const {damage, element} = enemyAttack(s, b, rng);
        refresh();
        tone(210);
        const faint = resolveFaint(s);
        if (faint.status === 'switched') {
          refresh();
          renderBattle(`${species[faint.fainted].name} needs a rest. ${species[faint.replacement].name} stepped in!`, 'enemy');
        } else if (faint.status === 'lost') loseBattle();
        else renderBattle(`${previous} ${species[b.id].name} used ${element ? species[b.id].move : 'Quick strike'} for ${damage} damage.`, 'enemy');
      },
      reducedMotion ? 250 : 650,
    );
  }

  function finishEncounter() {
    game.battle = null;
    game.pacing.steps = 0;
    game.pacing.encounterAt = 4 + rng() * 3;
    game.pacing.encounterCooldown = 4;
    refresh();
  }

  function winBattle() {
    const s = save();
    const r = regions[s.region];
    const b = game.battle;
    const w = resolveWin(s, b, rng);
    finishEncounter();
    tone(840, 0.3);
    const next = w.newSeal && s.region < 2;
    menus.result({
      title: w.newSeal ? r.seal + ' awakened!' : 'A little stronger.',
      copy: w.newSeal
        ? s.region < 2
          ? `The eastern trail to ${regions[s.region + 1].name} is open. Your team is rested and ready.`
          : 'All three shrines shine again. You’ve become a keeper of the Verdant Isles!'
        : `${species[b.id].name} retreated into the wild.`,
      id: b.id,
      rewards: [w.reward + ' coins', w.xp + ' XP', ...(w.newSeal ? ['2 potions'] : [])],
      note: w.xpText,
      button: next ? 'Visit ' + regions[s.region + 1].short : 'Back to the trail',
      onContinue: next ? () => travel(s.region + 1) : undefined,
    });
  }

  function caughtBattle() {
    const s = save();
    const c = resolveCapture(s, game.battle);
    finishEncounter();
    tone(880, 0.35);
    menus.result({
      title: c.isNew ? species[c.id].name + ' is your new friend!' : 'Another friendly face.',
      copy: c.isNew
        ? 'Choose them from your companion team to travel and battle together.'
        : `You already befriended ${species[c.id].name}. This one heads home happily.`,
      id: c.id,
      rewards: ['10 coins', '20 XP'],
      note: c.xpText,
      button: 'Keep exploring',
      secondary: c.isNew ? 'Travel with ' + species[c.id].name : undefined,
      onSecondary: () => {
        s.active = c.id;
        refresh();
        close();
        toast(species[c.id].name + ' is ready for the trail.');
      },
    });
  }

  function flee() {
    if (!game.battle || game.battle.busy) return;
    finishEncounter();
    close();
    toast('You returned safely to the trail.');
  }

  function loseBattle() {
    const s = save();
    const {id} = resolveLoss(s);
    finishEncounter();
    healTeam(s);
    Object.assign(game.player, maps[s.region].spawns.camp);
    resetCamera();
    refresh();
    menus.result({
      title: 'A fresh start at camp.',
      copy: 'Iris brought your team back safely. Everyone is rested. Try switching companions or using potions next time.',
      id,
      rewards: ['Team fully healed'],
      button: 'Back to the trail',
    });
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
