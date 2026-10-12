/* Element materials share one optional atlas, never a palette-swapped halo. */
import {assets} from '../data/assets.js';
import {sprites} from './sprites.js';

const runs = new WeakMap();
const clamp = value => Math.max(0, Math.min(1, value));

/** Geometry is measured from the current fighter canvases, including compact landscape layouts. */
export function effectPose({source, target, stage, progress, beam = false, type = null}) {
  const p = clamp(progress);
  const travel = stage === 'travel';
  const impact = stage === 'impact';
  const t = travel ? p : impact ? 1 : 0;
  const arc = {Leaf: -12, Water: -6, Stone: 14, Fire: -8, Ice: 0, Spark: 0, Air: -6, Spore: -5, Bloom: -9, Mire: 18, Sand: 3, Frost: 0}[type] ?? -10;
  return {
    x: beam && travel ? (source.x + target.x) / 2 : source.x + (target.x - source.x) * t,
    y: source.y + (target.y - source.y) * t + (travel && !beam ? Math.sin(p * Math.PI) * arc : 0),
    flip: target.x < source.x,
    column: impact ? (p < 0.62 ? 4 : 5) : travel ? (p < 0.18 ? 1 : p < 0.6 ? 2 : 3) : 0,
    alpha: impact ? 1 - Math.max(0, (p - 0.62) / 0.38) : 1,
    span: beam && travel ? Math.abs(target.x - source.x) : null,
  };
}

/** Disconnected/replaced scenes stop their own RAF; reduced motion paints one still impact, with no RAF. */
export function drawElementalEffect(canvas, effect, calm = false) {
  const scene = canvas?.parentElement;
  const context = canvas?.getContext('2d');
  if (!scene || !context) return;
  const sourceCanvas = scene.querySelector(effect.side === 'enemy' ? '#fight-wild' : '#fight-buddy');
  const targetCanvas = scene.querySelector(effect.side === 'enemy' ? '#fight-buddy' : '#fight-wild');
  if (!sourceCanvas || !targetCanvas) return;
  const rect = scene.getBoundingClientRect();
  const point = node => {
    const box = node.getBoundingClientRect();
    return {x: box.left - rect.left + box.width / 2, y: box.top - rect.top + box.height * 0.6};
  };
  const source = point(sourceCanvas);
  const target = point(targetCanvas);
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  context.scale(ratio, ratio);
  context.imageSmoothingEnabled = false;
  const id = assets.findIndex(asset => asset.name === 'effect-elemental-materials');
  const asset = assets[id];
  const image = sprites[id];
  const row = asset?.frames?.rowOrder.indexOf(effect.type) ?? -1;
  const available = row >= 0 && image?.complete && image.naturalWidth > 0;
  canvas.dataset.element = effect.type;
  canvas.dataset.side = effect.side;
  canvas.dataset.stage = effect.stage;
  canvas.dataset.material = available ? 'authored' : 'neutral-fallback';
  const run = {};
  runs.set(canvas, run);
  const size = Math.min(108, Math.max(64, rect.width * 0.17));
  const paint = progress => {
    const pose = effectPose({source, target, stage: effect.stage, progress, beam: effect.type === 'Spark', type: effect.type});
    if (calm) Object.assign(pose, {column: 4, alpha: 1, x: target.x, y: target.y, span: null});
    canvas.dataset.frame = String(pose.column);
    canvas.dataset.x = String(pose.x);
    canvas.dataset.y = String(pose.y);
    context.clearRect(0, 0, rect.width, rect.height);
    context.save();
    context.translate(pose.x, pose.y);
    if (pose.flip) context.scale(-1, 1);
    context.globalAlpha = pose.alpha;
    if (available) {
      const width = pose.span ?? size;
      const pivot = asset.frames.effectPivots[row][pose.column];
      context.drawImage(image, pose.column * 128, row * 128, 128, 128, -width / 2, -(pivot / 128) * size, width, size);
    } else {
      // Older/custom packs remain playable without claiming a material they did not author.
      context.strokeStyle = '#eef0dc';
      context.lineWidth = 3;
      context.beginPath();
      if (effect.stage === 'impact') {
        context.moveTo(-10, -10);
        context.lineTo(10, 10);
        context.moveTo(-10, 10);
        context.lineTo(10, -10);
      } else {
        context.moveTo(-12, 0);
        context.lineTo(12, 0);
        context.lineTo(5, -6);
      }
      context.stroke();
    }
    context.restore();
  };
  paint(0);
  if (calm) return;
  const start = performance.now();
  const tick = now => {
    if (!canvas.isConnected || runs.get(canvas) !== run) return;
    const progress = clamp(Math.max(0, now - start) / Math.max(1, effect.duration));
    paint(progress);
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
