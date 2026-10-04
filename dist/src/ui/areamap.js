/* The "This area" map (#73): what you have explored of the current map, drawn large enough to read, with pan and zoom
   by keys, buttons, drag and wheel. Unexplored ground stays dark and hidden landmarks stay hidden until found.
   Lists every known place with its direction and distance, and always offers the way back to camp. */
import {regions} from '../data/regions.js';
import {compass, exploredShare, isKnown, isRevealed, landmarkLabel} from '../domain/discovery.js';
import {flagDone, unlocked} from '../domain/rules.js';
import {$} from './dom.js';

const W = 560;
const H = 340;
const U = 5; // pixels per tile step along the screen's horizontal axis at zoom 1
const V = 2.9;
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 4;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const KIND_COLOR = {shrine: '#80dcff', ranger: '#f2efc4', chest: '#f6c25b', gate: '#eff3d5', sign: '#d9c7a0', cottage: '#d9c7a0'};

export function createAreaMap(app) {
  const {game, actions} = app;
  const save = () => game.save;
  let st = null; // {cx, cy, zoom}
  let drag = null;

  const dims = () => game.world.map.size;
  const fitZoom = () => {
    const {w, h} = dims();
    return clamp(Math.min((W * 0.92) / ((w + h) * U), (H * 0.92) / ((w + h) * V)), ZOOM_MIN, ZOOM_MAX);
  };
  const project = (x, y) => ({x: W / 2 + (x - y - (st.cx - st.cy)) * U * st.zoom, y: H / 2 + (x + y - (st.cx + st.cy)) * V * st.zoom});

  function reset() {
    st = {cx: game.player.x, cy: game.player.y, zoom: clamp(Math.min(2, fitZoom()) < 1.2 ? 1.2 : Math.min(2, fitZoom()), ZOOM_MIN, ZOOM_MAX)};
  }

  /** Places worth listing: found landmarks and the camp, nearest first. */
  function places() {
    const map = game.world.map;
    const entry = save().explored?.[map.id];
    const list = game.world.objects
      .filter(o => o.ref && isKnown(entry, o))
      .map(o => {
        const target = o.kind === 'gate' ? regions[o.target] : null;
        const locked = target && !unlocked(save(), o.target);
        const opened = o.kind === 'chest' && o.flag && flagDone(save(), o.flag);
        const base = landmarkLabel(o, target?.short);
        return {ref: o.ref, x: o.x, y: o.y, kind: o.kind, label: base + (locked ? ' (locked)' : opened ? ' (opened)' : ''), dim: opened};
      });
    const camp = map.spawns.camp;
    list.push({ref: 'camp', x: camp.x, y: camp.y, kind: 'camp', label: 'Camp'});
    for (const p of list) p.distance = Math.hypot(p.x - game.player.x, p.y - game.player.y);
    return list.sort((a, b) => a.distance - b.distance);
  }

  function html() {
    const items = places()
      .map(
        p =>
          `<li><button class="area-place" data-center="${p.ref}"><b>${p.label}</b><small>${compass(p.x - game.player.x, p.y - game.player.y)}${p.distance < 1.5 ? '' : ' · ' + Math.round(p.distance) + ' tiles'}</small></button></li>`,
      )
      .join('');
    const share = Math.round(exploredShare(save().explored?.[game.world.map.id], dims().w, dims().h) * 100);
    return `<div class="area-map"><canvas id="area-canvas" width="${W}" height="${H}" tabindex="0" role="img" aria-label="Map of ${game.world.map.name}: ${share}% explored. Arrow keys move the map, plus and minus zoom, zero centres on you."></canvas>
<div class="area-controls" role="group" aria-label="Map controls"><button id="am-left" aria-label="Move map left">◀</button><button id="am-up" aria-label="Move map up">▲</button><button id="am-down" aria-label="Move map down">▼</button><button id="am-right" aria-label="Move map right">▶</button><button id="am-in" aria-label="Zoom in">+</button><button id="am-out" aria-label="Zoom out">−</button><button id="am-center">Centre on me</button><button id="am-fit">Show all</button></div>
<p class="area-note">${share}% of ${game.world.map.name} explored. Dark ground is unexplored; hidden places appear once you walk close to them.</p>
<div class="area-actions"><button id="am-camp" class="primary">Return to camp</button><small>Lost? This takes you to the camp and the ranger. Nothing is lost.</small></div>
<ul class="area-places" aria-label="Known places">${items}</ul></div>`;
  }

  function draw() {
    const canvas = $('#area-canvas');
    if (!canvas || !st) return;
    const c = canvas.getContext('2d');
    const map = game.world.map;
    const {w, h} = map.size;
    const s = save();
    const entry = s.explored?.[map.id];
    c.fillStyle = '#0b1a14';
    c.fillRect(0, 0, W, H);
    const hw = U * st.zoom;
    const hh = V * st.zoom;
    const ground = s.region === 2 ? '#aec7c7' : '#8caf6b';
    for (const t of map.tiles) {
      if (!isRevealed(entry, w, h, t.x, t.y)) continue;
      const p = project(t.x, t.y);
      if (p.x < -hw || p.x > W + hw || p.y < -hh || p.y > H + hh) continue;
      c.fillStyle = t.water ? '#5aa7b6' : t.path ? '#e0cf93' : t.grass ? '#5e8549' : ground;
      c.beginPath();
      c.moveTo(p.x, p.y - hh);
      c.lineTo(p.x + hw, p.y);
      c.lineTo(p.x, p.y + hh);
      c.lineTo(p.x - hw, p.y);
      c.closePath();
      c.fill();
    }
    c.font = '600 11px sans-serif';
    c.textAlign = 'center';
    c.lineJoin = 'round';
    const label = (text, x, y, color = '#fff8dc') => {
      c.lineWidth = 3;
      c.strokeStyle = '#0b1a14';
      c.strokeText(text, x, y);
      c.fillStyle = color;
      c.fillText(text, x, y);
    };
    // Quiet corridors: dashed outlines where wandering never starts an encounter (only where already explored).
    c.setLineDash([5, 4]);
    c.strokeStyle = '#fff4cc';
    c.lineWidth = 1.5;
    for (const q of map.quiet ?? []) {
      const [x0, y0, x1, y1] = q.rect;
      if (!isRevealed(entry, w, h, (x0 + x1) / 2, (y0 + y1) / 2)) continue;
      const pts = [project(x0, y0), project(x1, y0), project(x1, y1), project(x0, y1)];
      c.beginPath();
      pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.closePath();
      c.stroke();
      const mid = project((x0 + x1) / 2, (y0 + y1) / 2);
      if (q.label) label(q.label + ' · quiet', mid.x, mid.y, '#fff4cc');
    }
    c.setLineDash([]);
    for (const p of places()) {
      const at = project(p.x, p.y);
      if (at.x < -60 || at.x > W + 60 || at.y < -20 || at.y > H + 20) continue;
      c.globalAlpha = p.dim ? 0.55 : 1;
      c.fillStyle = KIND_COLOR[p.kind] ?? '#fff';
      c.strokeStyle = '#0b1a14';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(at.x, at.y, 5, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      label(p.label, at.x, at.y - 9);
      c.globalAlpha = 1;
    }
    const me = project(game.player.x, game.player.y);
    c.fillStyle = '#e85d48';
    c.strokeStyle = '#fff4cc';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(me.x, me.y, 6, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    label('You', me.x, me.y + 18, '#ffd9d2');
  }

  const pan = (sx, sy) => {
    // screen movement in pixels -> map centre in tiles
    const a = sx / (U * st.zoom);
    const b = sy / (V * st.zoom);
    st.cx = clamp(st.cx + (a + b) / 2, 0, dims().w);
    st.cy = clamp(st.cy + (b - a) / 2, 0, dims().h);
    draw();
  };
  const zoomBy = factor => {
    st.zoom = clamp(st.zoom * factor, ZOOM_MIN, ZOOM_MAX);
    draw();
  };
  const center = (x = game.player.x, y = game.player.y) => {
    st.cx = x;
    st.cy = y;
    draw();
  };

  /** Wires the controls after the view's HTML is on the page. */
  function mount() {
    if (!st) reset();
    const on = (id, fn) => {
      if ($(id)) $(id).onclick = fn;
    };
    const step = 70;
    on('#am-left', () => pan(-step, 0));
    on('#am-right', () => pan(step, 0));
    on('#am-up', () => pan(0, -step));
    on('#am-down', () => pan(0, step));
    on('#am-in', () => zoomBy(1.25));
    on('#am-out', () => zoomBy(0.8));
    on('#am-center', () => center());
    on('#am-fit', () => {
      st.zoom = fitZoom();
      center(dims().w / 2, dims().h / 2);
    });
    on('#am-camp', () => actions.returnToCamp());
    for (const b of document.querySelectorAll('[data-center]')) {
      b.onclick = () => {
        const p = places().find(place => place.ref === b.dataset.center);
        if (p) center(p.x, p.y);
        $('#area-canvas')?.focus({preventScroll: true});
      };
    }
    const canvas = $('#area-canvas');
    canvas.onpointerdown = e => {
      drag = {x: e.clientX, y: e.clientY};
      canvas.setPointerCapture(e.pointerId);
    };
    canvas.onpointermove = e => {
      if (!drag) return;
      const scale = W / canvas.getBoundingClientRect().width;
      pan(-(e.clientX - drag.x) * scale, -(e.clientY - drag.y) * scale);
      drag = {x: e.clientX, y: e.clientY};
    };
    canvas.onpointerup = canvas.onpointercancel = canvas.onlostpointercapture = () => (drag = null);
    canvas.onwheel = e => {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15);
    };
    draw();
  }

  /** Keyboard for the area view; true when the key was used. */
  function key(k) {
    if (!st || !$('#area-canvas')) return false;
    const step = 60;
    const moves = {
      arrowleft: [-step, 0],
      a: [-step, 0],
      arrowright: [step, 0],
      d: [step, 0],
      arrowup: [0, -step],
      w: [0, -step],
      arrowdown: [0, step],
      s: [0, step],
    };
    if (moves[k]) return (pan(...moves[k]), true);
    if (k === '+' || k === '=') return (zoomBy(1.25), true);
    if (k === '-' || k === '_') return (zoomBy(0.8), true);
    if (k === '0') return (center(), true);
    return false;
  }

  return {
    html,
    mount,
    key,
    reset,
    draw,
    get state() {
      return st && {...st};
    },
  };
}
