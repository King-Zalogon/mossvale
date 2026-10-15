/* The regional atlas view (#276): a spoiler-safe route graph of the adventure, drawn as SVG with a text route list.
   All disclosure rules live in domain/atlas.js; this file only draws what that returns and wires selection. */
import {regions} from '../data/regions.js';
import {buildAtlas, routeBetween} from '../domain/atlas.js';
import {flagDone, unlocked} from '../domain/rules.js';
import {$} from './dom.js';

const esc = text => String(text).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
const CELL = 110;
const PAD = 60;

/** Splits a place name over at most two short lines for the graph labels. */
export function wrapLabel(name, limit = 14) {
  const words = String(name).split(/\s+/);
  const lines = [''];
  for (const word of words) {
    const last = lines.length - 1;
    if (lines[last] && (lines[last] + ' ' + word).length > limit && lines.length < 2) lines.push(word);
    else lines[last] = lines[last] ? lines[last] + ' ' + word : word;
  }
  return lines;
}

const sealName = flag => regions.find(region => region.id === String(flag).split('.')[0])?.seal ?? 'seal';

export function createAtlas(app) {
  const {game, actions} = app;
  const save = () => game.save;
  const maps = () => Object.values(app.mapsById);
  const regionOf = map => regions.findIndex(region => region.biome === map.biome);
  const compute = () => buildAtlas({maps: maps(), entryId: app.maps[0].id, save: save(), regionOf, unlocked, flagDone});
  let current = null;
  let selected = null;

  const stateText = node =>
    node.state === 'current'
      ? 'You are here'
      : node.state === 'visited'
        ? 'Visited'
        : node.locked
          ? `Locked until you earn the ${sealName(node.lockedBy ?? `${regions[node.region]?.id}.seal`)}`
          : 'Known, not visited yet';

  /** Plain sentences for each trail touching a place: direction, whether it is two-way and what it still needs. */
  const trailsOf = (atlas, id) => {
    const name = other => atlas.nodes.find(node => node.id === other)?.name ?? other;
    return atlas.edges
      .filter(edge => edge.from === id || edge.to === id)
      .map(edge => {
        const outbound = edge.from === id;
        const other = outbound ? edge.to : edge.from;
        if (!outbound && !edge.returns) return `A one-way trail from ${name(other)} arrives here`;
        const need = outbound ? edge.forward : edge.backward;
        const kind = edge.returns ? 'Trail' : 'One-way trail';
        return need === null ? `${kind} to ${name(other)}` : `Locked ${kind.toLowerCase()} to ${name(other)} (needs the ${sealName(need)})`;
      });
  };

  function detail(atlas, id) {
    const node = atlas.nodes.find(item => item.id === id);
    if (!node) return '<p class="atlas-hint">Choose a place to see its trails.</p>';
    const entry = atlas.nodes.find(item => item.id === app.maps[0].id);
    const home = routeBetween(atlas, id, app.maps[0].id);
    const lines = [`<h3>${esc(node.name)}</h3>`, `<p class="atlas-state">${esc(stateText(node))}</p>`];
    const trails = trailsOf(atlas, id);
    if (trails.length) lines.push(`<ul>${trails.map(text => `<li>${esc(text)}</li>`).join('')}</ul>`);
    if (node.state !== 'known' && entry)
      lines.push(
        node.id === entry.id
          ? '<p>Camp is here.</p>'
          : home.length
            ? `<p>Way back to camp: ${home.map(step => esc(atlas.nodes.find(item => item.id === step).name)).join(' → ')}.</p>`
            : '<p>No open trail back to camp is on the atlas yet; the nearest exits are listed above.</p>',
      );
    if (node.state === 'known' && !node.locked) lines.push('<p>Follow its trail from a visited place to arrive.</p>');
    if (node.canTravel && node.state !== 'current')
      lines.push(`<button class="primary" data-atlas-travel="${esc(node.id)}">Travel to ${esc(node.name)}</button>`);
    return lines.join('');
  }

  function routeList(atlas) {
    return `<ul class="atlas-list">${atlas.nodes
      .map(
        node =>
          `<li><b>${esc(node.name)}</b> — ${esc(stateText(node))}${trailsOf(atlas, node.id).length ? `. ${trailsOf(atlas, node.id).map(esc).join('; ')}.` : '.'}</li>`,
      )
      .join('')}</ul>`;
  }

  function svg(atlas, vertical) {
    const pos = ([x, y]) =>
      vertical
        ? [(y - atlas.bounds.minY) * CELL + PAD, (x - atlas.bounds.minX) * CELL + PAD]
        : [(x - atlas.bounds.minX) * CELL + PAD, (y - atlas.bounds.minY) * CELL + PAD];
    const at = Object.fromEntries(atlas.nodes.map(node => [node.id, pos(node.at)]));
    const w = Math.max(...Object.values(at).map(([x]) => x), 0) + PAD;
    const h = Math.max(...Object.values(at).map(([, y]) => y), 0) + PAD;
    const lines = atlas.edges
      .map(edge => {
        const [x1, y1] = at[edge.from];
        const [x2, y2] = at[edge.to];
        const lockedAny = edge.forward !== null || (edge.returns && edge.backward !== null);
        return `<line class="atlas-edge ${lockedAny ? 'locked' : ''} ${edge.concealed ? 'found-route' : ''}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${edge.returns ? '' : 'marker-end="url(#atlas-arrow)"'}/>`;
      })
      .join('');
    const dots = atlas.nodes
      .map(node => {
        const [x, y] = at[node.id];
        const label = wrapLabel(node.name)
          .map((line, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : 13}">${esc(line)}</tspan>`)
          .join('');
        const cls = `atlas-node ${node.state} ${node.locked ? 'locked' : ''}`;
        return `<g class="${cls}" data-atlas="${esc(node.id)}" tabindex="0" role="button" aria-label="${esc(node.name)}. ${esc(stateText(node))}"><circle cx="${x}" cy="${y}" r="22"/>${node.state === 'current' ? `<circle class="here" cx="${x}" cy="${y}" r="9"/>` : ''}${node.locked ? `<path class="lock" d="M${x - 5} ${y - 1}h10v8h-10zM${x - 3} ${y - 1}v-3a3 3 0 0 1 6 0v3" />` : ''}<text x="${x}" y="${y + 38}" text-anchor="middle">${label}</text></g>`;
      })
      .join('');
    return `<svg class="atlas-graph" viewBox="0 0 ${w} ${h + 20}" role="group" aria-label="Route atlas: places and the trails between them"><defs><marker id="atlas-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs>${lines}${dots}</svg>`;
  }

  return {
    html() {
      current = compute();
      selected = current.nodes.find(node => node.state === 'current')?.id ?? current.nodes[0]?.id ?? null;
      const vertical = window.innerWidth < 640;
      return `<div class="atlas" data-orientation="${vertical ? 'vertical' : 'horizontal'}"><p class="atlas-note">Places you have walked to, and trails you have noticed. ${current.hasUnmapped ? 'Some trails are still unmarked: walk up to a trail sign to add it.' : 'Every trail of this adventure is marked.'}</p>${svg(current, vertical)}<div id="atlas-detail" class="atlas-detail" role="region" aria-live="polite" aria-label="Selected place">${detail(current, selected)}</div><details class="atlas-routes"><summary>Route list</summary>${routeList(current)}</details></div>`;
    },
    mount() {
      const show = id => {
        selected = id;
        for (const el of document.querySelectorAll('.atlas-node')) el.classList.toggle('selected', el.dataset.atlas === id);
        $('#atlas-detail').innerHTML = detail(current, id);
        for (const b of document.querySelectorAll('[data-atlas-travel]')) b.onclick = () => actions.travel(b.dataset.atlasTravel);
      };
      show(selected);
      const nodes = [...document.querySelectorAll('.atlas-node')];
      const centre = el => {
        const c = el.querySelector('circle');
        return [+c.getAttribute('cx'), +c.getAttribute('cy')];
      };
      for (const el of nodes) {
        el.onclick = () => show(el.dataset.atlas);
        el.onfocus = () => show(el.dataset.atlas);
        el.onkeydown = event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            show(el.dataset.atlas);
            return;
          }
          const vectors = {ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1]};
          const vector = vectors[event.key];
          if (!vector) return;
          event.preventDefault();
          const [x, y] = centre(el);
          const target = nodes
            .filter(other => other !== el)
            .map(other => {
              const [ox, oy] = centre(other);
              const along = (ox - x) * vector[0] + (oy - y) * vector[1];
              const across = Math.abs((ox - x) * vector[1]) + Math.abs((oy - y) * vector[0]);
              return {other, along, across};
            })
            .filter(item => item.along > 0)
            .sort((a, b) => a.across * 2 + a.along - (b.across * 2 + b.along))[0];
          target?.other.focus();
        };
      }
    },
  };
}
