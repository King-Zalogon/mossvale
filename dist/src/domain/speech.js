/* Speech bubbles (#84), the pure part: who may speak, how a long line is split into readable pages, and where a bubble
   goes so it stays on screen while its tail still points at the speaker. No DOM here; ui/bubbles.js draws it. */

/** Speakers every adventure understands. Anything else must be a landmark id on the same map. */
export const SPEAKER_KEYWORDS = ['player', 'companion', 'narrator'];
export const PAGE_CHARS = 150;

/** An error message if `ref` cannot name a speaker on a map with these landmark ids, otherwise null. */
export function speakerProblem(ref, landmarkIds) {
  if (typeof ref !== 'string' || !ref) return 'speaker must be text';
  if (SPEAKER_KEYWORDS.includes(ref) || landmarkIds.has(ref)) return null;
  return `unknown speaker "${ref}" (use ${SPEAKER_KEYWORDS.join(', ')} or a landmark id of this map)`;
}

/** Splits text into pages of at most `max` characters, at sentence ends where possible, otherwise at spaces. */
export function paginate(text, max = PAGE_CHARS) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= max) return [clean];
  const sentences = clean.match(/[^.!?…]+(?:[.!?…]+["”’)]*|$)\s*/g) ?? [clean];
  const pieces = [];
  for (const sentence of sentences) {
    let rest = sentence.trim();
    while (rest.length > max) {
      let cut = rest.lastIndexOf(' ', max);
      if (cut < max / 2) cut = max; // an unbroken run: cut inside it rather than loop
      pieces.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) pieces.push(rest);
  }
  const pages = [];
  for (const piece of pieces) {
    const last = pages.length - 1;
    if (last >= 0 && pages[last].length + 1 + piece.length <= max) pages[last] += ' ' + piece;
    else pages.push(piece);
  }
  return pages;
}

/**
 * Turns dialogue items ({speaker?, text}) into the pages a conversation shows. A missing speaker becomes
 * `fallback` (the character being talked to, or 'narrator'); each page keeps its speaker.
 */
export function conversationSteps(items, fallback = 'narrator') {
  const steps = [];
  for (const item of items ?? []) {
    const speaker = typeof item?.speaker === 'string' && item.speaker ? item.speaker : fallback;
    for (const text of paginate(item?.text ?? '')) steps.push({speaker, text});
  }
  return steps;
}

/**
 * Where to put a bubble. All numbers are in the same pixel space (the game viewport).
 * @param {{x:number, headY:number, feetY:number}|null} anchor the speaker's top-centre and feet; null for a narrator
 * @param {{w:number,h:number}} size the bubble's size
 * @param {{w:number,h:number}} bounds the viewport
 * @returns {{left:number, top:number, side:'above'|'below'|'none', tail:number}} `tail` is the tail's x inside the bubble
 */
export function placeBubble({anchor, size, bounds, margin = 8, gap = 12, tailInset = 18}) {
  const maxLeft = Math.max(margin, bounds.w - size.w - margin);
  if (!anchor) return {left: Math.min(maxLeft, Math.max(margin, (bounds.w - size.w) / 2)), top: margin + 36, side: 'none', tail: size.w / 2};
  const left = Math.min(maxLeft, Math.max(margin, anchor.x - size.w / 2));
  const above = anchor.headY - gap - size.h;
  const below = anchor.feetY + gap;
  let top;
  let side;
  if (above >= margin) [top, side] = [above, 'above'];
  else if (below + size.h <= bounds.h - margin) [top, side] = [below, 'below'];
  else [top, side] = [Math.min(Math.max(margin, above), Math.max(margin, bounds.h - size.h - margin)), 'above']; // no room either way: stay on screen
  const tail = Math.min(size.w - tailInset, Math.max(tailInset, anchor.x - left));
  return {left, top, side, tail};
}
