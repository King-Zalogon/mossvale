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

/** Shows modal content and records which menu is open in `ui.modalMode`. */
export function openModal(ui, content, mode, label = 'Game menu') {
  if (!ui.modalMode) ui.modalFocus = document.activeElement;
  ui.modalMode = mode;
  ui.keys = {};
  ui.touch = null;
  document.body.classList.add('modal-open');
  const m = $('#modal');
  m.innerHTML = content;
  m.hidden = false;
  m.setAttribute('aria-label', label);
  m.scrollTop = 0;
  $('#interact').style.display = 'none';
  requestAnimationFrame(() => m.focus({preventScroll: true}));
}

export function hideModal(ui, canvas) {
  $('#modal').hidden = true;
  ui.modalMode = '';
  document.body.classList.remove('modal-open');
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
