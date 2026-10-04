import {resolveTerrainFamilyCell} from '../domain/terrain-family.js';

const NEXT_EDGE = {n: 'e', e: 's', s: 'w', w: 'n'};

function drawTile(ctx, x, y, width, height, fill, edge) {
  const points = {
    n: [x, y - height / 2],
    e: [x + width / 2, y],
    s: [x, y + height / 2],
    w: [x - width / 2, y],
  };
  ctx.beginPath();
  ctx.moveTo(...points.n);
  ctx.lineTo(...points.e);
  ctx.lineTo(...points.s);
  ctx.lineTo(...points.w);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = Math.max(0.8, width * 0.025);
  ctx.stroke();
  return points;
}

function drawTexture(ctx, detail, x, y, width, height, variant) {
  const scale = width / 28;
  const pale = '#d9e4a8';
  if (detail.includes('grass') || detail.includes('clover') || detail.includes('reed') || detail.includes('bank')) {
    ctx.strokeStyle = detail.includes('reed') ? '#b9ce83' : pale;
    ctx.lineWidth = Math.max(0.8, scale);
    for (let i = 0; i < 2 + variant; i++) {
      const dx = ((i * 7 + variant * 3) % 15) - 7;
      ctx.beginPath();
      ctx.moveTo(x + dx * scale, y + 2 * scale);
      ctx.lineTo(x + (dx - 1) * scale, y - (2 + (i % 2)) * scale);
      ctx.moveTo(x + dx * scale, y + 2 * scale);
      ctx.lineTo(x + (dx + 2) * scale, y - 1 * scale);
      ctx.stroke();
    }
  } else if (detail.includes('path') || detail.includes('corner') || detail.includes('worn')) {
    ctx.fillStyle = '#725a40';
    for (let i = 0; i < 2 + variant; i++) {
      const dx = ((i * 9 + variant * 4) % 15) - 7;
      const dy = ((i * 5 + variant * 2) % 5) - 2;
      ctx.fillRect(x + dx * scale, y + dy * scale, 1.5 * scale, scale);
    }
  } else if (detail.includes('water') || detail.includes('ripple') || detail.includes('bubble')) {
    ctx.strokeStyle = '#a4d7c7';
    ctx.lineWidth = Math.max(0.8, scale);
    for (let i = 0; i < 1 + variant; i++) {
      const dx = ((i * 10 + variant * 3) % 13) - 6;
      ctx.beginPath();
      ctx.moveTo(x + dx * scale, y + (i - 1) * 2 * scale);
      ctx.quadraticCurveTo(x + (dx + 2) * scale, y + (i - 2) * 2 * scale, x + (dx + 4) * scale, y + (i - 1) * 2 * scale);
      ctx.stroke();
    }
  }
}

function drawBridge(ctx, x, y, width, height, variant) {
  const scale = width / 28;
  ctx.beginPath();
  ctx.moveTo(x - width * 0.37, y - height * 0.09);
  ctx.lineTo(x + width * 0.37, y + height * 0.09);
  ctx.lineTo(x + width * 0.37, y + height * 0.27);
  ctx.lineTo(x - width * 0.37, y + height * 0.09);
  ctx.closePath();
  ctx.fillStyle = variant ? '#795839' : '#997448';
  ctx.fill();
  ctx.strokeStyle = '#513d2d';
  ctx.lineWidth = Math.max(0.8, scale);
  ctx.stroke();
  for (let i = -1; i <= 2; i++) {
    const offset = i * 4 * scale;
    ctx.beginPath();
    ctx.moveTo(x + offset - width * 0.14, y - height * 0.035);
    ctx.lineTo(x + offset - width * 0.14, y + height * 0.16);
    ctx.stroke();
  }
}

function drawTopology(ctx, points, width) {
  ctx.save();
  ctx.lineWidth = Math.max(1.4, width * 0.065);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#fff0a3';
  for (const edge of points.edges) {
    ctx.beginPath();
    ctx.moveTo(...points[edge]);
    ctx.lineTo(...points[NEXT_EDGE[edge]]);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawTerrainFamilyFixture(canvas, fixture, {seed = fixture.seed, showTopology = false} = {}) {
  const context = canvas.getContext('2d');
  const {w: gridWidth, h: gridHeight} = fixture.size;
  const sourceTile = fixture.tile;
  const scale = Math.min(
    (canvas.width - 24) / (((gridWidth + gridHeight) * sourceTile.w) / 2),
    (canvas.height - 20) / (((gridWidth + gridHeight) * sourceTile.h) / 2),
  );
  const width = sourceTile.w * scale;
  const height = sourceTile.h * scale;
  const originY = 10 + height / 2;
  const stats = {cells: 0, walkable: 0, blocked: 0, bridges: 0, missing: 0};
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;
  context.fillStyle = '#102b26';
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const resolved = resolveTerrainFamilyCell(fixture, x, y, seed);
      if (!resolved) {
        stats.missing++;
        continue;
      }
      stats.cells++;
      if (resolved.walkable) stats.walkable++;
      else stats.blocked++;
      if (resolved.bridgeId) stats.bridges++;
      const screenX = canvas.width / 2 + ((x - y) * width) / 2;
      const screenY = originY + ((x + y) * height) / 2;
      const baseSurface = fixture.surfaces[resolved.cellTerrain];
      const bridgeSurface = resolved.bridgeId ? fixture.surfaces[fixture.bridges.find(item => item.id === resolved.bridgeId).waterTerrain] : null;
      const surface = bridgeSurface ?? baseSurface;
      const points = drawTile(context, screenX, screenY, width, height, surface.fill, surface.edge);
      const recipe = fixture.recipes[resolved.artVariant];
      const variant = Number(resolved.artVariant.slice(-1)) || 0;
      if (resolved.bridgeId) drawBridge(context, screenX, screenY, width, height, variant);
      else drawTexture(context, recipe.detail, screenX, screenY, width, height, variant);
      if (showTopology) drawTopology(context, {...points, edges: resolved.edges}, width);
    }
  }
  return stats;
}
