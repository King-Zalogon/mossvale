/* Side panel, region banner and status text. Reads state and writes DOM; no game rules. */
import {species} from '../data/species.js';
import {regions} from '../data/regions.js';
import {companion, level, maxHP, xpProgress} from '../domain/rules.js';
import {drawCreature} from '../render/sprites.js';
import {$} from './dom.js';

export function renderRegion(region, map = null) {
  const r = regions[region];
  const mapName = map?.name ?? r.name;
  $('#region-name').textContent = mapName;
  $('#region-subtitle').textContent = mapName === r.name ? r.subtitle : `${r.name} · ${r.subtitle}`;
  $('#area-number').textContent = 'AREA 0' + (region + 1);
  $('#world-tag').textContent = '✦  ' + r.tag;
  $('#coordinates').textContent = mapName.toUpperCase();
}

/** `q` = current objective (see domain/objectives.js), or null before the adventure data has loaded. */
export function renderHud(save, q = null) {
  const s = species[save.active];
  const c = companion(save);
  const hp = maxHP(save, save.active);
  $('#companion-name').textContent = s.name;
  $('#companion-desc').textContent = s.desc;
  $('#companion-type').textContent = s.type.toUpperCase();
  $('#companion-type').style.background = s.color + '33';
  $('#companion-type').style.color = s.color;
  $('#level').textContent = 'LV. ' + level(save, save.active);
  $('#health').textContent = `${c.hp} / ${hp}`;
  $('#hpbar').style.width = (c.hp / hp) * 100 + '%';
  $('#hpbar').style.background = s.color;
  const xp = xpProgress(save, save.active);
  $('#xp-label').textContent = xp.maxed ? 'MAX LEVEL' : `${xp.into} / ${xp.needed} XP`;
  $('#xpbar').style.width = (xp.into / xp.needed) * 100 + '%';
  $('#orbs').textContent = save.orbs;
  $('#potions').textContent = save.potions;
  $('#coins').textContent = save.coins;
  $('#count').textContent = `${save.caught.length} befriended · ${save.seen.length} / ${species.length} seen`;
  $('#badge-count').textContent = `${save.badges.length} / ${regions.length} shrine seals`;
  if (!q) return drawCreature($('#buddy'), save.active, 106);
  $('#quest-title').textContent = q.title;
  $('#quest-copy').textContent = q.copy;
  $('#quest-step').textContent = q.step;
  $('#quest-lines').innerHTML = q.lines.map(([done, text]) => `<div class="quest-line"><span>${done ? '✓' : '○'}</span>${text}</div>`).join('');
  $('#objective-pin').textContent = q.pin;
  drawCreature($('#buddy'), save.active, 106);
}

/** @param {'saved'|'session-only'|'unavailable'} status */
export function renderSaveStatus(status, message = '') {
  if (status === 'saved') {
    $('#saved').textContent = 'PROGRESS SAVED';
    $('#save-note').textContent = 'Progress saves on this device.';
  } else {
    $('#saved').textContent = 'SESSION ONLY';
    if (status === 'unavailable') $('#save-note').textContent = message || 'Storage unavailable. Keep this tab open to retain progress.';
  }
}
