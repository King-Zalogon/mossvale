/* Modal menus: map, journal, party, ranger, shrine, help, result and save-recovery notices.
   Each menu reads state, renders HTML and wires buttons to controller `actions`. No game rules live here. */
import {species} from '../data/species.js';
import {regions} from '../data/regions.js';
import {companion, level, maxHP, moveName, reserve, unlocked} from '../domain/rules.js';
import {PARTY_SIZE} from '../config.js';
import {drawCreature, drawSprite} from '../render/sprites.js';
import {hasProgress, summarize} from '../services/profile.js';
import {ZOOM_MAX, ZOOM_MIN} from '../services/settings.js';
import {$, header, openModal} from './dom.js';

export function createMenus(app) {
  const {game, ui, actions} = app;
  const save = () => game.save;
  const open = (content, mode, label) => openModal(ui, content, mode, label);
  const wireClose = () => {
    const c = $('#modal .close');
    if (c) c.onclick = actions.close;
  };
  const wireSelect = () => {
    for (const b of document.querySelectorAll('[data-select]')) b.onclick = () => actions.selectCompanion(+b.dataset.select);
  };

  function worldMap() {
    if (game.battle) return;
    const s = save();
    open(
      `${header('THREE ISLANDS. ONE ADVENTURE.', 'The Verdant Isles')}<p>Follow the eastern trails, or travel directly to any unlocked region.</p><div class="map-cards">${regions
        .map(
          (r, i) =>
            `<div class="region-card ${s.region === i ? 'current' : ''} ${!unlocked(s, i) ? 'locked' : ''}"><div class="region-preview"><canvas id="region-art-${i}" width="110" height="110"></canvas></div><h3>${r.name}</h3><p>${unlocked(s, i) ? r.desc : `Earn the ${regions[i - 1].seal.toLowerCase()} to open this trail.`}</p><button data-travel="${i}" ${!unlocked(s, i) ? 'disabled' : ''}>${!unlocked(s, i) ? 'Trail locked' : s.region === i ? 'Return to this camp' : 'Travel to ' + r.short}</button></div>`,
        )
        .join(
          '',
        )}</div><div class="map-progress">${s.badges.length ? s.badges.map(i => '✦ ' + regions[i].seal).join(' &nbsp; · &nbsp; ') : 'Your first seal awaits at the meadow shrine. Befriend a wild creature, then visit the blue crystal north of camp.'}</div><div class="map-legend"><span><i class="legend-dot"></i> Camp / trail</span><span><i class="legend-dot blue"></i> Shrine</span><span><i class="legend-dot gold"></i> Treasure</span><span style="color:#e59b85">● You</span></div>`,
      'map',
      'Island map',
    );
    regions.forEach((r, i) => drawSprite($(`#region-art-${i}`).getContext('2d'), r.preview, 55, 103, r.preview === 0 ? 80 : 88));
    for (const b of document.querySelectorAll('[data-travel]')) b.onclick = () => actions.travel(+b.dataset.travel);
    wireClose();
  }

  function journal(filter = 'all') {
    if (game.battle) return;
    const s = save();
    const ids = species.map((_, i) => i).filter(i => filter === 'all' || s.caught.includes(i));
    open(
      `${header('NOTES FROM THE MEADOW', 'Your field journal')}<p>${s.caught.length} species befriended · ${s.seen.length} discovered · ${8 - s.seen.length} yet to discover</p><div class="tab-buttons"><button id="all-species" class="${filter === 'all' ? 'selected' : ''}">All species</button><button id="caught-species" class="${filter === 'caught' ? 'selected' : ''}">Befriended</button></div><div class="journal-grid">${ids
        .map(i => {
          const sp = species[i];
          const seen = s.seen.includes(i);
          const caught = s.caught.includes(i);
          return `<div class="species ${s.active === i ? 'active' : ''}">${seen ? `<canvas id="spec-${i}" width="110" height="110"></canvas>` : '<div class="unseen">?</div>'}<h3>${seen ? sp.name : 'Unknown creature'}</h3><small>${caught ? 'Befriended · Lv. ' + level(s, i) : seen ? 'Seen · ' + sp.type : 'Not yet discovered'}</small><p>${seen ? sp.desc : 'A new friend is waiting along a wild trail.'}</p><small>${
            seen
              ? app.maps
                  .map((m, ri) => (m.zones.some(z => z.pool.includes(i)) ? regions[ri].short : null))
                  .filter(Boolean)
                  .join(' / ')
              : 'Explore to discover'
          }</small>${caught ? `<button data-select="${i}" ${s.active === i ? 'disabled' : ''}>${s.active === i ? 'Your companion' : 'Travel together'}</button>` : ''}</div>`;
        })
        .join('')}</div>`,
      'journal',
      'Field journal',
    );
    ids.forEach(i => {
      if (s.seen.includes(i)) drawCreature($('#spec-' + i), i, 85);
    });
    $('#all-species').onclick = () => journal('all');
    $('#caught-species').onclick = () => journal('caught');
    wireSelect();
    wireClose();
  }

  function party() {
    if (game.battle?.busy) return;
    const s = save();
    const battle = game.battle;
    const full = s.party.length >= PARTY_SIZE;
    const card = (i, inTeam) => {
      const hp = companion(s, i).hp;
      const choose = s.active === i ? 'Active companion' : hp === 0 ? 'Needs a rest' : 'Choose companion';
      const moves = `${moveName(s, i)} · ${species[i].type}`;
      return `<div class="species ${s.active === i ? 'active' : ''}"><canvas id="party-${i}" width="110" height="110"></canvas><h3>${species[i].name}</h3><small>Lv. ${level(s, i)} · ${moves}</small><div class="bar"><i style="width:${(hp / maxHP(s, i)) * 100}%;background:${species[i].color}"></i></div><small>${hp} / ${maxHP(s, i)} HP</small><button data-select="${i}" ${s.active === i || hp === 0 ? 'disabled' : ''}>${choose}</button>${
        battle
          ? ''
          : inTeam
            ? `<button data-bench="${i}" class="muted-button" ${s.active === i || s.party.length <= 1 ? 'disabled' : ''}>Move to reserve</button>`
            : `<button data-add="${i}" class="muted-button" ${full ? 'disabled' : ''}>${full ? 'Team is full' : 'Add to team'}</button>`
      }</div>`;
    };
    const bench = reserve(s);
    open(
      `${header('FRIENDS FOR THE TRAIL', 'Your companions', !battle)}<p>${battle ? 'Switching companions uses your turn. Choose a teammate with health remaining.' : `Up to ${PARTY_SIZE} friends fight beside you. The rest wait in the reserve, still earning a share of XP.`}</p><h3 class="party-heading">Team · ${s.party.length} / ${PARTY_SIZE}</h3><div class="journal-grid party-grid">${s.party.map(i => card(i, true)).join('')}</div>${
        !battle && bench.length
          ? `<h3 class="party-heading">Reserve · ${bench.length}</h3><div class="journal-grid party-grid">${bench.map(i => card(i, false)).join('')}</div>`
          : ''
      }${battle ? '<button id="back-battle" class="muted-button" style="margin-top:14px">Back to encounter</button>' : ''}`,
      'party',
      'Companion team',
    );
    s.caught.forEach(i => {
      if (!battle || s.party.includes(i)) drawCreature($('#party-' + i), i, 85);
    });
    wireSelect();
    for (const b of document.querySelectorAll('[data-bench]')) b.onclick = () => actions.partyEdit('remove', +b.dataset.bench);
    for (const b of document.querySelectorAll('[data-add]')) b.onclick = () => actions.partyEdit('add', +b.dataset.add);
    wireClose();
    if ($('#back-battle')) $('#back-battle').onclick = () => actions.renderBattle('Choose your next move.');
  }

  function ranger(message = 'The shrines have been quiet for years. Perhaps your new friends can help wake them.') {
    if (game.battle) return;
    const s = save();
    open(
      `${header('RANGER STATION', 'A moment with Iris')}<div class="ranger-body"><canvas id="ranger-art" width="90" height="135"></canvas><div><p>${message}</p><p>Rest here for free. I’ll refill your bag to 12 orbs, too.</p><div class="item-counts"><span>● ${s.coins} coins</span><span>✚ ${s.potions} potions</span><span>◉ ${s.orbs} orbs</span></div></div></div><div class="ranger-actions"><button class="primary" id="rest-team">Rest your team</button><button id="buy-potion" ${s.coins < 10 ? 'disabled' : ''}>Potion · 10 coins</button><button id="buy-orbs" ${s.coins < 15 ? 'disabled' : ''}>5 orbs · 15 coins</button></div><p class="dialog-note">Potions restore 24 HP during battle. Earn coins from encounters and treasure chests.</p>`,
      'ranger',
      'Ranger Iris',
    );
    drawSprite($('#ranger-art').getContext('2d'), 8, 45, 130, 65);
    $('#rest-team').onclick = () => actions.rest();
    $('#buy-potion').onclick = () => actions.buy('potion');
    $('#buy-orbs').onclick = () => actions.buy('orbs');
    wireClose();
  }

  function shrine(g) {
    const s = save();
    const r = regions[s.region];
    open(
      `${header('THE CRYSTAL SHRINE', r.name + ' guardian')}<canvas id="guardian-preview" class="result-art" width="150" height="150"></canvas><p style="text-align:center">${species[g.guardian.id].name} · Level ${g.guardian.level} · ${species[g.guardian.id].type}</p><p style="text-align:center;max-width:460px;margin:0 auto 17px">Win this challenge to earn the ${r.seal.toLowerCase()}${s.region < 2 ? ' and open the trail to ' + regions[s.region + 1].name : '. All three shrines will be awake'}.</p><div style="display:flex;justify-content:center;gap:10px"><button id="challenge" class="primary">Challenge guardian</button><button id="prepare-team">Prepare your team</button></div><p class="dialog-note" style="text-align:center">Guardian creatures cannot be captured. Potions and type strengths can help.</p>`,
      'shrine',
      'Shrine guardian',
    );
    drawCreature($('#guardian-preview'), g.guardian.id, 110);
    $('#challenge').onclick = () => actions.startGuardian(g.guardian);
    $('#prepare-team').onclick = party;
    wireClose();
  }

  function result({title, copy, id, sprite, rewards = [], note = '', button = 'Keep exploring', onContinue, secondary, onSecondary}) {
    open(
      `${header('A MOMENT FOR YOUR JOURNAL', title, false)}<div class="result-content"><canvas id="result-art" class="result-art" width="160" height="145"></canvas><p>${copy}</p><div class="reward-row">${rewards.map(r => `<span class="reward-chip">${r}</span>`).join('')}</div>${note ? `<p class="xp-gain">${note}</p>` : ''}<button id="result-continue" class="primary">${button}</button>${secondary ? `<button id="result-secondary" class="muted-button" style="display:block;margin:9px auto 0">${secondary}</button>` : ''}</div>`,
      'result',
      'Encounter result',
    );
    if (id !== undefined) drawCreature($('#result-art'), id, 110);
    else drawSprite($('#result-art').getContext('2d'), sprite, 80, 138, 110);
    $('#result-continue').onclick = onContinue || actions.close;
    if (secondary) $('#result-secondary').onclick = onSecondary;
  }

  function help() {
    if (game.battle) return;
    open(
      `${header('A FIELD GUIDE', 'Make yourself at home.')}<div class="help-copy"><p>Explore the isles with your companion. Befriend wild creatures and awaken all three shrines.</p><div class="shortcut-grid"><span><kbd>WASD</kbd> / arrows · Move in 8 directions</span><span><kbd>Shift</kbd> · Run</span><span><kbd>E</kbd> · Talk, open, or travel</span><span><kbd>M</kbd> · Island map</span><span><kbd>J</kbd> · Field journal</span><span><kbd>Q</kbd> · Companion team</span></div><ul><li>Walk through tall grass to meet creatures. Weaken them, then use a capture orb. The chance improves as their health drops.</li><li>Elemental attacks have strengths and weaknesses. The battle panel shows the current matchup.</li><li>Every friend you catch can become your companion. They gain XP, levels, and more health.</li><li>Find the blue shrine north of each camp. Win against its guardian to earn a seal and unlock the next region.</li><li>Talk to Iris to heal everyone and refill your orbs. Spend coins on extra orbs and potions.</li><li>On touch screens, use the eight-direction pad and tap Run. Tap the interaction prompt near a landmark.</li></ul><p>Your original meadow progress has been preserved. The game saves automatically on this device.</p></div>`,
      'help',
      'How to play',
    );
    wireClose();
  }

  function saveNotice(status, message) {
    const title = {restored: 'Save restored', recovered: 'Save could not be read', future: 'Newer save found', unavailable: 'Storage unavailable'}[status];
    $('#save-note').textContent = message;
    open(`${header('SAVE RECOVERY', title)}<p>${message}</p><button class="primary" id="notice-ok">Continue</button>`, 'notice', 'Save recovery');
    wireClose();
    $('#notice-ok').onclick = actions.close;
  }

  /** Title screen (`title: true`, shown after loading) and the in-game menu share one set of views. */
  function mainMenu({title = false} = {}) {
    let view = 'home';
    const render = () => {
      const s = save();
      const st = app.settings;
      const archived = app.archive();
      const progress = hasProgress(s);
      const mode = title ? 'title' : 'menu';
      const choice = (key, value, label) =>
        `<button data-set="${key}" data-value="${value}" class="muted-button ${st[key] === value ? 'selected' : ''}" aria-pressed="${st[key] === value}">${label}</button>`;
      let body;
      if (view === 'settings') {
        const zoom = (ui.zoom || 1).toFixed(2);
        body = `${header('SETTINGS', 'Make it comfortable', !title)}<div class="setting-row"><span>Sound</span><span class="choices">${choice('sound', true, 'On')}${choice('sound', false, 'Off')}</span></div><div class="setting-row"><span>Motion</span><span class="choices">${choice('motion', 'auto', 'Match system')}${choice('motion', 'reduced', 'Calm')}</span></div><div class="setting-row"><span>Zoom ${zoom}×</span><span class="choices"><button id="s-zoom-out" class="muted-button" aria-label="Zoom out" ${ui.zoom <= ZOOM_MIN ? 'disabled' : ''}>−</button><button id="s-zoom-in" class="muted-button" aria-label="Zoom in" ${ui.zoom >= ZOOM_MAX ? 'disabled' : ''}>+</button><button id="s-zoom-auto" class="muted-button">Auto</button></span></div><div class="setting-row"><span>Touch: run by default</span><span class="choices">${choice('run', true, 'On')}${choice('run', false, 'Off')}</span></div><div class="menu-list"><button id="m-back" class="primary">Back</button></div>`;
      } else if (view === 'confirm-new') {
        body = `${header('NEW GAME', 'Start over?', false)}<p class="menu-summary">${progress ? `Your current adventure (${summarize(s, species)}) will be kept as a backup you can restore from this menu.` : 'You have not made progress yet.'}${archived && progress ? ' This replaces the older backup from ' + new Date(archived.at).toLocaleDateString() + ' (' + summarize(archived.save, species) + ').' : ''}</p><div class="menu-list"><button id="m-confirm-new" class="primary">Start a new adventure</button><button id="m-cancel">Keep playing</button></div>`;
      } else if (view === 'confirm-restore') {
        body = `${header('RESTORE', 'Go back to your earlier adventure?', false)}<p class="menu-summary">Restores ${summarize(archived.save, species)}, archived ${new Date(archived.at).toLocaleDateString()}. Your current adventure (${summarize(s, species)}) becomes the backup, so nothing is lost.</p><div class="menu-list"><button id="m-confirm-restore" class="primary">Restore it</button><button id="m-cancel">Cancel</button></div>`;
      } else {
        body = `${header('MOSSVALE', title ? 'Beyond the meadow' : 'Menu', !title)}<p class="menu-summary">${progress ? summarize(s, species) : 'A new adventure awaits.'}${app.saveNote ? '<br><small>' + app.saveNote + '</small>' : ''}</p><div class="menu-list"><button id="m-primary" class="primary">${title ? (progress ? 'Continue' : 'Start adventure') : 'Back to the game'}</button><button id="m-settings">Settings</button>${progress ? `<button id="m-new" ${app.canStartOver() ? '' : 'disabled'}>New game</button>` : ''}${archived ? `<button id="m-restore" ${app.canStartOver() ? '' : 'disabled'}>Restore previous adventure<small>${summarize(archived.save, species)}</small></button>` : ''}</div>`;
      }
      open(body, mode, title ? 'Mossvale' : 'Game menu');
      wireClose();
      const on = (id, fn) => {
        if ($(id)) $(id).onclick = fn;
      };
      const go = next => () => {
        view = next;
        render();
      };
      on('#m-primary', () => (title ? actions.startPlaying() : actions.close()));
      on('#m-settings', go('settings'));
      on('#m-back', go('home'));
      on('#m-cancel', go('home'));
      on('#m-new', go('confirm-new'));
      on('#m-restore', go('confirm-restore'));
      on('#m-confirm-new', () => actions.newGame());
      on('#m-confirm-restore', () => actions.restoreAdventure());
      for (const b of document.querySelectorAll('[data-set]')) {
        b.onclick = () => {
          actions.setSetting(b.dataset.set, b.dataset.value === 'true' ? true : b.dataset.value === 'false' ? false : b.dataset.value);
          render();
        };
      }
      on('#s-zoom-in', () => (actions.setZoom(ui.zoom + 0.2), render()));
      on('#s-zoom-out', () => (actions.setZoom(ui.zoom - 0.2), render()));
      on('#s-zoom-auto', () => (actions.setZoom(null), render()));
      requestAnimationFrame(() =>
        ($('#m-primary') || $('#m-back') || $('#m-confirm-new') || $('#m-confirm-restore') || $('#modal')).focus({preventScroll: true}),
      );
    };
    render();
  }

  return {mainMenu, worldMap, journal, party, ranger, shrine, result, help, saveNotice};
}
