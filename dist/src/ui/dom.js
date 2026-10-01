/* Thin DOM helpers: selectors, toast, modal shell. Menus and HUD build on these. */
export const $ = selector => document.querySelector(selector);

let toastTimer;
export function toast(message, duration = 5800) {
  $('#toast').textContent = message;
  $('#toast').style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('#toast').style.opacity = '0'), duration);
}

export function header(eyebrow, title, closeButton = true) {
  return `${closeButton ? '<button class="close" aria-label="Close menu">×</button>' : ''}<div class="modal-header"><div class="eyebrow">${eyebrow}</div><h2>${title}</h2></div>`;
}

/** Parts of the page behind a dialog. They are made inert while one is open, so focus and clicks stay inside it. */
const BACKGROUND = [
  'header',
  'aside',
  '.heading',
  '.location',
  '.game-footer',
  '.touchpad',
  '#touch-run',
  '.zoom-controls',
  '.minimap-box',
  '#interact',
  '#game',
  'main > footer',
];
export function setBackgroundInert(inert) {
  for (const el of document.querySelectorAll(BACKGROUND.join(','))) el.inert = inert;
}

/** A selector that finds the same control again after the dialog is re-rendered (by id or data attribute). */
function controlSelector(el) {
  if (!el || el === document.body) return null;
  if (el.id) return '#' + CSS.escape(el.id);
  const [key, value] = Object.entries(el.dataset)[0] ?? [];
  return key ? `[data-${key.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}="${CSS.escape(value)}"]` : null;
}

/**
 * Shows modal content and records which menu is open in `ui.modalMode`.
 * Re-rendering the same dialog (battle turns, menu views) keeps the scroll position and keeps keyboard focus on the
 * same control, or on the first usable button if that control is gone or disabled.
 */
export function openModal(ui, content, mode, label = 'Game menu') {
  const m = $('#modal');
  const rerender = !m.hidden && ui.modalMode === mode;
  const scroll = rerender ? m.scrollTop : 0;
  // Remember the control with focus across renders, even while it is briefly disabled (e.g. during a battle round).
  if (!rerender) ui.focusKey = null;
  if (rerender && m.contains(document.activeElement)) ui.focusKey = controlSelector(document.activeElement) ?? ui.focusKey;
  const selector = rerender ? ui.focusKey : null;
  if (!ui.modalMode) ui.modalFocus = document.activeElement;
  ui.modalMode = mode;
  ui.keys = {};
  ui.touch = null;
  document.body.classList.add('modal-open');
  setBackgroundInert(true);
  m.innerHTML = content;
  m.hidden = false;
  m.setAttribute('aria-label', label);
  m.scrollTop = scroll;
  $('#interact').style.display = 'none';
  requestAnimationFrame(() => {
    const target = selector && m.querySelector(selector);
    if (target && !target.disabled) target.focus({preventScroll: true});
    else if (rerender && selector) (m.querySelector('button:not(:disabled)') ?? m).focus({preventScroll: true});
    else if (!rerender) m.focus({preventScroll: true});
  });
}

export function hideModal(ui, canvas) {
  $('#modal').hidden = true;
  ui.modalMode = '';
  document.body.classList.remove('modal-open');
  setBackgroundInert(false);
  const f = ui.modalFocus;
  ui.modalFocus = null;
  if (f?.isConnected && f !== document.body) f.focus({preventScroll: true});
  else canvas.focus({preventScroll: true});
  ui.keys = {};
  ui.touch = null;
}

/** Offers `text` as a file download (no server involved). */
export function downloadText(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], {type}));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
