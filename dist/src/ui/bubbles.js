/* Comic speech bubbles (#84): dialogue shown in a text globe above the speaker, with a tail pointing at them.
   The text is plain DOM (selectable, scalable, read by screen readers); only the anchor comes from the world renderer.
   Rules (domain/speech.js): pages are short, a narrator has no tail, and the bubble always stays inside the viewport. */
import {conversationSteps, placeBubble} from '../domain/speech.js';
import {$} from './dom.js';

/**
 * @param app the app object; uses `ui`, `canvas`, `renderer` (set after creation) and `resolveSpeaker(ref)`, which returns
 *            `{x, y, id, w, kind?, name?}` for a character in the world or null for a narrator / someone not present
 */
export function createBubbles(app) {
  const {ui, canvas} = app;
  const el = () => $('#speech');
  let conversation = null; // {steps, index, onDone, entities}

  const viewport = () => el().parentElement;
  const toViewport = (anchor, box) => {
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width / canvas.width;
    const sy = rect.height / canvas.height;
    const dx = rect.left - box.left;
    const dy = rect.top - box.top;
    return {x: dx + anchor.x * sx, headY: dy + anchor.headY * sy, feetY: dy + anchor.feetY * sy};
  };

  function render() {
    const step = conversation.steps[conversation.index];
    const entity = app.resolveSpeaker(step.speaker);
    const last = conversation.index === conversation.steps.length - 1;
    const bubble = el();
    const q = selector => bubble.querySelector(selector);
    q('.speech-name').textContent = entity?.name ?? '';
    q('.speech-name').hidden = !entity?.name;
    q('.speech-text').textContent = step.text;
    q('.speech-next').textContent = last ? 'Done' : 'Next';
    q('.speech-next').setAttribute('aria-label', last ? 'Close conversation' : 'Next line');
    q('.speech-hint').textContent =
      conversation.steps.length > 1
        ? `${conversation.index + 1} / ${conversation.steps.length} · E, Enter or tap · Esc to close`
        : 'E, Enter or tap · Esc to close';
    bubble.dataset.speaker = step.speaker;
    bubble.hidden = false;
    $('#interact').style.display = 'none'; // the "E · talk" prompt would sit on top of the conversation
    // A new line of text can change the bubble's size: place it again right away.
    update();
  }

  /** Re-anchors the bubble to its speaker; called every frame while a conversation is open (the camera and followers move). */
  function update() {
    if (!conversation) return;
    const bubble = el();
    const step = conversation.steps[conversation.index];
    const entity = app.resolveSpeaker(step.speaker);
    const parent = viewport();
    const box = parent.getBoundingClientRect();
    const raw = entity && app.renderer?.anchor ? app.renderer.anchor(entity) : null;
    const anchor = raw ? toViewport(raw, box) : null;
    const margin = 8;
    bubble.style.maxWidth = `${Math.max(140, Math.min(340, box.width - margin * 2))}px`;
    const size = {w: bubble.offsetWidth, h: bubble.offsetHeight};
    const spot = placeBubble({anchor, size, bounds: {w: box.width, h: box.height}, margin});
    bubble.style.left = `${Math.round(spot.left)}px`;
    bubble.style.top = `${Math.round(spot.top)}px`;
    bubble.style.setProperty('--tail', `${Math.round(spot.tail)}px`);
    bubble.dataset.side = spot.side;
  }

  /** The speaker's anchor in viewport pixels (for tests and tools), or null when nobody stands there. */
  function anchorOf(ref) {
    const entity = app.resolveSpeaker(ref);
    const raw = entity && app.renderer?.anchor ? app.renderer.anchor(entity) : null;
    return raw ? toViewport(raw, viewport().getBoundingClientRect()) : null;
  }

  function finish(dismissed) {
    const {onDone} = conversation;
    conversation = null;
    ui.speech = false;
    const bubble = el();
    bubble.hidden = true;
    ui.keys = {};
    ui.touch = null;
    canvas.focus({preventScroll: true}); // gameplay focus returns after the last line
    onDone?.({dismissed});
  }

  // A tap or click anywhere on the bubble (including its Next button) goes to the next line.
  el().addEventListener('click', event => {
    event.stopPropagation();
    api.advance();
  });

  const api = {
    get active() {
      return conversation !== null;
    },
    /**
     * Shows a conversation. `items` are `{speaker?, text}` (a missing speaker is `fallback`). `onDone({dismissed})` runs
     * after the last line, or straight away on Escape (a dismissed conversation skips what is left).
     */
    say(items, {fallback = 'narrator', onDone} = {}) {
      const steps = conversationSteps(items, fallback);
      if (!steps.length) return onDone?.({dismissed: false});
      if (conversation) conversation.onDone = null; // a new conversation replaces an old one without running its follow-up
      conversation = {steps, index: 0, onDone};
      ui.speech = true;
      ui.keys = {};
      ui.touch = null;
      render();
    },
    advance() {
      if (!conversation) return;
      if (conversation.index >= conversation.steps.length - 1) return finish(false);
      conversation.index++;
      render();
    },
    dismiss() {
      if (conversation) finish(true);
    },
    /** Drops any open conversation without running its follow-up (a menu opened, the map changed, the adventure is switching). */
    clear() {
      if (!conversation) return;
      conversation = null;
      ui.speech = false;
      el().hidden = true;
    },
    update,
    anchorOf,
  };
  return api;
}
