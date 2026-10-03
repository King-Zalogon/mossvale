/* Canvas rendering of the isometric world and minimap. Reads state; never mutates game rules. */
import {species} from '../data/species.js';
import {assets, spriteId} from '../data/assets.js';
import {regions} from '../data/regions.js';
import {TILE_H, TILE_W} from '../config.js';
import {FACING, playerFrame} from '../domain/exploration.js';
import {unlocked} from '../domain/rules.js';
import {isLand, objectsInBounds, rnd, tilesInBounds} from '../domain/world.js';
import {drawSprite, drawSpriteFrame, sprites} from './sprites.js';

const raw = (x, y) => ({x: ((x - y) * TILE_W) / 2, y: ((x + y) * TILE_H) / 2});

export function createWorldRenderer({canvas, miniCanvas}) {
  const ctx = canvas.getContext('2d');
  const mini = miniCanvas.getContext('2d');
  let view;
  let stats = {visibleTiles: 0, worldTiles: 0, visibleObjects: 0, worldObjects: 0};

  const visibleBounds = () => {
    const centerY = canvas.height * 0.49;
    const corners = [
      [0, 0],
      [canvas.width, 0],
      [0, canvas.height],
      [canvas.width, canvas.height],
    ].map(([sx, sy]) => {
      const u = (sx - canvas.width / 2) / (14 * view.zoom);
      const v = (sy - centerY) / (7 * view.zoom);
      return {x: view.camera.x + (u + v) / 2, y: view.camera.y + (v - u) / 2};
    });
    return {
      minX: Math.min(...corners.map(p => p.x)) - 12,
      maxX: Math.max(...corners.map(p => p.x)) + 12,
      minY: Math.min(...corners.map(p => p.y)) - 12,
      maxY: Math.max(...corners.map(p => p.y)) + 12,
    };
  };

  const point = (x, y) => {
    const a = raw(x, y);
    const b = raw(view.camera.x, view.camera.y);
    return {x: canvas.width / 2 + (a.x - b.x) * view.zoom, y: canvas.height * 0.49 + (a.y - b.y) * view.zoom};
  };
  const worldToScreen = (x, y) => {
    const p = point(x, y);
    const rect = canvas.getBoundingClientRect();
    const viewport = canvas.parentElement.getBoundingClientRect();
    return {x: rect.left - viewport.left + (p.x / canvas.width) * rect.width, y: rect.top - viewport.top + (p.y / canvas.height) * rect.height};
  };
  const poly = (points, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
  };
  const diamond = (s, color) => {
    const w = (TILE_W / 2) * view.zoom;
    const h = (TILE_H / 2) * view.zoom;
    poly(
      [
        {x: s.x, y: s.y - h},
        {x: s.x + w, y: s.y},
        {x: s.x, y: s.y + h},
        {x: s.x - w, y: s.y},
      ],
      color,
    );
  };
  const shadow = (s, w = 16) => {
    ctx.fillStyle = '#17372538';
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, w * view.zoom, 5 * view.zoom, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  const spriteHeight = o => {
    const frames = assets[o.id]?.frames;
    const ratio = frames ? frames.frameHeight / frames.frameWidth : sprites[o.id]?.height / sprites[o.id]?.width;
    return o.w * view.zoom * (ratio || 1);
  };
  const occludesPlayer = (o, s) => {
    if (!['scenery', 'cottage'].includes(o.kind) || o.x + o.y <= view.player.x + view.player.y) return false;
    const p = point(view.player.x, view.player.y);
    return Math.abs(s.x - p.x) < o.w * view.zoom * 0.48 && p.y > s.y - spriteHeight(o) && p.y - 30 * view.zoom < s.y;
  };

  /** `v` = {save, world, player, follower, camera, zoom, now, paused, moving}. */
  function drawWorld(v) {
    view = v;
    const {save, world, player, zoom, now} = v;
    const region = save.region;
    const palette = regions[region].palette;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = palette[0];
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const bounds = visibleBounds();
    const tiles = tilesInBounds(world, {...bounds, minX: bounds.minX + 8, maxX: bounds.maxX - 8, minY: bounds.minY + 8, maxY: bounds.maxY - 8});
    for (const t of tiles) {
      const s = point(t.x, t.y);
      if (s.x < -100 || s.x > canvas.width + 100 || s.y < -120 || s.y > canvas.height + 120) continue;
      const w = 28 * zoom;
      const h = 14 * zoom;
      if (!isLand(world, t.x, t.y + 1) || !isLand(world, t.x + 1, t.y)) {
        poly(
          [
            {x: s.x - w, y: s.y},
            {x: s.x, y: s.y + h},
            {x: s.x + w, y: s.y},
            {x: s.x + w, y: s.y + 20 * zoom},
            {x: s.x, y: s.y + 34 * zoom},
            {x: s.x - w, y: s.y + 20 * zoom},
          ],
          palette[5],
        );
      }
      diamond(s, t.water ? palette[4] : t.path ? palette[3] : t.grass ? palette[2] : rnd(t.x, t.y, region) > 0.5 ? palette[1] : palette[0]);
      if (t.water) {
        ctx.fillStyle = '#b7e2dd99';
        ctx.fillRect(s.x - 13 * zoom + Math.sin(now / 1300 + t.x) * 2 * zoom, s.y, 16 * zoom, zoom);
        ctx.fillRect(s.x + 7 * zoom, s.y + 5 * zoom, 8 * zoom, zoom);
      } else {
        for (let i = 0; i < 2; i++) {
          ctx.fillStyle = t.path ? '#6a643c35' : region === 2 ? '#829fa755' : '#54783c55';
          ctx.fillRect(s.x + (-17 + rnd(t.x + i, t.y, region) * 34) * zoom, s.y + (-6 + rnd(t.y + i, t.x, region) * 12) * zoom, 2 * zoom, zoom);
        }
      }
    }
    const follow = {x: v.follower.x, y: v.follower.y, id: species[save.active].sprite, w: 37, kind: 'companion'};
    const playerPose = {
      column: playerFrame(player.walkDistance, v.moving, v.reducedMotion),
      row: Number.isInteger(player.dir) ? player.dir : FACING.south,
    };
    const visibleObjects = objectsInBounds(world, bounds);
    stats = {visibleTiles: tiles.length, worldTiles: world.tiles.length, visibleObjects: visibleObjects.length, worldObjects: world.objects.length};
    const all = [...visibleObjects, follow, {x: player.x, y: player.y, id: spriteId('person-red-cap-motion'), w: 36, kind: 'player', frame: playerPose}].sort(
      (a, b) => a.x + a.y - b.x - b.y,
    );
    for (const o of all) {
      const s = point(o.x, o.y);
      if (s.x < -180 || s.x > canvas.width + 180 || s.y < -100 || s.y > canvas.height + 230) continue;
      if (o.kind === 'player' || o.kind === 'companion') shadow(s, o.kind === 'player' ? 12 : 15);
      if (o.kind === 'player') {
        ctx.strokeStyle = '#e9efadbb';
        ctx.lineWidth = 1.4 * zoom;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, 13 * zoom, 5 * zoom, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (o.kind === 'shrine') {
        ctx.fillStyle = save.badges.includes(region) ? '#e8df964d' : '#76dbf048';
        ctx.beginPath();
        ctx.ellipse(s.x, s.y - 10 * zoom, 34 * zoom, 13 * zoom, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      const openedChest = o.kind === 'chest' && save.chests.includes(region);
      if (openedChest) drawSprite(ctx, o.id, s.x, s.y, o.w * zoom, {alpha: 0.45});
      else {
        const bob =
          o.kind === 'companion' && !v.reducedMotion
            ? v.moving
              ? Math.sin((player.walkDistance * Math.PI * 2) / 0.84) * 1.25 * zoom
              : Math.sin(now / 950) * 0.45 * zoom
            : 0;
        const tint = region === 2 && o.kind === 'grass' ? 'saturate(.3) brightness(1.35)' : region === 1 && o.kind === 'grass' ? 'sepia(.5)' : 'none';
        const options = {tint, alpha: occludesPlayer(o, s) ? 0.24 : 1};
        if (o.kind === 'player') drawSpriteFrame(ctx, o.id, o.frame.column, o.frame.row, s.x, s.y + bob, o.w * zoom, options);
        else drawSprite(ctx, o.id, s.x, s.y + bob, o.w * zoom, options);
      }
      if (['ranger', 'shrine', 'chest', 'gate'].includes(o.kind) && !openedChest) {
        ctx.fillStyle = o.kind === 'shrine' ? '#a2ddf8' : o.kind === 'chest' ? '#f4ce81' : '#eef2c0';
        ctx.font = `bold ${Math.round(13 * zoom)}px sans-serif`;
        ctx.textAlign = 'center';
        const label =
          o.kind === 'ranger'
            ? (o.tag ?? 'RANGER')
            : o.kind === 'shrine'
              ? save.badges.includes(region)
                ? 'AWAKENED'
                : 'SHRINE'
              : o.kind === 'chest'
                ? 'TREASURE'
                : regions[o.target].short.toUpperCase() + (unlocked(save, o.target) ? '' : ' · LOCKED');
        ctx.fillText(label, s.x, s.y - spriteHeight(o) - 7 * zoom);
      }
    }
    if (region === 2) {
      ctx.fillStyle = '#edf6f0aa';
      for (let i = 0; i < 34; i++) {
        const x = (rnd(i, 92, region) * canvas.width + now * 0.014 * (i % 2 ? 1 : -1) + canvas.width * 10) % canvas.width;
        const y = (rnd(i, 48, region) * canvas.height + now * 0.022) % canvas.height;
        ctx.fillRect(x, y, 2.5, 2.5);
      }
    } else {
      ctx.fillStyle = '#f7ecb488';
      for (let i = 0; i < 11; i++)
        ctx.fillRect(rnd(i, 40, region) * canvas.width + Math.sin(now / 2100 + i) * 9, rnd(i, 32, region) * canvas.height + Math.cos(now / 2600 + i) * 8, 2, 2);
    }
    if (v.paused) {
      ctx.fillStyle = '#0b231477';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.textAlign = 'center';
      ctx.font = '24px sans-serif';
      ctx.fillStyle = '#ecf0d4';
      ctx.fillText('Adventure paused', canvas.width / 2, canvas.height / 2);
    }
  }

  function drawMinimap({save, world, player}) {
    mini.clearRect(0, 0, 120, 100);
    const mp = (x, y) => ({x: 60 + (x - y) * 2.2, y: 11 + (x + y) * 1.55});
    for (const t of world.tiles) {
      const s = mp(t.x, t.y);
      mini.fillStyle = t.water ? '#70b6c3' : t.path ? '#e7d79e' : t.grass ? '#5e8549' : save.region === 2 ? '#aec7c7' : '#8caf6b';
      mini.fillRect(s.x - 2, s.y - 1, 4, 2.4);
    }
    for (const o of world.objects) {
      if (!['shrine', 'ranger', 'chest', 'gate'].includes(o.kind) || (o.kind === 'chest' && save.chests.includes(save.region))) continue;
      const s = mp(o.x, o.y);
      mini.fillStyle = o.kind === 'shrine' ? '#80dcff' : o.kind === 'chest' ? '#f6c25b' : '#eff3d5';
      mini.fillRect(s.x - 2, s.y - 2, 4, 4);
    }
    const s = mp(player.x, player.y);
    mini.fillStyle = '#e85d48';
    mini.beginPath();
    mini.arc(s.x, s.y, 2.7, 0, Math.PI * 2);
    mini.fill();
    mini.strokeStyle = '#fff4cc';
    mini.lineWidth = 1;
    mini.stroke();
  }

  return {
    drawWorld,
    drawMinimap,
    worldToScreen,
    context: ctx,
    miniContext: mini,
    get stats() {
      return {...stats};
    },
  };
}
