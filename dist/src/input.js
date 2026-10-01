/* Keyboard and touch input. Writes `ui.keys` / `ui.touch`; the main loop converts them into movement. */
import {$} from './ui/dom.js';

const MOVE_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];

export const isMoving = ui => !!ui.touch || MOVE_KEYS.some(k => ui.keys[k]);

/** Screen-space direction (-1..1 on each axis) from touch or keys. */
export function direction(ui) {
  const k = ui.keys;
  return ui.touch ? ui.touch : [(k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0), (k.s || k.arrowdown ? 1 : 0) - (k.w || k.arrowup ? 1 : 0)];
}

export function installInput(app) {
  const {ui, actions, persist} = app;
  const releaseAll = () => {
    ui.keys = {};
    ui.touch = null;
  };

  $('#touch-run').onclick = () => {
    ui.touchRun = !ui.touchRun;
    $('#touch-run').setAttribute('aria-pressed', String(ui.touchRun));
  };
  for (const b of document.querySelectorAll('[data-dir]')) {
    b.onpointerdown = e => {
      if (ui.modalMode || ui.paused) return;
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      ui.touch = b.dataset.dir.split(',').map(Number);
    };
    b.onpointerup = b.onpointercancel = () => (ui.touch = null);
  }

  window.addEventListener('keydown', e => {
    if (!ui.ready) return;
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k) && !ui.modalMode) e.preventDefault();
    if (ui.modalMode) {
      if (k === 'escape') {
        e.preventDefault();
        actions.close();
        return;
      }
      if (k === 'tab') {
        const modal = $('#modal');
        const focusable = [...modal.querySelectorAll('button:not(:disabled),[tabindex="0"]')];
        if (focusable.length) {
          const first = focusable[0];
          const last = focusable.at(-1);
          if (e.shiftKey && (document.activeElement === first || document.activeElement === modal)) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === modal)) {
            e.preventDefault();
            first.focus();
          }
        }
        return;
      }
      if (ui.modalMode === 'battle' && !e.repeat && ['1', '2', '3', '4', '5', '6'].includes(k)) {
        e.preventDefault();
        const button = $('#' + ['attack', 'element', 'catch', 'potion', 'guard', 'switch'][+k - 1]);
        if (button && !button.disabled) button.click();
      }
      return;
    }
    if (e.repeat && ['e', 'm', 'j', 'q'].includes(k)) return;
    if (k === 'e') actions.interact();
    else if (k === 'm') actions.worldMap();
    else if (k === 'j') actions.journal();
    else if (k === 'q') actions.party();
    else ui.keys[k] = true;
  });
  window.addEventListener('keyup', e => (ui.keys[e.key.toLowerCase()] = false));
  window.addEventListener('blur', () => {
    releaseAll();
    persist();
  });
  document.addEventListener('visibilitychange', () => {
    releaseAll();
    persist();
  });
  window.addEventListener('pagehide', persist);
}
