const DIRECTIONS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
const ROWS = {
  fernling: DIRECTIONS,
  emberkin: ['south', 'southwest', 'east', 'northeast', 'north', 'west', 'northwest', 'southeast'],
  duskwing: DIRECTIONS,
  brooklet: ['north', 'northwest', 'west', 'southwest', 'south', 'southeast', 'east', 'northeast'],
  hushram: DIRECTIONS,
  voltkit: DIRECTIONS,
  mushmallow: DIRECTIONS,
  frostowl: DIRECTIONS,
  pebblit: DIRECTIONS,
  bramblebuck: DIRECTIONS,
  siltkip: DIRECTIONS,
  sunskitter: DIRECTIONS,
  sedgegnaw: DIRECTIONS,
  petalunge: DIRECTIONS,
  cindercurl: DIRECTIONS,
};
const VECTORS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
];
const FRAMES = ['idle', 'walk-1', 'walk-2', 'walk-3', 'walk-4'];
const sources = {
  player: load('../assets/people/person-red-cap-motion.png'),
  emberkin: load('../assets/creatures/creature-emberkin-follower.png'),
  fernling: load('../assets/creatures/creature-fernling-follower.png'),
  duskwing: load('../assets/creatures/creature-duskwing-follower.png'),
  brooklet: load('../assets/creatures/creature-brooklet-follower.png'),
  hushram: load('../assets/creatures/creature-hushram-follower.png'),
  voltkit: load('../assets/creatures/creature-voltkit-follower.png'),
  mushmallow: load('../assets/creatures/creature-mushmallow-follower.png'),
  frostowl: load('../assets/creatures/creature-frostowl-follower.png'),
  pebblit: load('../assets/creatures/creature-pebblit-follower.png'),
  bramblebuck: load('../assets/creatures/creature-bramblebuck-follower.png'),
  siltkip: load('../assets/creatures/creature-siltkip-follower.png'),
  sunskitter: load('../assets/creatures/creature-sunskitter-follower.png'),
  sedgegnaw: load('../assets/creatures/creature-sedgegnaw-follower.png'),
  petalunge: load('../assets/creatures/creature-petalunge-follower.png'),
  cindercurl: load('../assets/creatures/creature-cindercurl-follower.png'),
  portrait: {
    emberkin: load('../assets/creatures/creature-emberkin.png'),
    fernling: load('../assets/creatures/creature-fernling.png'),
    duskwing: load('../assets/creatures/creature-duskwing.png'),
    brooklet: load('../assets/creatures/creature-brooklet.png'),
    hushram: load('../assets/creatures/creature-hushram.png'),
    voltkit: load('../assets/creatures/creature-voltkit.png'),
    mushmallow: load('../assets/creatures/creature-mushmallow.png'),
    frostowl: load('../assets/creatures/creature-frostowl.png'),
    pebblit: load('../assets/creatures/creature-pebblit.png'),
    bramblebuck: load('../assets/creatures/creature-bramblebuck.png'),
    siltkip: load('../assets/creatures/creature-siltkip.png'),
    sunskitter: load('../assets/creatures/creature-sunskitter.png'),
    sedgegnaw: load('../assets/creatures/creature-sedgegnaw.png'),
    petalunge: load('../assets/creatures/creature-petalunge.png'),
    cindercurl: load('../assets/creatures/creature-cindercurl.png'),
  },
  tree: load('../assets/props/tree-oak.png'),
};
const stage = document.querySelector('#stage');
const ctx = stage.getContext('2d');
const speciesSelect = document.querySelector('#species');
const calm = document.querySelector('#calm');
const stateLabel = document.querySelector('#state');
let running = true;
let previousTime = 0;
let simulationTime = 0;
let player = {x: 10, y: 10, dir: 4, distance: 0};
let follower = {x: 10, y: 10, dir: 4, distance: 0};
let trail = [{x: 10, y: 10}];
let lastFollower = {x: 10, y: 10};

function load(src) {
  const image = new Image();
  image.onload = () => {
    if (document.querySelector('#atlas')) renderAtlas();
    if (stage) drawStage();
  };
  image.src = src;
  return image;
}

function drawFrame(context, image, column, row, x, groundY, width, columns, rows, fw, fh) {
  if (!image.complete || !image.naturalWidth) return;
  const sw = image.naturalWidth / columns;
  const sh = image.naturalHeight / rows;
  context.save();
  context.imageSmoothingEnabled = false;
  context.drawImage(
    image,
    column * sw,
    row * sh,
    sw,
    sh,
    Math.round(x - width / 2),
    Math.round(groundY - width * (fh / fw)),
    Math.round(width),
    Math.round(width * (fh / fw)),
  );
  context.restore();
}

function heading(dx, dy) {
  if (Math.hypot(dx, dy) < 1e-5) return null;
  const sx = dx - dy;
  const sy = dx + dy;
  const ix = Math.abs(sx) > 0.3 ? Math.sign(sx) : 0;
  const iy = Math.abs(sy) > 0.3 ? Math.sign(sy) : 0;
  if (ix > 0) return iy < 0 ? 1 : iy > 0 ? 3 : 2;
  if (ix < 0) return iy < 0 ? 7 : iy > 0 ? 5 : 6;
  return iy < 0 ? 0 : 4;
}

function pointAtGap(distance) {
  let along = 0;
  let newer = player;
  for (const older of trail) {
    const part = Math.hypot(newer.x - older.x, newer.y - older.y);
    along += part;
    if (along >= distance) return older;
    newer = older;
  }
  return trail.at(-1) ?? player;
}

function reset() {
  player = {x: 10, y: 10, dir: 4, distance: 0};
  follower = {x: 10, y: 10, dir: 4, distance: 0};
  trail = [{x: 10, y: 10}];
  lastFollower = {x: 10, y: 10};
  simulationTime = 0;
}

function advance(dt) {
  if (!running) return;
  simulationTime += dt;
  const moveMs = 700;
  const pauseMs = 260;
  const segment = moveMs + pauseMs;
  const index = Math.floor(simulationTime / segment);
  const local = simulationTime % segment;
  const leg = index % 16;
  const direction = leg < 8 ? leg : (15 - leg + 4) % 8;
  const [vx, vy] = VECTORS[direction];
  player.dir = direction;
  const moving = local < moveMs;
  if (moving) {
    const dx = vx * (dt / moveMs) * 0.55;
    const dy = vy * (dt / moveMs) * 0.55;
    player.x += dx;
    player.y += dy;
    player.distance += Math.hypot(dx, dy);
  }
  if (!trail.length || Math.hypot(player.x - trail[0].x, player.y - trail[0].y) >= 0.07) {
    trail.unshift({x: player.x, y: player.y});
    if (trail.length > 600) trail.length = 600;
  }
  const next = pointAtGap(1.3);
  const fx = next.x - lastFollower.x;
  const fy = next.y - lastFollower.y;
  const distance = Math.hypot(fx, fy);
  if (distance > 1e-4) {
    follower.distance += distance;
    follower.dir = heading(fx, fy) ?? follower.dir;
  }
  follower.x = next.x;
  follower.y = next.y;
  lastFollower = {x: next.x, y: next.y};
  stateLabel.textContent = `${DIRECTIONS[follower.dir]} · ${moving ? 'walking' : 'idle'} · player ${leg >= 8 ? 'backtracking' : 'traversing'}`;
}

function project(x, y) {
  return {x: stage.width / 2 + (x - y) * 28, y: 134 + (x + y - 20) * 14};
}

function drawStage() {
  const creature = sources[speciesSelect.value];
  ctx.clearRect(0, 0, stage.width, stage.height);
  ctx.fillStyle = '#31543e';
  ctx.fillRect(0, 0, stage.width, stage.height);
  for (let x = 6; x < 15; x++)
    for (let y = 6; y < 15; y++) {
      const p = project(x, y);
      ctx.fillStyle = (x + y) % 2 ? '#41694b' : '#3a6046';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 14);
      ctx.lineTo(p.x + 28, p.y);
      ctx.lineTo(p.x, p.y + 14);
      ctx.lineTo(p.x - 28, p.y);
      ctx.closePath();
      ctx.fill();
    }
  const tree = {kind: 'tree', x: 10.8, y: 9.4, image: sources.tree};
  const actors = [
    {kind: 'companion', x: follower.x, y: follower.y},
    {kind: 'player', x: player.x, y: player.y},
  ];
  const drawables = [...actors, tree].sort((a, b) => a.x + a.y - (b.x + b.y));
  for (const object of drawables) {
    const p = project(object.x, object.y);
    if (object.kind === 'tree') {
      ctx.save();
      if (actors.some(actor => tree.x + tree.y > actor.x + actor.y && Math.abs(p.x - project(actor.x, actor.y).x) < 43)) ctx.globalAlpha = 0.28;
      drawFrame(ctx, object.image, 0, 0, p.x, p.y, 88, 1, 1, object.image.naturalWidth || 307, object.image.naturalHeight || 348);
      ctx.restore();
    } else if (object.kind === 'player') {
      const moving = simulationTime % 960 < 700;
      const column = moving && !calm.checked ? (Math.floor(player.distance / 0.56) % 4) + 1 : 0;
      drawFrame(ctx, sources.player, column, player.dir, p.x, p.y, 36, 5, 8, 160, 256);
    } else {
      const walking = simulationTime % 960 < 700;
      const col = !calm.checked && walking ? (Math.floor(follower.distance / 0.56) % 4) + 1 : 0;
      drawFrame(ctx, creature, col, ROWS[speciesSelect.value].indexOf(DIRECTIONS[follower.dir]), p.x, p.y, 37, 5, 8, 200, 200);
    }
  }
}

function render(now) {
  const dt = Math.min(40, now - (previousTime || now));
  previousTime = now;
  advance(dt);
  drawStage();
  requestAnimationFrame(render);
}

function renderAtlas() {
  const container = document.querySelector('#atlas');
  container.replaceChildren();
  const image = sources[speciesSelect.value];
  DIRECTIONS.forEach(direction => {
    const section = document.createElement('section');
    section.className = 'direction';
    const heading = document.createElement('h3');
    heading.textContent = direction;
    const grid = document.createElement('div');
    grid.className = 'frames';
    FRAMES.forEach((frame, column) => {
      const card = document.createElement('div');
      card.className = 'frame';
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 80;
      canvas.dataset.direction = direction;
      canvas.dataset.frame = frame;
      const context = canvas.getContext('2d');
      const sourceRow = ROWS[speciesSelect.value].indexOf(direction);
      drawFrame(context, image, column, sourceRow, 40, 78, 37, 5, 8, 200, 200);
      const caption = document.createElement('span');
      caption.textContent = frame;
      card.append(canvas, caption);
      grid.append(card);
    });
    section.append(heading, grid);
    container.append(section);
  });
}

document.querySelector('#play').addEventListener('click', event => {
  running = !running;
  event.currentTarget.textContent = running ? 'Pause path demo' : 'Resume path demo';
});
document.querySelector('#reset').addEventListener('click', reset);
speciesSelect.addEventListener('change', () => {
  reset();
  renderAtlas();
});
calm.addEventListener('change', drawStage);
renderAtlas();
requestAnimationFrame(render);

window.followerPreview = {
  state: () => ({row: follower.dir, direction: DIRECTIONS[follower.dir], distance: follower.distance, reducedMotion: calm.checked}),
  stop: () => {
    running = false;
  },
  resume: () => {
    running = true;
  },
  select: id => {
    speciesSelect.value = id;
    speciesSelect.dispatchEvent(new Event('change'));
  },
};
