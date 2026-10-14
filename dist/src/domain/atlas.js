/* The regional atlas (#276), the pure part. Builds a spoiler-safe route graph of the adventure from the validated maps
   (their exits) and what this save has disclosed. It never reads anything the player has not earned:
     - a place is `visited` once the save lists its map, `known` when a visited map's trail sign leading to it has been
       noticed (domain/discovery.js `seen`), and otherwise it is not in the graph at all;
     - a concealed route (an exit with `route`) and the place only it leads to stay out until that route is discovered;
     - `locked` marks a known place whose trail still needs a seal (`requires`) or whose region is not open yet.
   Positions come from where each exit sits on its map, so the picture agrees with the real geography without any extra
   authored data. Pure and deterministic: no DOM, no randomness, no clock. */
import {companionRouteDiscovered} from './companion-routes.js';

export const STATES = ['current', 'visited', 'known'];
const DIRECTIONS = [
  [1, 0, 'east'],
  [-1, 0, 'west'],
  [0, 1, 'south'],
  [0, -1, 'north'],
];

/** Which way an exit leaves its map: the side of the map it stands closest to. */
export function exitDirection(gate, size) {
  const dx = gate.x / size.w - 0.5;
  const dy = gate.y / size.h - 0.5;
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'east' : 'west') : dy >= 0 ? 'south' : 'north';
}

/**
 * @param {{maps: object[], entryId: string, save: object, regionOf: (map: object) => number, unlocked: (save: object, region: number) => boolean, flagDone: (save: object, flag: string) => boolean}} input
 *   `maps` are the compiled maps in pack order; each has `id`, `name`, `size` and `objects` (gates carry `ref`, `target`, `targetName`, `requires`, `route`).
 * @returns {{nodes: object[], edges: object[], hasUnmapped: boolean, bounds: {minX: number, maxX: number, minY: number, maxY: number}}}
 */
export function buildAtlas({maps, entryId, save, regionOf, unlocked, flagDone}) {
  const byId = new Map(maps.map(map => [map.id, map]));
  const visitedIds = new Set(save.visitedMaps ?? []);
  if (save.mapId) visitedIds.add(save.mapId);
  const seenOn = mapId => new Set(save.explored?.[mapId]?.seen ?? []);

  /** Gates of a visited map the player can currently see: not concealed (or discovered), and noticed or already walked. */
  const shownGates = map => {
    const seen = seenOn(map.id);
    return map.objects.filter(o => {
      if (o.kind !== 'gate' || !byId.has(o.target)) return false;
      if (o.route && !companionRouteDiscovered(save, map.id, o.route.id)) return false;
      return visitedIds.has(o.target) || seen.has(o.ref);
    });
  };

  // Which places the player knows exist, and the connections between them.
  const known = new Set();
  const gates = [];
  for (const map of maps) {
    if (!visitedIds.has(map.id)) continue;
    known.add(map.id);
    for (const gate of shownGates(map)) {
      known.add(gate.target);
      gates.push({map, gate});
    }
  }

  // Geography: place each place next to the one whose trail leads to it (or from it), on the side the trail leaves from.
  const place = new Map();
  const taken = new Set();
  const key = (x, y) => `${x},${y}`;
  const order = maps.map(map => map.id).filter(id => known.has(id));
  const put = (id, x, y) => {
    place.set(id, [x, y]);
    taken.add(key(x, y));
    queue.push(id);
  };
  const queue = [];
  if (known.has(entryId)) put(entryId, 0, 0);
  while (place.size < order.length) {
    if (!queue.length) {
      // A place no shown trail connects to the entry (for example after a long jump): park it on a fresh row.
      const loose = order.find(id => !place.has(id));
      put(loose, 0, place.size ? Math.max(...[...place.values()].map(([, y]) => y)) + 2 : 0);
    }
    const id = queue.shift();
    const [x, y] = place.get(id);
    const links = [
      ...gates.filter(item => item.map.id === id).map(item => ({other: item.gate.target, side: exitDirection(item.gate, item.map.size), ref: item.gate.ref})),
      ...gates
        .filter(item => item.gate.target === id)
        .map(item => ({other: item.map.id, side: opposite(exitDirection(item.gate, item.map.size)), ref: item.gate.ref})),
    ].sort((a, b) => compare(a.other, b.other) || compare(a.ref, b.ref));
    for (const {other, side} of links) {
      if (place.has(other)) continue;
      const choices = [DIRECTIONS.find(direction => direction[2] === side), ...DIRECTIONS.filter(direction => direction[2] !== side)];
      for (let step = 1; step < 8 && !place.has(other); step++) {
        const slot = choices.map(([dx, dy]) => [x + dx * step, y + dy * step]).find(([nx, ny]) => !taken.has(key(nx, ny)));
        if (slot) put(other, slot[0], slot[1]);
      }
    }
  }

  const nodes = order.map(id => {
    const map = byId.get(id);
    const state = id === save.mapId ? 'current' : visitedIds.has(id) ? 'visited' : 'known';
    const region = regionOf(map);
    const opened = unlocked(save, region);
    // A known place is locked while every shown trail into it still needs a seal, or its region is closed.
    const into = gates.filter(item => item.gate.target === id);
    const blockers = into.filter(item => item.gate.requires && !flagDone(save, item.gate.requires));
    const locked = state === 'known' && (!opened || (into.length > 0 && blockers.length === into.length));
    return {
      id,
      name: map.name,
      state,
      locked,
      lockedBy: locked ? (blockers[0]?.gate.requires ?? null) : null,
      region,
      // Travel is offered only for places the player has already been, never for ones merely known to exist.
      canTravel: (state === 'visited' || state === 'current') && opened,
      at: place.get(id),
    };
  });

  // One edge per pair of places (two-way when both trails are shown), with what each direction still needs.
  const edges = [];
  const edgeFor = new Map();
  for (const {map, gate} of gates) {
    const pair = [map.id, gate.target].sort();
    const id = pair.join('|');
    const need = gate.requires && !flagDone(save, gate.requires) ? gate.requires : null;
    let edge = edgeFor.get(id);
    if (!edge) {
      edge = {id, from: pair[0], to: pair[1], forward: undefined, backward: undefined, concealed: false};
      edgeFor.set(id, edge);
      edges.push(edge);
    }
    edge[map.id === pair[0] ? 'forward' : 'backward'] = need;
    edge.concealed ||= Boolean(gate.route);
  }
  for (const edge of edges) {
    edge.returns = edge.forward !== undefined && edge.backward !== undefined;
    // A trail shown in only one direction points the way it goes; normalise so `from` is where it starts.
    if (!edge.returns && edge.backward !== undefined) [edge.from, edge.to, edge.forward, edge.backward] = [edge.to, edge.from, edge.backward, undefined];
    edge.forward ??= null;
    edge.backward ??= edge.returns ? null : undefined;
  }
  edges.sort((a, b) => compare(a.id, b.id));

  const coords = nodes.map(node => node.at);
  const bounds = {
    minX: Math.min(0, ...coords.map(([x]) => x)),
    maxX: Math.max(0, ...coords.map(([x]) => x)),
    minY: Math.min(0, ...coords.map(([, y]) => y)),
    maxY: Math.max(0, ...coords.map(([, y]) => y)),
  };
  // Only a yes/no: whether anything in the pack is still off the atlas. It never says what or how many.
  return {nodes, edges, hasUnmapped: maps.some(map => !known.has(map.id)), bounds};
}

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function opposite(side) {
  return {east: 'west', west: 'east', north: 'south', south: 'north'}[side];
}

/** The shortest chain of places from `fromId` to `toId` over shown trails that are open in that direction; `[]` when none. */
export function routeBetween(atlas, fromId, toId) {
  if (fromId === toId) return [fromId];
  const steps = id =>
    atlas.edges.flatMap(edge => {
      const out = [];
      if (edge.from === id && edge.forward === null) out.push(edge.to);
      if (edge.returns && edge.to === id && edge.backward === null) out.push(edge.from);
      return out;
    });
  const previous = new Map([[fromId, null]]);
  const queue = [fromId];
  while (queue.length) {
    const id = queue.shift();
    for (const next of steps(id).sort(compare)) {
      if (previous.has(next)) continue;
      previous.set(next, id);
      if (next === toId) {
        const path = [];
        for (let at = toId; at !== null; at = previous.get(at)) path.unshift(at);
        return path;
      }
      queue.push(next);
    }
  }
  return [];
}
