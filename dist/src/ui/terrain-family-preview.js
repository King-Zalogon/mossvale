import {bakeTerrainFamily} from '../domain/terrain-family.js';

const NEXT_EDGE = {n: 'e', e: 's', s: 'w', w: 'n'};
const VERTEX = (x, y, width, height) => ({
  n: [x, y - height / 2],
  e: [x + width / 2, y],
  s: [x, y + height / 2],
  w: [x - width / 2, y],
});

function drawEdges(ctx, points, edges, width, color) {
  ctx.save();
  ctx.lineWidth = Math.max(1.1, width * 0.055);
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  for (const edge of edges) {
    ctx.beginPath();
    ctx.moveTo(...points[edge]);
    ctx.lineTo(...points[NEXT_EDGE[edge]]);
    ctx.stroke();
  }
  ctx.restore();
}

function drawShoreArt(ctx, points, edges, width, water) {
  ctx.save();
  ctx.lineCap = 'round';
  const center = [(points.n[0] + points.s[0]) / 2, (points.n[1] + points.s[1]) / 2];
  for (const edge of edges) {
    const start = points[edge];
    const end = points[NEXT_EDGE[edge]];
    const middle = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    const inward = [center[0] - middle[0], center[1] - middle[1]];
    const length = Math.hypot(...inward) || 1;
    inward[0] /= length;
    inward[1] /= length;
    const tangent = [(end[0] - start[0]) / 2, (end[1] - start[1]) / 2];

    // A narrow inshore lip is preview decoration; walkability remains explicit fixture data.
    ctx.beginPath();
    ctx.moveTo(start[0] + inward[0] * width * 0.08, start[1] + inward[1] * width * 0.08);
    ctx.lineTo(end[0] + inward[0] * width * 0.08, end[1] + inward[1] * width * 0.08);
    ctx.lineWidth = Math.max(1, width * 0.06);
    ctx.strokeStyle = water ? '#b9e2d7' : '#d1b777';
    ctx.stroke();

    if (!water) {
      // Small reed marks follow each authored shore edge without rotating the source tiles.
      ctx.strokeStyle = '#4a7044';
      ctx.lineWidth = Math.max(1, width * 0.055);
      for (const offset of [-0.1, 0, 0.1]) {
        const base = [middle[0] + inward[0] * width * 0.18 + tangent[0] * offset, middle[1] + inward[1] * width * 0.18 + tangent[1] * offset];
        ctx.beginPath();
        ctx.moveTo(...base);
        ctx.lineTo(base[0] + inward[0] * width * 0.18 + tangent[0] * offset * 0.6, base[1] + inward[1] * width * 0.18 + tangent[1] * offset * 0.6);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

export function drawTerrainFamilyFixture(canvas, fixture, {seed = fixture.seed, showTopology = false, baked, artwork = {}} = {}) {
  const context = canvas.getContext('2d');
  const result = baked?.seed === seed ? baked : bakeTerrainFamily(fixture, seed);
  const {w: gridWidth, h: gridHeight} = fixture.size;
  const sourceTile = fixture.tile;
  const scale = Math.min(
    (canvas.width - 24) / (((gridWidth + gridHeight) * sourceTile.w) / 2),
    (canvas.height - 20) / (((gridWidth + gridHeight) * sourceTile.h) / 2),
  );
  const width = sourceTile.w * scale;
  const height = sourceTile.h * scale;
  const originY = 10 + height / 2;
  const stats = {...result.counts, missing: 0, sourceTiles: Object.keys(fixture.artwork).length};
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;
  context.fillStyle = '#102b26';
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (const cell of result.cells) {
    const baseImage = artwork[cell.baseArt];
    const bridgeImage = cell.bridgeId ? artwork[cell.art] : null;
    if (!baseImage || (cell.bridgeId && !bridgeImage)) {
      stats.missing++;
      continue;
    }
    const screenX = canvas.width / 2 + ((cell.x - cell.y) * width) / 2;
    const screenY = originY + ((cell.x + cell.y) * height) / 2;
    const source = fixture.artwork[fixture.recipes[cell.baseRecipe].source];
    context.drawImage(baseImage, screenX - source.anchor[0] * scale, screenY - source.anchor[1] * scale, sourceTile.w * scale, sourceTile.h * scale);
    if (bridgeImage) {
      const deck = fixture.artwork[fixture.recipes[cell.recipe].source];
      context.drawImage(bridgeImage, screenX - deck.anchor[0] * scale, screenY - deck.anchor[1] * scale, sourceTile.w * scale, sourceTile.h * scale);
    }
    const points = VERTEX(screenX, screenY, width, height);
    const isWater = fixture.surfaces[cell.terrain].kind === 'water';
    drawShoreArt(context, points, cell.shoreEdges, width, isWater);
    if (showTopology) drawEdges(context, points, cell.edges, width, '#fff0a3');
  }
  return stats;
}
