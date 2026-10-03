import {createBattle, battleCheckpoint, resolveTurn} from '../dist/src/domain/battle.js';
import {createTestClock} from '../dist/src/domain/clock.js';
import {createEventLog} from '../dist/src/domain/events.js';
import {movePlayer} from '../dist/src/domain/exploration.js';
import {seededRng} from '../dist/src/domain/rng.js';
import {buildWorld, nearestInteractive} from '../dist/src/domain/world.js';
import {species} from '../dist/src/data/species.js';
import {codec, maps, newSave} from './helpers.mjs';
import {inputForWorldTarget, rangerToShrineScript} from './action-script.mjs';

/** Headless adapter for the same scripted actions the browser test performs with keyboard and buttons. */
export function runDomainActionScript(seed = 97) {
  const clock = createTestClock();
  const events = createEventLog({seed, now: clock.now});
  const rng = seededRng(seed);
  const save = newSave();
  const friend = 1;
  save.caught.push(friend);
  save.seen.push(friend);
  save.party.push(friend);
  save.team[friend] = {xp: 0, hp: species[friend].stats.hp};
  save.met = true;
  const world = buildWorld(maps[0]);
  const player = {x: save.x, y: save.y, dir: 4};
  const state = {world, player, pacing: {steps: 0, encounterAt: 1e9, encounterCooldown: 1e9}, trail: []};
  let battle = null;
  let restored = null;

  const walkTo = target => {
    let steps = 0;
    while (Math.hypot(target.x - player.x, target.y - player.y) > 0.2 && steps++ < 4000) {
      const {sx, sy} = inputForWorldTarget(player, target);
      movePlayer(state, sx, sy, false, 1 / 60);
    }
    if (steps >= 4000) throw new Error(`walk stopped before ${JSON.stringify(target)} at ${JSON.stringify(player)}`);
  };

  for (const action of rangerToShrineScript) {
    if (action.type === 'walk-to') walkTo(action.target);
    else if (action.type === 'interact') {
      const target = nearestInteractive(world, player);
      if (target?.ref !== action.target) throw new Error(`expected ${action.target}, got ${target?.ref ?? 'nothing'}`);
      events.emit('interaction.used', {mapId: world.map.id, target: target.ref, kind: target.kind});
      if (target.kind === 'ranger') {
        const dialogueId = 'speaker-ranger';
        events.emit('dialogue.started', {dialogueId, lines: 1});
        events.emit('dialogue.line', {dialogueId, line: 0, speaker: 'ranger'});
      }
    } else if (action.type === 'finish-dialogue') {
      events.emit('dialogue.finished', {dialogueId: 'speaker-ranger', line: 0});
    } else if (action.type === 'advance-clock') clock.advance(action.milliseconds);
    else if (action.type === 'challenge') {
      const guardian = maps[0].objects.find(object => object.kind === 'shrine').guardian;
      battle = createBattle(save, rng, {...guardian, boss: true});
      events.emit('challenge.started', {mapId: world.map.id, species: species[battle.id].id, level: battle.level, boss: true});
    } else if (action.type === 'battle-action') {
      const turn = resolveTurn(save, battle, {kind: action.action}, rng);
      if (!turn) throw new Error(`the ${action.action} action was not accepted`);
      events.emit('turn.resolved', {
        mapId: world.map.id,
        species: species[battle.id].id,
        turn: battle.turn,
        action: action.action,
        ended: turn.ended,
        events: turn.events.map(event => ({type: event.type, damage: event.damage, healed: event.healed, reward: event.reward, xp: event.xp})),
      });
      save.battle = battleCheckpoint(battle);
    } else if (action.type === 'interrupt-reload') {
      const before = structuredClone({battle: save.battle, active: save.active, team: save.team});
      restored = codec.normalize(JSON.parse(codec.serialize(save)), false);
      if (JSON.stringify({battle: restored.battle, active: restored.active, team: restored.team}) !== JSON.stringify(before))
        throw new Error('interrupted battle checkpoint changed across save/load');
    }
  }

  return {events: events.read(), restored, player, nearest: nearestInteractive(world, player)?.ref};
}
