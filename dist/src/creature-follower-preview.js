import {assets, spriteId} from './data/assets.js';
import {species} from './data/species.js';
import {DIRECTIONS, directionPose, followerFrame, movementFacing, playerFrame, playerSpritePose} from './domain/exploration.js';

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
const followerAssets = Object.fromEntries(species.map(entry => [entry.id, assets[spriteId(`creature-${entry.id}-follower`)]]));
const sources = {
  player: load(new URL('../' + assets[spriteId('person-red-cap-motion')].src, import.meta.url).href),
  tree: load(new URL('../' + assets[spriteId('tree-oak')].src, import.meta.url).href),
  ...Object.fromEntries(Object.entries(followerAssets).map(([id, asset]) => [id, load(new URL('../' + asset.src, import.meta.url).href)])),
};
const stage = document.querySelector('#stage');
const ctx = stage.getContext('2d');
const speciesSelect = document.querySelector('#species');
speciesSelect.replaceChildren(...species.map(entry => new Option(entry.name, entry.id)));
const calm = document.querySelector('#calm');
calm.checked = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const stateLabel = document.querySelector('#state');
let running = true;
let previousTime = 0;
let simulationTime = 0;
let player = {x: 10, y: 10, dir: 4, distance: 0, moving: false};
let follower = {x: 10, y: 10, dir: 4, distance: 0, moving: false};
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

function drawFrame(context, image, column, row, x, groundY, width, columns, rows, fw, fh, flip = false) {
  if (!image.complete || !image.naturalWidth) return;
  const sw = image.naturalWidth / columns;
  const sh = image.naturalHeight / rows;
  context.save();
  context.imageSmoothingEnabled = false;
  if (flip) {
    context.translate(Math.round(x), 0);
    context.scale(-1, 1);
    x = 0;
  }
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

function pointAtGap(distance) {
  let along = 0;
  let newer = player;
  for (const older of trail) {
    const part = Math.hypot(newer.x - older.x, newer.y - older.y);
    if (part > 0 && along + part >= distance) {
      const fraction = (distance - along) / part;
      return {x: newer.x + (older.x - newer.x) * fraction, y: newer.y + (older.y - newer.y) * fraction};
    }
    along += part;
    newer = older;
  }
  return trail.at(-1) ?? player;
}

function reset() {
  player = {x: 10, y: 10, dir: 4, distance: 0, moving: false};
  follower = {x: 10, y: 10, dir: 4, distance: 0, moving: false};
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
  player.moving = moving;
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
  follower.moving = distance > 1e-6;
  if (follower.moving) {
    follower.distance += distance;
    follower.dir = movementFacing(fx, fy) ?? follower.dir;
  }
  follower.x = next.x;
  follower.y = next.y;
  lastFollower = {x: next.x, y: next.y};
}

function project(x, y) {
  return {x: stage.width / 2 + (x - y) * 28, y: 134 + (x + y - 20) * 14};
}

function drawStage() {
  const creature = sources[speciesSelect.value];
  stateLabel.textContent = `${DIRECTIONS[follower.dir]} · ${running && follower.moving ? 'walking' : 'idle'}${running ? '' : ' · paused'}`;
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
      const column = playerFrame(player.distance, running && player.moving, calm.checked);
      const pose = playerSpritePose(player.dir);
      drawFrame(ctx, sources.player, column, pose.row, p.x, p.y, 36, 5, 8, 160, 256, pose.flip);
    } else {
      const frames = followerAssets[speciesSelect.value].frames;
      const pose = directionPose(frames, follower.dir);
      const col = followerFrame(follower.distance, running && follower.moving, calm.checked);
      drawFrame(ctx, creature, col, pose.row, p.x, p.y, 37, frames.columns, frames.rows, frames.frameWidth, frames.frameHeight, pose.flip);
    }
  }
}

function render(now) {
  const dt = Math.min(40, Math.max(0, now - (previousTime || now)));
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
      const frames = followerAssets[speciesSelect.value].frames;
      const pose = directionPose(frames, DIRECTIONS.indexOf(direction));
      drawFrame(context, image, column, pose.row, 40, 78, 37, frames.columns, frames.rows, frames.frameWidth, frames.frameHeight, pose.flip);
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
  drawStage();
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
  state: () => ({
    row: follower.dir,
    direction: DIRECTIONS[follower.dir],
    distance: follower.distance,
    reducedMotion: calm.checked,
    moving: running && follower.moving,
    x: follower.x,
    y: follower.y,
  }),
  stop: () => {
    running = false;
    drawStage();
  },
  resume: () => {
    running = true;
  },
  select: id => {
    speciesSelect.value = id;
    speciesSelect.dispatchEvent(new Event('change'));
  },
};
