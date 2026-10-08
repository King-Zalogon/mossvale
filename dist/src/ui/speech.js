import {$} from './dom.js';

/** Small accessible, reusable comic bubble queue. Coordinates are relative to the game viewport. */
export function createSpeech({ui, canvas, onEvent = () => {}}) {
  const bubble = $('#speech-bubble');
  bubble.tabIndex = 0;
  const text = $('#speech-text');
  const speaker = $('#speech-speaker');
  const next = $('#speech-next');
  const choiceList = $('#speech-choices');
  let lines = [];
  let index = 0;
  let returnFocus = null;
  let anchor = null;
  let completed = null;
  let dialogueId = '';
  let choices = [];
  let onChoice = null;
  let choicesVisible = false;

  const close = (finished = false) => {
    if (dialogueId) onEvent(finished ? 'dialogue.finished' : 'dialogue.dismissed', {dialogueId, line: index});
    lines = [];
    index = 0;
    dialogueId = '';
    choices = [];
    onChoice = null;
    choicesVisible = false;
    choiceList.hidden = true;
    choiceList.replaceChildren();
    next.hidden = false;
    anchor = null;
    ui.speechActive = false;
    bubble.hidden = true;
    bubble.parentElement.classList.remove('speech-open');
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
    choicesVisible = false;
    choiceList.hidden = true;
    choiceList.replaceChildren();
    next.hidden = false;
    onEvent('dialogue.line', {dialogueId, line: index, speaker: line.speaker ?? 'narrator'});
    text.textContent = line.text;
    speaker.textContent = line.name || (line.speaker === 'player' ? 'You' : 'A voice');
    next.textContent = index === lines.length - 1 ? 'Done' : 'Next';
    next.setAttribute('aria-label', index === lines.length - 1 ? 'Finish conversation' : 'Continue conversation');
    next.focus({preventScroll: true});
  };
  const showChoices = () => {
    choicesVisible = true;
    choiceList.replaceChildren();
    choiceList.hidden = false;
    next.hidden = false;
    next.textContent = 'Continue';
    next.setAttribute('aria-label', 'Continue without choosing');
    text.textContent = 'Choose a response.';
    const buttons = choices.map(choice => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.speechChoice = choice.id;
      button.textContent = choice.text;
      button.onclick = () => {
        if (!choicesVisible) return;
        choicesVisible = false;
        choiceList.hidden = true;
        next.hidden = false;
        choices = [];
        const select = onChoice;
        onChoice = null;
        select?.(choice);
      };
      choiceList.append(button);
      return button;
    });
    buttons[0]?.focus({preventScroll: true});
  };
  next.onclick = () => {
    if (choicesVisible) close(true);
    else if (index + 1 >= lines.length && choices.length) showChoices();
    else if (index + 1 >= lines.length) close(true);
    else {
      index++;
      paint();
    }
  };
  return {
    get active() {
      return ui.speechActive;
    },
    show(sequence, resolveAnchor, onComplete, options = {}) {
      if (!sequence.length) return;
      if (!ui.speechActive) returnFocus = document.activeElement;
      lines = sequence;
      index = 0;
      dialogueId = sequence[0].id ?? `speaker-${sequence[0].speaker ?? 'narrator'}`;
      anchor = resolveAnchor;
      completed = onComplete;
      choices = options.choices ?? [];
      onChoice = options.onChoice ?? null;
      ui.keys = {};
      ui.touch = null;
      $('#interact').style.display = 'none';
      ui.speechActive = true;
      bubble.parentElement.classList.add('speech-open');
      bubble.hidden = false;
      onEvent('dialogue.started', {dialogueId, lines: sequence.length});
      paint();
      next.focus({preventScroll: true});
    },
    advance: () => next.click(),
    get choicesActive() {
      return choicesVisible;
    },
    dismiss: () => close(false),
    position() {
      if (bubble.hidden) return;
      const line = lines[index];
      const p = line?.speaker === 'narrator' ? null : anchor?.(line);
      const viewport = bubble.parentElement;
      const rect = viewport.getBoundingClientRect();
      const safeBottoms = [];
      for (const control of [$('.touchpad'), $('#touch-run'), viewport.parentElement.querySelector('.game-footer')]) {
        if (!control || getComputedStyle(control).display === 'none') continue;
        const controlRect = control.getBoundingClientRect();
        if (controlRect.bottom <= rect.top || controlRect.top >= rect.bottom) continue;
        safeBottoms.push(Math.max(0, rect.bottom - controlRect.top));
      }
      const safeBottom = Math.min(rect.height - 24, Math.max(12, ...safeBottoms) + 12);
      let maxHeight = Math.max(64, rect.height - safeBottom - 24);
      bubble.style.left = '50%';
      bubble.style.right = 'auto';
      bubble.style.top = 'auto';
      bubble.style.bottom = `${safeBottom}px`;
      bubble.style.setProperty('--speech-max-height', `${maxHeight}px`);

      let box = bubble.getBoundingClientRect();
      const localTop = box.top - rect.top;
      const localLeft = box.left - rect.left;
      const overlapsActor = candidate =>
        !!p && localLeft < p.x + 32 && localLeft + box.width > p.x - 32 && candidate < p.y + 18 && candidate + box.height > p.y - 58;
      if (overlapsActor(localTop)) {
        // Keep the familiar lower, centered layout unless it would cover the person or landmark being read.
        const above = p.y - 66 - box.height;
        if (above >= 12) {
          bubble.style.top = `${above}px`;
          bubble.style.bottom = 'auto';
        } else {
          maxHeight = Math.max(64, Math.min(maxHeight, p.y - 78));
          bubble.style.setProperty('--speech-max-height', `${maxHeight}px`);
          box = bubble.getBoundingClientRect();
          bubble.style.top = `${Math.max(12, p.y - 66 - box.height)}px`;
          bubble.style.bottom = 'auto';
        }
      }
    },
  };
}
