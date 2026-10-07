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
  let activeTouchPointer = null;
  const releaseAll = () => {
    ui.keys = {};
    ui.touch = null;
    activeTouchPointer = null;
  };

  // Capability chooses the initial layout; actual play chooses subsequent input mode.
  // A touchscreen laptop must not overlay its pad on a keyboard/mouse session.
  const primaryTouch = window.matchMedia('(pointer: coarse)');
  let hasSelectedInput = false;
  const setInputMode = mode => {
    if (document.body.dataset.inputMode === mode) return;
    releaseAll();
    document.body.dataset.inputMode = mode;
    const focused = document.activeElement;
    if (mode === 'desktop' && (focused?.closest('.touchpad') || focused?.id === 'touch-run')) $('#game').focus({preventScroll: true});
  };
  const updateCapability = () => {
    if (!hasSelectedInput) setInputMode(primaryTouch.matches ? 'touch' : 'desktop');
  };
  updateCapability();
  primaryTouch.addEventListener?.('change', updateCapability);
  window.addEventListener(
    'pointerdown',
    e => {
      if (!['touch', 'pen', 'mouse'].includes(e.pointerType) || (e.sourceCapabilities?.firesTouchEvents && e.pointerType === 'mouse')) return;
      hasSelectedInput = true;
      setInputMode(e.pointerType === 'mouse' ? 'desktop' : 'touch');
    },
    {capture: true, passive: true},
  );

  $('#touch-run').onclick = () => {
    ui.touchRun = !ui.touchRun;
    $('#touch-run').setAttribute('aria-pressed', String(ui.touchRun));
  };
  for (const b of document.querySelectorAll('[data-dir]')) {
    b.onpointerdown = e => {
      if (ui.modalMode || ui.paused || ui.speechActive || ui.sceneBusy) return;
      e.preventDefault();
      if (activeTouchPointer !== null) return;
      activeTouchPointer = e.pointerId;
      b.setPointerCapture(e.pointerId);
      ui.touch = b.dataset.dir.split(',').map(Number);
    };
    b.onpointerup =
      b.onpointercancel =
      b.onlostpointercapture =
        e => {
          if (activeTouchPointer !== e.pointerId) return;
          activeTouchPointer = null;
          ui.touch = null;
        };
  }
  // Pointer capture keeps delivering movement to the pressed button. Resolve
  // the element under the finger so dragging across the pad changes direction.
  window.addEventListener(
    'pointermove',
    e => {
      if (e.pointerId !== activeTouchPointer) return;
      if (ui.modalMode || ui.paused || ui.speechActive || ui.sceneBusy) {
        ui.touch = null;
        return;
      }
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-dir]');
      ui.touch = target?.closest('.touchpad') ? target.dataset.dir.split(',').map(Number) : null;
    },
    {passive: true},
  );

  window.addEventListener('keydown', e => {
    if (!ui.ready) return;
    const k = e.key.toLowerCase();
    // Navigating a reading/menu panel does not replace the movement method.
    if (!ui.modalMode && !ui.speechActive && !e.ctrlKey && !e.metaKey && !e.altKey && (MOVE_KEYS.includes(k) || k === 'shift')) {
      hasSelectedInput = true;
      setInputMode('desktop');
    }
    if (ui.speechActive) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (k === 'tab') {
        e.preventDefault();
        const focusable = [$('#speech-bubble'), ...$('#speech-bubble').querySelectorAll('button:not(:disabled):not([hidden])')];
        const current = focusable.indexOf(document.activeElement);
        const next = (current + (e.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
        focusable[next].focus({preventScroll: true});
      } else if (['arrowdown', 'arrowup'].includes(k) && $('#speech-choices') && !$('#speech-choices').hidden) {
        const buttons = [...$('#speech-choices').querySelectorAll('button:not(:disabled)')];
        const current = buttons.indexOf(document.activeElement);
        if (buttons.length) {
          e.preventDefault();
          buttons[(current + (k === 'arrowdown' ? 1 : -1) + buttons.length) % buttons.length].focus({preventScroll: true});
        }
      } else if (['enter', ' ', 'e', 'escape'].includes(k)) {
        e.preventDefault();
        if (!e.repeat) {
          if (k === 'escape') actions.dismissSpeech();
          else if (document.activeElement.matches?.('[data-speech-choice]')) document.activeElement.click();
          else actions.advanceSpeech();
        }
      }
      return; // other keys can scroll the focused reading region without moving the player
    }
    if (ui.sceneBusy && k !== 'escape') return;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k) && !ui.modalMode) e.preventDefault();
    if (ui.modalMode) {
      if (ui.modalMode === 'ranger' && ['1', '2', '3'].includes(k)) {
        e.preventDefault();
        const buttons = [...document.querySelectorAll('#modal .ranger-actions button')];
        const button = buttons[Number(k) - 1];
        if (!e.repeat && button && !button.disabled) button.click();
        return;
      }
      if (ui.modalMode === 'result' && ['enter', ' ', 'e', 'escape'].includes(k)) {
        e.preventDefault();
        if (!e.repeat) $('#result-continue')?.click();
        return;
      }
      if (ui.modalMode === 'map' && !e.ctrlKey && !e.metaKey && !e.altKey && app.areaMap?.key(k)) {
        e.preventDefault(); // the area map pans and zooms with the keys
        return;
      }
      if (k === 'escape') {
        e.preventDefault();
        actions.close();
        return;
      }
      if (k === 'tab') {
        const modal = $('#modal');
        const focusable = [
          ...modal.querySelectorAll(
            'button:not(:disabled),textarea:not(:disabled),input:not(:disabled):not([hidden]),select:not(:disabled),a[href],[tabindex="0"]',
          ),
        ];
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
    if (e.repeat && ['e', 'm', 'j', 'q', 'escape'].includes(k)) return;
    if (k === 'escape') {
      actions.menu();
      return;
    }
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
  window.addEventListener('orientationchange', releaseAll);
  document.addEventListener('visibilitychange', () => {
    releaseAll();
    if (document.hidden) actions.flushPlayback();
    persist();
  });
  window.addEventListener('pagehide', () => {
    releaseAll();
    actions.flushPlayback();
    persist();
  });
}
