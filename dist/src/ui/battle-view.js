/* Battle panel rendering. Presentation only: all rules are in domain/battle.js. */
import {species} from '../data/species.js';
import {regions} from '../data/regions.js';
import {companion, effectiveness, level, maxHP, moveName} from '../domain/rules.js';
import {captureChance, guardianForecast} from '../domain/battle.js';
import {RELAY_FOCUS_COST} from '../config.js';
import {INTENT_TEXT, TACTICS} from '../data/tactics.js';
import {ELEMENT_COST, FOCUS_GAIN, FOCUS_MAX, GUARD_FACTOR} from '../config.js';
import {drawCreatureAnimated} from '../render/sprites.js';
import {guardianCombatSprite} from '../render/battle-art.js';
import {$, header, openModal} from './dom.js';
import {burstMarkup, hpPercent, orbMarkup, popMarkup} from './battle-fx.js';

const button = (id, title, detail, disabled = false, extra = '') =>
  `<button id="${id}" ${disabled ? 'disabled' : ''} class="${extra}">${title}<small>${detail}</small></button>`;

const rangeText = range => (range.min === range.max ? `${range.min}` : `${range.min}–${range.max}`);

function responseText(response, timing = '') {
  const action =
    response.action === 'guard'
      ? 'Guard'
      : response.action === 'element'
        ? 'use an Element move'
        : response.action === 'switch'
          ? 'switch to a healthy resistant companion'
          : response.action;
  const reward = [
    response.reward?.coins ? `${response.reward.coins} coins` : '',
    response.reward?.xp ? `${response.reward.xp} XP` : '',
    response.reward?.potions ? `${response.reward.potions} potions` : '',
  ].filter(Boolean);
  const bonus = reward.length ? `; +${reward.join(' and ')} once if you win` : '';
  if (response.available === false && response.action === 'element')
    return `${timing}${response.label}: Element costs ${response.cost ?? 1} Focus, and none is available for this turn.`;
  if (response.available === false && response.action === 'switch')
    return `${timing}${response.label}: no healthy resistant companion is available to switch to.`;
  return `${timing}${action}: ${response.label}${bonus}.`;
}

function guardianForecastText(forecast, allyName, foeName) {
  const lines = [`After your choice, if ${foeName} survives, it will use ${INTENT_TEXT[forecast.action] ?? forecast.action}.`];
  if (forecast.damage) {
    lines.push(
      `${allyName} takes ${rangeText(forecast.damage.damage)} damage if they stay active; Guard reduces it to ${rangeText(forecast.guardedDamage.damage)}.`,
      'Ranges include the random roll and current matchup/defense; switching changes them.',
    );
    if (forecast.guardedDamage.counter.max > 0) lines.push(`Guard riposte: ${rangeText(forecast.guardedDamage.counter)} damage to the guardian.`);
  }
  if (forecast.repeatedElementFactor > 1)
    lines.push(`This is the second consecutive Element move: ×${forecast.repeatedElementFactor} raw damage before matchup and defense.`);
  else if (forecast.action === 'element' && forecast.nextAction === 'element')
    lines.push('A second consecutive Element move follows next turn and will use the stronger volley factor.');
  if (forecast.brace) {
    lines.push(
      `Brace deals no damage now; it affects your next turn. Quick Strike uses a ×${forecast.brace.quickFactor} factor (3 damage minimum), while Element uses ×${forecast.brace.elementFactor} and costs ${forecast.brace.elementCost} Focus. Guard's protection expires on the brace, though it still builds ${forecast.brace.focusGain} Focus.`,
    );
    if (forecast.followupResponses.length) lines.push(...forecast.followupResponses.map(response => responseText(response, 'After the brace, ')));
    if (forecast.brace.focusGain && forecast.brace.elementCost)
      lines.push('At 0 Focus, Quick Strike or Guard now can build the Focus needed for an Element after the brace.');
  }
  if (forecast.charge) {
    lines.push('Charge deals no damage; Guard used now expires before the next enemy action.');
    if (forecast.charge.recoveryFactor)
      lines.push(
        `If it survives, it can recover up to ${Math.round(forecast.charge.recoveryFactor * 100)}% of maximum HP (at most ${forecast.charge.recoveryMax} HP).`,
      );
    if (forecast.charge.interruptAction === 'element')
      lines.push(
        forecast.charge.interruptAvailable
          ? `An Element move this turn (costs ${forecast.charge.interruptCost} Focus) interrupts that recovery.`
          : `Element costs ${forecast.charge.interruptCost} Focus; at 0 Focus you cannot interrupt this charge this turn.`,
      );
    if (forecast.nextAction === 'heavy') lines.push('A heavy blow follows on its next turn; save Guard for that forecast.');
  }
  if (forecast.responses.length) lines.push(...forecast.responses.map(response => responseText(response, 'Response: ')));
  if (forecast.followupResponses.length && !forecast.brace) lines.push(...forecast.followupResponses.map(response => responseText(response, 'Next turn: ')));
  return lines.join(' ');
}

export function createBattleView(app) {
  const {game, ui, actions} = app;
  const guardianReveals = new WeakMap();
  // HP percentages last drawn, so each new frame starts its bars where the previous one ended and eases to the new value.
  let shown = {battle: null, active: null, mine: null, enemy: null};
  return function renderBattle(message, animation = '', snap = null, battle = null, fx = null) {
    const b = battle ?? game.battle;
    if (!b) return;
    const guardianSprite = guardianCombatSprite(game.world.map, b);
    let reveal = guardianReveals.get(b);
    if (b.guardianIntro && guardianSprite !== undefined && !reveal) {
      reveal = {active: true};
      guardianReveals.set(b, reveal);
      window.setTimeout(
        () => {
          if (game.battle !== b || !guardianReveals.get(b)?.active) return;
          reveal.active = false;
          b.guardianIntro = false;
          renderBattle(message, 'guardian-transform', snap, b, fx);
        },
        app.motionReduced() ? 80 : 900,
      );
    }
    const guardianTransforming = reveal?.active === true;
    const save = game.save;
    const active = snap?.active ?? save.active;
    const a = species[active];
    const s = species[b.id];
    const eff = effectiveness(active, b.id);
    const mine = companion(save, active);
    const mineHp = snap?.mine ?? mine.hp;
    const enemyHp = snap?.enemy ?? b.hp;
    const focus = snap?.focus ?? b.focus;
    const calm = app.motionReduced();
    const orbState = fx?.orb ?? null;
    // The ownership label is a resolved capture outcome, so keep it out of the
    // battle scene while the throw is still playing. The final settled frame
    // (or the result screen) reveals it after the orb has finished resolving.
    const captureResolving = animation === 'capture' || orbState !== null;
    const captureStatus = captureResolving ? '' : save.caught.includes(b.id) ? '✓ Already befriended' : 'Not yet befriended';
    const continuing = shown.battle === b && shown.active === active;
    const fromMine = continuing ? shown.mine : hpPercent(mineHp, maxHP(save, active));
    const fromEnemy = shown.battle === b ? shown.enemy : hpPercent(enemyHp, b.max);
    const toMine = hpPercent(mineHp, maxHP(save, active));
    const toEnemy = hpPercent(enemyHp, b.max);
    shown = {battle: b, active, mine: toMine, enemy: toEnemy};
    const bar = (from, to, color) =>
      `<div class="bar"><b class="trail" data-to="${to}" style="width:${calm ? to : from}%"></b><i data-to="${to}" style="width:${calm ? to : from}%;background:${color}"></i></div>`;
    const pips = '●'.repeat(focus) + '○'.repeat(FOCUS_MAX - focus);
    const relay = b.relayReady
      ? 'Relay ready · next strike uses the setup'
      : b.condition
        ? `Relay prepared · switch within ${b.condition.remaining} turn${b.condition.remaining === 1 ? '' : 's'}`
        : '';
    const objectiveMarkup = b.objective
      ? `<div class="battle-intent" role="status" aria-label="Encounter objective"><b>${b.objective.title}</b>: ${b.objective.description} · ${b.objective.progress}/${b.objective.turns} turns${b.objective.status === 'ready' ? ' · ready to complete' : ''}</div>`
      : '';
    const tactic = b.boss ? TACTICS[b.tactic] : null;
    const potionId = app.inventoryRules?.supplies?.potions;
    const potionDefinition = potionId ? app.inventoryRules.items?.[potionId] : null;
    const potionCount = potionId ? (save.inventory?.bag?.[potionId] ?? 0) : save.potions;
    const potionDetail =
      potionDefinition?.effect?.type === 'heal-percent'
        ? `Restore ${potionDefinition.effect.percent}% HP · ${potionCount} left`
        : `Restore 24 HP · ${potionCount} left`;
    const forecast = guardianForecast(save, b);
    const forecastMarkup =
      forecast && !b.busy
        ? `<div class="battle-intent" role="status" aria-live="polite" aria-label="Encounter forecast">${guardianForecastText(forecast, a.name, s.name)}</div>`
        : '';
    openModal(
      ui,
      `${header(b.boss ? 'SHRINE GUARDIAN' : 'WILD ENCOUNTER', b.boss ? 'A shrine begins to stir.' : s.name + ' crossed your path.', false)}<div class="battle-top"><span>Focus <b aria-label="${focus} of ${FOCUS_MAX} focus">${pips}</b> · ${a.type} ${eff > 1 ? 'is strong against' : eff < 1 ? 'is weaker against' : 'meets'} ${s.type}</span><span class="${b.boss ? 'boss-label' : ''}">${b.boss ? regions[save.region].seal : 'Turn ' + (b.turn + 1)}</span></div><div class="battle-scene${guardianTransforming ? ' guardian-transforming' : ''}${!calm && fx?.shake ? ' shake-' + fx.shake : ''}"><div class="fighter"><canvas id="fight-buddy" class="${animation === 'attack' ? 'attack' : animation === 'element' ? 'element' : animation === 'enemy' ? 'hit' : animation === 'victory' && !calm ? 'victory' : ''}" width="160" height="145"></canvas>${popMarkup(fx, 'ally')}<div class="name-line">${a.name} · Lv. ${level(save, active)}</div>${bar(fromMine, toMine, a.color)}<small>${mineHp} / ${maxHP(save, active)} HP</small></div><div class="fighter"><canvas id="fight-wild" class="${animation === 'attack' || animation === 'element' ? 'hit' : animation === 'capture' ? 'catching' : ''}${guardianTransforming ? ' guardian-form-hidden' : ''}${orbState && orbState !== 'throw' && orbState !== 'break' ? ' inside-orb' : ''}${orbState === 'break' ? ' pop-out' : ''}${animation === 'victory' ? ' foe-out' : ''}" width="160" height="145"></canvas>${popMarkup(fx, 'enemy')}${!calm && fx?.burst === 'enemy' ? burstMarkup(a.color) : ''}${!calm && fx?.burst === 'stars' ? burstMarkup('#ffe27a') : ''}${orbState && !(calm && orbState === 'break') ? orbMarkup(orbState) : ''}<div class="name-line">${s.name} · Lv. ${b.level}</div><small class="capture-status">${captureStatus}</small>${bar(fromEnemy, toEnemy, s.color)}<small>${enemyHp} / ${b.max} HP</small></div></div>${guardianTransforming ? '<div class="guardian-reveal" role="status" aria-live="polite">The shrine guardian is awakening…</div>' : ''}<div class="battle-log" role="status" aria-live="polite">${message}</div>${objectiveMarkup}${relay ? `<div class="battle-intent" role="status">${relay}</div>` : ''}${forecastMarkup}<div class="battle-actions">${button('attack', '1 · Quick strike', `Reliable damage · +${FOCUS_GAIN} Focus`, b.busy || guardianTransforming)}${button('element', '2 · ' + moveName(save, active), `${eff > 1 ? 'Super effective!' : eff < 1 ? 'Less effective' : 'Elemental attack'} · costs ${ELEMENT_COST} Focus`, b.busy || guardianTransforming || focus < ELEMENT_COST)}${button('setup', '3 · Prepare relay', `Spend ${RELAY_FOCUS_COST} Focus; switching empowers the next move`, b.busy || guardianTransforming || focus < RELAY_FOCUS_COST || !!b.condition || b.relayReady || save.party.filter(i => i !== active && companion(save, i).hp > 0).length === 0)}${button('objective', '4 · Complete objective', b.objective?.status === 'ready' ? 'Commit the authored reward' : b.objective ? `${b.objective.turns - b.objective.progress} turns remaining` : 'No objective', b.busy || guardianTransforming || b.objective?.status !== 'ready')}${button('catch', '5 · Capture orb', b.boss ? 'Guardians cannot be caught' : Math.round(captureChance(save, b) * 100) + '% chance · ' + save.orbs + ' left', b.busy || guardianTransforming || b.boss || save.orbs === 0, 'capture-button')}${button('potion', '6 · Potion', potionDetail, b.busy || guardianTransforming || potionCount === 0 || mineHp === maxHP(save, active))}${button('guard', '7 · Guard', `Take ${Math.round((1 - GUARD_FACTOR) * 100)}% less next hit${tactic?.guardRiposteFactor ? ' · counter heavy blows' : ''} · +${FOCUS_GAIN} Focus`, b.busy || guardianTransforming)}${button('switch', '8 · Switch friend', 'Choose a companion', b.busy || guardianTransforming || save.party.filter(i => companion(save, i).hp > 0).length < 2)}</div><div class="battle-subactions"><button id="flee" ${b.busy || guardianTransforming ? 'disabled' : ''}>Leave encounter <kbd>Esc</kbd></button><span>${b.boss ? 'Win to awaken the shrine' : 'Weaken it before you catch it'}</span></div>`,
      'battle',
      s.name + ' encounter',
    );
    const allyState = mineHp <= 0 ? 'faint' : animation === 'element' ? 'element' : animation === 'attack' ? 'attack' : animation === 'enemy' ? 'hit' : 'idle';
    const enemyState =
      animation === 'victory'
        ? 'faint'
        : animation === 'capture'
          ? 'capture'
          : animation === 'enemy'
            ? 'attack'
            : animation === 'attack' || animation === 'element'
              ? enemyHp <= 0
                ? 'faint'
                : 'hit'
              : 'idle';
    if (!calm) {
      void $('#modal').offsetWidth; // commit the starting widths so the transition runs
      for (const el of document.querySelectorAll('.battle-scene .bar i, .battle-scene .bar b')) el.style.width = el.dataset.to + '%';
    }
    drawCreatureAnimated($('#fight-buddy'), active, 107, allyState, app.motionReduced());
    drawCreatureAnimated($('#fight-wild'), b.id, 107, enemyState, app.motionReduced(), guardianTransforming ? undefined : guardianSprite);
    for (const id of ['attack', 'element', 'setup', 'objective', 'catch', 'potion', 'guard']) $('#' + id).onclick = () => actions.battleAction(id);
    $('#switch').onclick = actions.party;
    $('#flee').onclick = actions.flee;
  };
}
