/* What the player has explored (#73), the pure part. Each map is divided into CELL x CELL tile cells; a cell is
   "explored" once the player has come within VISION tiles of it. Landmarks become "discovered" when the player gets
   close; optional secrets (landmark `secret: true`) only at SECRET_RANGE. The record is a bit mask per map plus a short
   list of landmark ids, written into the save as {c: hex, d: [ids]} (a 128x128 map needs at most 256 hex characters).
   In memory an entry is {cells: Uint8Array|null, hex?: string, seen: string[], rev: number}; `rev` bumps on change so
   drawing code can cache. */

export const CELL = 4;
export const VISION = 6;
export const SECRET_RANGE = 2.5;
export const MAX_SEEN = 64;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const cellGrid = (w, h) => ({cw: Math.ceil(w / CELL), ch: Math.ceil(h / CELL)});
const byteCount = (w, h) => {
  const {cw, ch} = cellGrid(w, h);
  return Math.ceil((cw * ch) / 8);
};

/** The entry for a map, created (or decoded from a pending hex string) as needed. */
export function entryFor(explored, mapId, w, h) {
  let entry = explored[mapId];
  if (!entry) entry = explored[mapId] = {cells: null, seen: [], rev: 0};
  if (!entry.cells || entry.cells.length !== byteCount(w, h)) {
    entry.cells = fromHex(entry.hex, byteCount(w, h));
    delete entry.hex;
    entry.rev++;
  }
  return entry;
}

export function isRevealed(entry, w, h, x, y) {
  if (!entry?.cells) return false;
  const {cw} = cellGrid(w, h);
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  if (cx < 0 || cy < 0 || cx >= cw || cy >= cellGrid(w, h).ch) return false;
  const i = cy * cw + cx;
  return (entry.cells[i >> 3] & (1 << (i & 7))) !== 0;
}

/** Marks the cells within `radius` tiles of (x, y). Returns how many are new. */
export function reveal(entry, w, h, x, y, radius = VISION) {
  const {cw, ch} = cellGrid(w, h);
  let added = 0;
  const x0 = Math.max(0, Math.floor((x - radius) / CELL));
  const x1 = Math.min(cw - 1, Math.floor((x + radius) / CELL));
  const y0 = Math.max(0, Math.floor((y - radius) / CELL));
  const y1 = Math.min(ch - 1, Math.floor((y + radius) / CELL));
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      // The cell counts when its nearest point is within sight, so a cell you can see the edge of is not left dark.
      const nx = Math.min(Math.max(x, cx * CELL), cx * CELL + CELL);
      const ny = Math.min(Math.max(y, cy * CELL), cy * CELL + CELL);
      if (Math.hypot(nx - x, ny - y) > radius) continue;
      const i = cy * cw + cx;
      const bit = 1 << (i & 7);
      if (entry.cells[i >> 3] & bit) continue;
      entry.cells[i >> 3] |= bit;
      added++;
    }
  }
  if (added) entry.rev++;
  return added;
}

/** Adds landmarks (objects with a `ref`) that are close enough to be noticed. Returns the newly discovered objects. */
export function discover(entry, objects, x, y) {
  const found = [];
  for (const o of objects) {
    if (!o.ref || entry.seen.includes(o.ref) || entry.seen.length >= MAX_SEEN) continue;
    if (Math.hypot(o.x - x, o.y - y) > (o.secret ? SECRET_RANGE : VISION)) continue;
    entry.seen.push(o.ref);
    found.push(o);
  }
  if (found.length) entry.rev++;
  return found;
}

/** Whether a landmark should be shown on a map: found already, and secrets only once found. */
export const isKnown = (entry, o) => !!o.ref && !!entry?.seen.includes(o.ref);

/** Share of cells explored, 0..1. */
export function exploredShare(entry, w, h) {
  if (!entry?.cells) return 0;
  const {cw, ch} = cellGrid(w, h);
  let n = 0;
  for (let i = 0; i < cw * ch; i++) if (entry.cells[i >> 3] & (1 << (i & 7))) n++;
  return n / (cw * ch);
}

const HEX = '0123456789abcdef';
export function toHex(bytes) {
  let out = '';
  for (const b of bytes) out += HEX[b >> 4] + HEX[b & 15];
  return out;
}
function fromHex(hex, length) {
  const bytes = new Uint8Array(length);
  if (typeof hex === 'string' && hex.length === length * 2 && /^[0-9a-f]*$/.test(hex))
    for (let i = 0; i < length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/** Validates the saved form {c, d} of one map's entry. Returns an in-memory entry, or null if it is not usable at all. */
export function decodeEntry(raw, dims) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const seen = Array.isArray(raw.d) ? [...new Set(raw.d.filter(id => typeof id === 'string' && ID.test(id)))].slice(0, MAX_SEEN) : [];
  const hex = typeof raw.c === 'string' && /^[0-9a-f]*$/.test(raw.c) && raw.c.length <= 2 * 4096 ? raw.c : '';
  if (!dims) return {cells: null, hex, seen, rev: 0}; // dimensions not known yet: kept as is and checked when the map loads
  return {cells: fromHex(hex, byteCount(dims.w, dims.h)), seen, rev: 0};
}

/** The saved form of an entry, or null when there is nothing to keep. */
export function encodeEntry(entry) {
  const hex = entry.cells ? toHex(entry.cells) : (entry.hex ?? '');
  if (!entry.seen.length && !/[1-9a-f]/.test(hex)) return null;
  return {c: hex, d: entry.seen};
}

const KIND_LABEL = {shrine: 'Shrine', ranger: 'Ranger post', chest: 'Treasure', sign: 'Signpost', cottage: 'Cottage', gate: 'Trail'};
/** The name a map shows for a landmark: its `mapLabel`, a trail's destination, its name, a short tag, or its kind. */
export const landmarkLabel = (o, destination) =>
  o.mapLabel ?? (o.kind === 'gate' && destination ? `Trail to ${destination}` : (o.name ?? o.tag ?? KIND_LABEL[o.kind] ?? 'Landmark'));

/** A short authored find notice; older packs keep a named, spoiler-safe fallback. */
export const discoveryNotice = o => o.discoveryText ?? `Found ${landmarkLabel(o)}.`;

const POINTS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
/** Direction of a world offset as it appears on screen, where north is up the isometric view. */
export function compass(dx, dy) {
  if (Math.hypot(dx, dy) < 1.5) return 'here';
  const angle = Math.atan2((dx - dy) * 2.2, -(dx + dy) * 1.55); // 0 = up the screen, clockwise
  return POINTS[Math.round(((angle + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 4)) % 8];
}
