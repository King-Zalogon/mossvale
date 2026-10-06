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
    const shoreColor = fixture.surfaces[cell.terrain].kind === 'water' ? '#d3eee1' : '#e8df9e';
    drawEdges(context, points, cell.shoreEdges, width, shoreColor);
    if (showTopology) drawEdges(context, points, cell.edges, width, '#fff0a3');
  }
  return stats;
}
