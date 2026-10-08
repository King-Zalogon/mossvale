import {isWalkable, zoneAt} from '../../dist/src/domain/world.js';

const key = (x, y) => `${x},${y}`;
const pointKey = point => key(point.x, point.y);
const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** Build a conservative tile-center graph with the same collision query and movement directions as the game. */
export function buildWalkGraph(world) {
  const nodes = new Map();
  const {w, h} = world.map.size;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (isWalkable(world, x, y)) nodes.set(key(x, y), {x, y, neighbors: []});
    }
  for (const node of nodes.values())
    for (const [dx, dy] of DIRECTIONS) {
      const neighbor = nodes.get(key(node.x + dx, node.y + dy));
      if (!neighbor) continue;
      if (dx && dy && !nodes.has(key(node.x + dx, node.y)) && !nodes.has(key(node.x, node.y + dy))) continue;
      node.neighbors.push(neighbor);
    }
  return nodes;
}

function flood(nodes, starts, blocked = new Set()) {
  const distance = new Map();
  const previous = new Map();
  const queue = [];
  for (const start of starts)
    if (nodes.has(pointKey(start)) && !blocked.has(pointKey(start)) && !distance.has(pointKey(start))) {
      const id = pointKey(start);
      distance.set(id, 0);
      queue.push(nodes.get(id));
    }
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    const id = key(current.x, current.y);
    for (const next of current.neighbors) {
      const nextId = key(next.x, next.y);
      if (blocked.has(nextId) || distance.has(nextId)) continue;
      distance.set(nextId, distance.get(id) + 1);
      previous.set(nextId, id);
      queue.push(next);
    }
  }
  return {distance, previous};
}

function routeTo(goals, tree) {
  let end = null;
  let length = Infinity;
  for (const goal of goals) {
    const d = tree.distance.get(pointKey(goal));
    if (d !== undefined && d < length) ((end = pointKey(goal)), (length = d));
  }
  if (end === null) return null;
  const route = [end];
  while (tree.previous.has(route.at(-1))) route.push(tree.previous.get(route.at(-1)));
  route.reverse();
  return {length, route};
}

function goalsNear(nodes, at, radius) {
  if (!Array.isArray(at) || at.length !== 2) return [];
  return [...nodes.values()].filter(node => Math.hypot(node.x - at[0], node.y - at[1]) <= radius);
}

function nearestWalkableGoals(nodes, at, radius) {
  const candidates = goalsNear(nodes, at, radius);
  if (!candidates.length) return [];
  const closest = Math.min(...candidates.map(node => Math.hypot(node.x - at[0], node.y - at[1])));
  return candidates.filter(node => Math.abs(Math.hypot(node.x - at[0], node.y - at[1]) - closest) < 0.001);
}

function zoneGoals(nodes, world, zone) {
  return [...nodes.values()].filter(node => zoneAt(world, node.x, node.y)?.id === zone.id);
}

function hasAuthoredReward(landmark) {
  return Boolean(landmark.reward) || landmark.kind === 'chest' || landmark.kind === 'shrine';
}

function actionHasReward(action) {
  return action?.type === 'reward';
}

function rewardsInBranch(raw, path) {
  const points = [];
  for (const landmark of raw.landmarks ?? []) if (hasAuthoredReward(landmark)) points.push(landmark.at);
  for (const trigger of raw.triggers ?? []) if (trigger.events?.some(event => event.actions?.some(actionHasReward))) points.push(trigger.at);
  return points.some(at =>
    path.slice(0, -1).some(id => {
      const [x, y] = id.split(',').map(Number);
      return Math.hypot(x - at[0], y - at[1]) <= 2.5;
    }),
  );
}

function secretInBranch(raw, path) {
  const secretPoints = [
    ...(raw.landmarks ?? []).filter(item => item.secret).map(item => item.at),
    ...(raw.exits ?? []).filter(item => item.route).map(item => item.at),
  ];
  return secretPoints.some(at =>
    path.some(id => {
      const [x, y] = id.split(',').map(Number);
      return Math.hypot(x - at[0], y - at[1]) <= 2.5;
    }),
  );
}

function deadEndBranches(nodes, raw, reachable) {
  const seen = new Set();
  const branches = [];
  for (const id of reachable) {
    const node = nodes.get(id);
    if (!node || node.neighbors.length !== 1 || seen.has(id)) continue;
    const corridor = [id];
    let current = node;
    let prior = null;
    while (true) {
      const next = current.neighbors.find(item => key(item.x, item.y) !== prior);
      if (!next) break;
      const nextId = key(next.x, next.y);
      if (seen.has(nextId)) break;
      corridor.push(nextId);
      prior = key(current.x, current.y);
      current = next;
      if (current.neighbors.length !== 2) break;
      if (corridor.length > 2_000) break;
    }
    corridor.forEach(item => seen.add(item));
    if (corridor.length < 6) continue;
    const intentional = secretInBranch(raw, corridor);
    branches.push({length: corridor.length - 1, intentionalSecret: intentional, reward: rewardsInBranch(raw, corridor), endpoint: id, path: corridor});
  }
  return branches;
}

function mapExitReturns(raw, mapsById) {
  return (raw.exits ?? []).map(exit => {
    const dest = mapsById.get(exit.to.map);
    const reverses = (dest?.exits ?? []).filter(candidate => candidate.to.map === raw.id);
    const safe = reverses.find(candidate => !candidate.requires && !candidate.route);
    const result = safe ? 'safe' : reverses.length ? 'conditional' : 'missing';
    return {id: exit.id, destination: exit.to.map, result, reciprocal: reverses.map(candidate => candidate.id)};
  });
}

function mapExitCues(raw, nodes) {
  const signs = (raw.landmarks ?? []).filter(item => item.kind === 'sign' && (item.text || item.lines?.length));
  const signStarts = signs.flatMap(sign => goalsNear(nodes, sign.at, 2));
  const cueTree = flood(nodes, signStarts);
  return (raw.exits ?? []).map(exit => {
    const goals = goalsNear(nodes, exit.at, 2);
    const nearest = routeTo(goals, cueTree);
    const matchingSecret = !exit.route || signs.some(sign => sign.routeHint === exit.route.id);
    return {id: exit.id, signDistance: nearest?.length ?? null, matchingSecretHint: matchingSecret};
  });
}

function targetSpecs(raw, nodes, world) {
  const targets = [];
  for (const [name, at] of Object.entries(raw.spawns ?? {}))
    targets.push({id: `spawn:${name}`, kind: 'spawn', at, goals: nearestWalkableGoals(nodes, at, 0.8), required: true});
  for (const item of raw.landmarks ?? [])
    targets.push({
      id: `landmark:${item.id}`,
      kind: item.kind,
      at: item.at,
      goals: goalsNear(nodes, item.at, 2),
      required: ['ranger', 'shrine', 'chest'].includes(item.kind),
      secret: item.secret === true,
      reward: hasAuthoredReward(item),
      label: item.label ?? item.name ?? item.id,
    });
  for (const item of raw.exits ?? [])
    targets.push({
      id: `exit:${item.id}`,
      kind: 'exit',
      at: item.at,
      goals: goalsNear(nodes, item.at, 2),
      required: !item.route && !item.requires,
      secret: Boolean(item.route),
      reward: Boolean(item.route?.reward),
      label: item.label,
      destination: item.to.map,
    });
  for (const item of raw.triggers ?? [])
    targets.push({
      id: `trigger:${item.id}`,
      kind: 'trigger',
      at: item.at,
      goals: goalsNear(nodes, item.at, item.radius ?? 1.5),
      required: false,
      reward: Boolean(item.events?.some(event => event.actions?.some(actionHasReward))),
      label: item.id,
    });
  for (const item of raw.zones ?? [])
    targets.push({id: `zone:${item.id}`, kind: 'encounter zone', at: null, goals: zoneGoals(nodes, world, item), required: false, label: item.id, zone: item});
  for (const item of raw.quiet ?? []) {
    const [x0, y0, x1, y1] = item.rect;
    const goals = [...nodes.values()].filter(node => node.x >= x0 && node.x <= x1 && node.y >= y0 && node.y <= y1);
    targets.push({id: `quiet:${item.id}`, kind: 'quiet corridor', at: [(x0 + x1) / 2, (y0 + y1) / 2], goals, required: false, label: item.label ?? item.id});
  }
  return targets;
}

function encounterEstimate(world, route) {
  const walked = new Map();
  for (const id of route) {
    const [x, y] = id.split(',').map(Number);
    const zone = zoneAt(world, x, y);
    if (zone) walked.set(zone.id, (walked.get(zone.id) ?? 0) + 1);
  }
  let expected = 0;
  const byZone = [];
  for (const [id, cells] of walked) {
    const zone = world.map.zones.find(item => item.id === id);
    const meanGap = ((zone?.distance ?? [4, 7])[0] + (zone?.distance ?? [4, 7])[1]) / 2;
    const estimate = cells / meanGap;
    expected += estimate;
    byZone.push({id, pathTiles: cells, meanGapTiles: meanGap, expectedEncounters: Number(estimate.toFixed(2))});
  }
  return {expected: Number(expected.toFixed(2)), byZone};
}

function repeatedSilhouettes(raw) {
  const major = (raw.landmarks ?? []).filter(item => ['ranger', 'shrine', 'chest', 'cottage'].includes(item.kind));
  const sprites = new Map();
  for (const item of major) {
    const list = sprites.get(item.sprite) ?? [];
    list.push(item.id);
    sprites.set(item.sprite, list);
  }
  return [...sprites].filter(([, ids]) => ids.length > 1).map(([sprite, ids]) => ({sprite, ids}));
}

/** Analyze routes and design signals without treating heuristics as schema failures. */
export function analyzeMapDesign(map, raw, mapsById = new Map()) {
  const world = map.map ? map : (map.world ?? null);
  const nodes = buildWalkGraph(world ?? map);
  const data = world ? world.map : map;
  const targets = targetSpecs(raw, nodes, world ?? {map: data});
  const warnings = [];
  const probes = [];
  const spawnEntries = [];
  const allReachable = new Set();

  for (const [spawnName, spawn] of Object.entries(raw.spawns ?? {})) {
    const starts = nearestWalkableGoals(nodes, spawn, 0.8);
    const tree = flood(nodes, starts);
    for (const id of tree.distance.keys()) allReachable.add(id);
    let reachedTargets = 0;
    for (const target of targets) {
      const best = routeTo(target.goals, tree);
      const entry = {
        spawn: spawnName,
        target: target.id,
        kind: target.kind,
        label: target.label ?? target.id,
        required: target.required,
        routeLength: best?.length ?? null,
        alternatePath: null,
        encounter: null,
        reachable: Boolean(best),
      };
      if (best) {
        reachedTargets++;
        entry.encounter = encounterEstimate(world, best.route);
        const blocked = new Set(best.route.slice(1, -1));
        entry.alternatePath = Boolean(routeTo(target.goals, flood(nodes, starts, blocked)));
      } else {
        const encounterZone = target.kind === 'encounter zone';
        warnings.push({
          severity: 'warning',
          code: encounterZone ? 'unavailable-encounter-zone' : 'unreachable-feature',
          target: target.id,
          message: encounterZone
            ? `Encounter zone “${target.label}” has no tile where it is the active encounter zone from spawn “${spawnName}”; check its footprint and earlier zone precedence.`
            : `${target.kind} “${target.label ?? target.id}” cannot be reached from spawn “${spawnName}”.`,
        });
      }
      probes.push(entry);
    }
    spawnEntries.push({name: spawnName, reachableTiles: tree.distance.size, targetCount: targets.length, reachedTargets});
  }

  const branches = deadEndBranches(nodes, raw, allReachable);
  for (const branch of branches) {
    if (branch.intentionalSecret)
      warnings.push({
        severity: 'info',
        code: 'intentional-secret-dead-end',
        target: branch.endpoint,
        message: `A ${branch.length}-tile dead-end appears intentionally secret; inspect its reward and discovery cue.`,
      });
    else if (!branch.reward)
      warnings.push({
        severity: 'warning',
        code: 'rewardless-branch',
        target: branch.endpoint,
        message: `A ${branch.length}-tile dead-end has no nearby authored point of interest or reward.`,
      });
  }

  const exits = mapExitReturns(raw, mapsById);
  for (const exit of exits)
    if (exit.result !== 'safe')
      warnings.push({
        severity: 'warning',
        code: 'no-safe-return',
        target: `exit:${exit.id}`,
        message:
          exit.result === 'missing'
            ? `Exit “${exit.id}” reaches “${exit.destination}”, which has no authored return exit.`
            : `Exit “${exit.id}” has a return exit, but every return is gated or concealed.`,
      });

  const wayfindingCues = mapExitCues(raw, nodes);
  for (const cue of wayfindingCues)
    if (cue.signDistance === null || cue.signDistance > 12 || !cue.matchingSecretHint)
      warnings.push({
        severity: 'warning',
        code: 'missing-wayfinding-cue',
        target: `exit:${cue.id}`,
        message: cue.matchingSecretHint
          ? `Exit “${cue.id}” has no authored sign within 12 tile-centers.`
          : `Concealed route “${cue.id}” has no sign whose routeHint matches its route id.`,
      });

  for (const target of targets.filter(item => item.kind === 'trigger')) {
    if (!target.goals.length)
      warnings.push({
        severity: 'warning',
        code: 'trigger-in-collision',
        target: target.id,
        message: `Trigger “${target.label}” has no walkable activation position inside its radius.`,
      });
  }

  for (const duplicate of repeatedSilhouettes(raw))
    warnings.push({
      severity: 'warning',
      code: 'repeated-landmark-silhouette',
      target: duplicate.ids.join(','),
      message: `${duplicate.ids.length} major landmarks share sprite “${duplicate.sprite}”; their silhouettes may not distinguish locations.`,
    });

  return {
    id: raw.id,
    name: raw.name,
    size: raw.size,
    walkableTiles: nodes.size,
    reachableTiles: allReachable.size,
    coverage: nodes.size ? Number(((allReachable.size / nodes.size) * 100).toFixed(1)) : 0,
    spawns: spawnEntries,
    targets: probes,
    branches: branches.map(branch => ({length: branch.length, intentionalSecret: branch.intentionalSecret, reward: branch.reward, endpoint: branch.endpoint})),
    exits,
    wayfindingCues,
    warnings,
    raw,
    world,
  };
}

function esc(text) {
  return String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export function renderMapSvg(report) {
  const raw = report.raw;
  const world = report.world;
  const scale = 12;
  const margin = 24;
  const width = raw.size.w * scale + margin * 2;
  const height = raw.size.h * scale + margin * 2 + 60;
  const color = {void: '#152c26', ground: '#8eae77', path: '#e5cf8c', water: '#468c9a', tallgrass: '#6d9160'};
  const body = [];
  body.push(`<rect width="100%" height="100%" fill="#102922"/>`);
  body.push(
    `<text x="${margin}" y="20" fill="#eff0cc" font-family="sans-serif" font-size="14" font-weight="700">${esc(raw.name)} · ${esc(raw.id)} · ${raw.size.w}×${raw.size.h}</text>`,
  );
  for (let y = 0; y < raw.size.h; y++)
    for (let x = 0; x < raw.size.w; x++) {
      const terrain = world.map.terrainAt(x, y);
      if (terrain === 'void') continue;
      const blocked = !isWalkable(world, x, y);
      body.push(
        `<rect x="${margin + x * scale}" y="${margin + 20 + y * scale}" width="${scale - 0.35}" height="${scale - 0.35}" fill="${color[terrain]}"${blocked ? ' stroke="#d6535d" stroke-width="1.5"' : ''}/>`,
      );
    }
  for (const zone of raw.zones ?? []) {
    const rect = zone.rect ?? [0, 0, raw.size.w - 1, raw.size.h - 1];
    body.push(
      `<rect x="${margin + rect[0] * scale}" y="${margin + 20 + rect[1] * scale}" width="${(rect[2] - rect[0] + 1) * scale}" height="${(rect[3] - rect[1] + 1) * scale}" fill="#c4485a" fill-opacity=".12" stroke="#d97579" stroke-dasharray="4 3"><title>Encounter zone: ${esc(zone.id)}</title></rect>`,
    );
  }
  for (const item of raw.quiet ?? []) {
    const [x0, y0, x1, y1] = item.rect;
    body.push(
      `<rect x="${margin + x0 * scale}" y="${margin + 20 + y0 * scale}" width="${(x1 - x0) * scale}" height="${(y1 - y0) * scale}" fill="#2d9bab" fill-opacity=".16" stroke="#67ced2" stroke-dasharray="3 2"><title>Quiet corridor: ${esc(item.label ?? item.id)}</title></rect>`,
    );
  }
  const marker = (at, label, fill, shape = 'circle', secret = false, reward = false) => {
    if (!at) return;
    const cx = margin + at[0] * scale + scale / 2;
    const cy = margin + 20 + at[1] * scale + scale / 2;
    const mark =
      shape === 'square'
        ? `<rect x="${cx - 4}" y="${cy - 4}" width="8" height="8" fill="${fill}" stroke="#f5f2d4" stroke-width="1"/>`
        : `<circle cx="${cx}" cy="${cy}" r="4" fill="${fill}" stroke="#f5f2d4" stroke-width="1"/>`;
    body.push(
      `<g>${reward ? `<circle cx="${cx}" cy="${cy}" r="6.5" fill="none" stroke="#73cb86" stroke-width="2"/>` : ''}${mark}${secret ? `<circle cx="${cx}" cy="${cy}" r="8" fill="none" stroke="${fill}" stroke-width="1.5" stroke-dasharray="2 2"/>` : ''}<title>${esc(label)}${secret ? ' · secret' : ''}${reward ? ' · authored reward' : ''}</title></g>`,
    );
  };
  for (const [name, at] of Object.entries(raw.spawns ?? {})) marker(at, `Spawn: ${name}`, '#4c64bd', 'square');
  for (const exit of raw.exits ?? []) {
    const safety = report.exits.find(item => item.id === exit.id)?.result;
    const color = safety === 'missing' ? '#df5c60' : safety === 'conditional' ? '#e7a451' : '#b56add';
    marker(
      exit.at,
      `Exit: ${exit.label} → ${exit.to.map} · return ${safety ?? 'unchecked'}`,
      color,
      'square',
      Boolean(exit.route),
      Boolean(exit.route?.reward),
    );
  }
  for (const item of raw.landmarks ?? [])
    marker(item.at, `${item.kind}: ${item.label ?? item.name ?? item.id}`, item.secret ? '#f2d352' : '#e6883d', 'circle', item.secret, hasAuthoredReward(item));
  for (const item of raw.triggers ?? [])
    marker(
      item.at,
      `Trigger: ${item.id}`,
      '#ed5e9d',
      'circle',
      false,
      item.events?.some(event => event.actions?.some(actionHasReward)),
    );
  for (const branch of report.branches) {
    const [x, y] = branch.endpoint.split(',').map(Number);
    marker(
      [x, y],
      branch.intentionalSecret ? 'Intentional secret dead-end' : branch.reward ? 'Rewarded branch' : `Rewardless branch · ${branch.length} tiles`,
      branch.intentionalSecret ? '#f2d352' : branch.reward ? '#73cb86' : '#e65d5d',
    );
  }
  const legendY = margin + 24 + raw.size.h * scale;
  const legend = [
    ['#8eae77', 'walkable land'],
    ['#e5cf8c', 'path'],
    ['#468c9a', 'water'],
    ['#d6535d', 'blocked/collision'],
    ['#c4485a', 'encounter'],
    ['#2d9bab', 'quiet'],
    ['#b56add', 'exit + destination'],
    ['#73cb86', 'authored reward'],
  ];
  legend.forEach(([fill, label], i) => {
    const x = margin + (i % 3) * 205;
    const y = legendY + Math.floor(i / 3) * 18;
    body.push(
      `<rect x="${x}" y="${y - 9}" width="9" height="9" fill="${fill}"/><text x="${x + 14}" y="${y}" fill="#d8e0c6" font-family="sans-serif" font-size="10">${label}</text>`,
    );
  });
  body.push(
    `<text x="${margin}" y="${height - 6}" fill="#d8e0c6" font-family="sans-serif" font-size="10">Markers: spawn, exit, landmark, trigger · dashed rings/exit markers indicate concealed or secret content</text>`,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${body.join('')}</svg>`;
}

export function renderSummaryMarkdown(reports) {
  const rows = reports
    .map(
      report =>
        `| \`${report.id}\` | ${report.size.w}×${report.size.h} | ${report.walkableTiles} | ${report.coverage}% | ${report.targets.filter(item => item.reachable).length}/${report.targets.length} | ${report.branches.length} | ${report.warnings.filter(item => item.severity !== 'info').length} | [SVG](./${report.id}.svg) |`,
    )
    .join('\n');
  const details = reports
    .map(report => {
      const warnings = report.warnings.length
        ? report.warnings.map(item => `- **${item.severity} · ${item.code}** — ${item.message}`).join('\n')
        : '- No design warnings from the current heuristics.';
      const probes = report.targets
        .map(
          item =>
            `| ${item.spawn} | ${item.kind} · ${item.label} | ${item.required ? 'required' : 'optional'} | ${item.reachable ? `${item.routeLength} tiles` : 'unreachable'} | ${item.alternatePath ? 'yes' : item.reachable ? 'no' : '—'} | ${item.encounter ? item.encounter.expected : '—'} |`,
        )
        .join('\n');
      return `\n## ${report.name} (\`${report.id}\`)\n\n${warnings}\n\n| Spawn | Target | Role | Shortest route | Vertex-disjoint alternative | Estimated encounters* |\n| --- | --- | --- | ---: | --- | ---: |\n${probes}`;
    })
    .join('\n');
  return `# Map spatial-design report\n\nGenerated from the shipped adventure data by \`npm run maps:design-report\`. This is a deterministic authoring aid, not an automatic fun score or a substitute for walking the routes. Tile-center movement is approximated with cardinal steps; actual movement is continuous, diagonal and supports obstacle sliding. Encounter pressure assumes authored mean encounter intervals and does not replay encounter RNG or cooldown state. A warning is a playtest prompt, not a schema failure.\n\n| Map | Size | Walkable centers | Reachable coverage | Targets reachable | Dead-end branches | Design warnings | Annotated play space |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |\n${rows}\n${details}\n\n*Expected encounters is the path length inside each authored encounter zone divided by its midpoint encounter interval. It is a comparative exposure estimate, not a predicted encounter count. Alternate paths are vertex-disjoint tile-center routes after removing interior cells of the shortest route. Secret dead-ends are reported as intentional informational cues when their branch includes an authored secret or companion route.\n`;
}
