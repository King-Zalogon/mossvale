/* Battle panel rendering. Presentation only: all rules are in domain/battle.js. */
import {species} from '../data/species.js';
import {regions} from '../data/regions.js';
import {companion, effectiveness, level, maxHP, moveName} from '../domain/rules.js';
import {captureChance, nextEnemyAction} from '../domain/battle.js';
import {INTENT_TEXT} from '../data/tactics.js';
import {ELEMENT_COST, FOCUS_GAIN, FOCUS_MAX, GUARD_FACTOR} from '../config.js';
import {drawCreature} from '../render/sprites.js';
import {$, header, openModal} from './dom.js';

const button = (id, title, detail, disabled = false, extra = '') =>
  `<button id="${id}" ${disabled ? 'disabled' : ''} class="${extra}">${title}<small>${detail}</small></button>`;

export function createBattleView(app) {
  const {game, ui, actions} = app;
  return function renderBattle(message, animation = '', snap = null, battle = null) {
    const b = battle ?? game.battle;
    if (!b) return;
    const save = game.save;
    const active = snap?.active ?? save.active;
    const a = species[active];
    const s = species[b.id];
    const eff = effectiveness(active, b.id);
    const mine = companion(save, active);
    const mineHp = snap?.mine ?? mine.hp;
    const enemyHp = snap?.enemy ?? b.hp;
    const focus = snap?.focus ?? b.focus;
    const pips = '●'.repeat(focus) + '○'.repeat(FOCUS_MAX - focus);
    openModal(
      ui,
      `${header(b.boss ? 'SHRINE GUARDIAN' : 'WILD ENCOUNTER', b.boss ? 'A shrine begins to stir.' : s.name + ' crossed your path.', false)}<div class="battle-top"><span>Focus <b aria-label="${focus} of ${FOCUS_MAX} focus">${pips}</b> · ${a.type} ${eff > 1 ? 'is strong against' : eff < 1 ? 'is weaker against' : 'meets'} ${s.type}</span><span class="${b.boss ? 'boss-label' : ''}">${b.boss ? regions[save.region].seal : 'Turn ' + (b.turn + 1)}</span></div><div class="battle-scene"><div class="fighter"><canvas id="fight-buddy" class="${animation === 'attack' ? 'attack' : animation === 'enemy' ? 'hit' : ''}" width="160" height="145"></canvas><div class="name-line">${a.name} · Lv. ${level(save, active)}</div><div class="bar"><i style="width:${(mineHp / maxHP(save, active)) * 100}%;background:${a.color}"></i></div><small>${mineHp} / ${maxHP(save, active)} HP</small></div><div class="fighter"><canvas id="fight-wild" class="${animation === 'attack' ? 'hit' : animation === 'capture' ? 'catching' : ''}" width="160" height="145"></canvas><div class="name-line">${s.name} · Lv. ${b.level}</div><div class="bar"><i style="width:${(enemyHp / b.max) * 100}%;background:${s.color}"></i></div><small>${enemyHp} / ${b.max} HP</small></div></div><div class="battle-log" role="status" aria-live="polite">${message}</div>${b.boss && !b.over ? `<div class="battle-intent">Next: ${s.name} is ${INTENT_TEXT[nextEnemyAction(b)]}.</div>` : ''}<div class="battle-actions">${button('attack', '1 · Quick strike', `Reliable damage · +${FOCUS_GAIN} Focus`, b.busy)}${button('element', '2 · ' + moveName(save, active), `${eff > 1 ? 'Super effective!' : eff < 1 ? 'Less effective' : 'Elemental attack'} · costs ${ELEMENT_COST} Focus`, b.busy || focus < ELEMENT_COST)}${button('catch', '3 · Capture orb', b.boss ? 'Guardians cannot be caught' : Math.round(captureChance(save, b) * 100) + '% chance · ' + save.orbs + ' left', b.busy || b.boss || save.orbs === 0, 'capture-button')}${button('potion', '4 · Potion', 'Restore 24 HP · ' + save.potions + ' left', b.busy || save.potions === 0 || mineHp === maxHP(save, active))}${button('guard', '5 · Guard', `Take ${Math.round((1 - GUARD_FACTOR) * 100)}% less next hit · +${FOCUS_GAIN} Focus`, b.busy)}${button('switch', '6 · Switch friend', 'Choose a companion', b.busy || save.party.filter(i => companion(save, i).hp > 0).length < 2)}</div><div class="battle-subactions"><button id="flee" ${b.busy ? 'disabled' : ''}>Leave encounter <kbd>Esc</kbd></button><span>${b.boss ? 'Win to awaken the shrine' : 'Weaken it before you catch it'}</span></div>`,
      'battle',
      s.name + ' encounter',
    );
    drawCreature($('#fight-buddy'), active, 107);
    drawCreature($('#fight-wild'), b.id, 107);
    for (const id of ['attack', 'element', 'catch', 'potion', 'guard']) $('#' + id).onclick = () => actions.battleAction(id);
    $('#switch').onclick = actions.party;
    $('#flee').onclick = actions.flee;
  };
}
