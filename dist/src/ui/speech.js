import {$} from './dom.js';

/** Small accessible, reusable comic bubble queue. Coordinates are relative to the game viewport. */
export function createSpeech({ui, canvas}) {
  const bubble = $('#speech-bubble');
  const text = $('#speech-text');
  const speaker = $('#speech-speaker');
  const next = $('#speech-next');
  let lines = [];
  let index = 0;
  let returnFocus = null;
  let anchor = null;
  let completed = null;

  const close = (finished = false) => {
    lines = [];
    index = 0;
    anchor = null;
    ui.speechActive = false;
    bubble.hidden = true;
    if (returnFocus?.isConnected) returnFocus.focus({preventScroll: true});
    else canvas.focus({preventScroll: true});
    returnFocus = null;
    const done = completed;
    completed = null;
    if (finished) done?.();
  };
  const paint = () => {
    const line = lines[index];
    if (!line) return close();
    text.textContent = line.text;
    speaker.textContent = line.name || (line.speaker === 'player' ? 'You' : 'A voice');
    next.textContent = index === lines.length - 1 ? 'Done' : 'Next';
    next.setAttribute('aria-label', index === lines.length - 1 ? 'Finish conversation' : 'Continue conversation');
  };
  next.onclick = () => {
    if (index + 1 >= lines.length) close(true);
    else {
      index++;
      paint();
    }
  };
  return {
    get active() {
      return ui.speechActive;
    },
    show(sequence, resolveAnchor, onComplete) {
      if (!sequence.length) return;
      if (!ui.speechActive) returnFocus = document.activeElement;
      lines = sequence;
      index = 0;
      anchor = resolveAnchor;
      completed = onComplete;
      ui.keys = {};
      ui.touch = null;
      $('#interact').style.display = 'none';
      ui.speechActive = true;
      bubble.hidden = false;
      paint();
      next.focus({preventScroll: true});
    },
    advance: () => next.click(),
    dismiss: () => close(false),
    position() {
      if (bubble.hidden) return;
      const line = lines[index];
      const p = line?.speaker === 'narrator' ? null : anchor?.(line);
      const rect = bubble.parentElement.getBoundingClientRect();
      const width = bubble.offsetWidth;
      const height = bubble.offsetHeight;
      const pad = 12;
      const x = p ? Math.min(rect.width - width - pad, Math.max(pad, p.x - width / 2)) : rect.width / 2 - width / 2;
      const above = p ? p.y - height - 20 : pad;
      const tailAbove = !!p && above < pad;
      const y = p ? (tailAbove ? Math.min(rect.height - height - pad, p.y + 20) : Math.min(rect.height - height - pad, above)) : pad;
      bubble.style.left = `${x}px`;
      bubble.style.top = `${y}px`;
      bubble.style.setProperty('--tail-x', `${p ? Math.min(width - 18, Math.max(18, p.x - x)) : width / 2}px`);
      bubble.classList.toggle('speech-fallback', !p);
      bubble.classList.toggle('speech-tail-top', tailAbove);
    },
  };
}
