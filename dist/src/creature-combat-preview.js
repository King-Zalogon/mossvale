import {assets, spriteId} from './data/assets.js';
import {species} from './data/species.js';
import {drawSprite, sprites} from './render/sprites.js';

const kinds = ['fernling', 'duskwing'];
const states = ['idle', 'attack', 'hit', 'faint', 'capture'];
const host = document.querySelector('#species');
const calm = document.querySelector('#calm');

async function load(id) {
  const image = new Image();
  image.src = assets[id].src;
  await image.decode();
  sprites[id] = image;
}

for (const kind of kinds) {
  const speciesId = species.findIndex(entry => entry.id === kind);
  const sprite = spriteId(`creature-${kind}-combat`);
  const card = document.createElement('article');
  card.className = 'creature';
  card.innerHTML = `<h2>${species[speciesId].name}</h2><div class="states">${states.map(state => `<section class="state"><h3>${state}</h3><div class="frames">${[0, 1, 2, 3].map(column => `<canvas width="160" height="160" data-species="${kind}" data-state="${state}" data-frame="${column}" aria-label="${species[speciesId].name} ${state} frame ${column + 1}"></canvas>`).join('')}</div></section>`).join('')}</div>`;
  host.append(card);
  await load(sprite);
  for (const canvas of card.querySelectorAll('canvas')) {
    const context = canvas.getContext('2d');
    const row = states.indexOf(canvas.dataset.state);
    const pose = row > 0 && calm.checked ? 3 : Number(canvas.dataset.frame);
    drawSprite(context, sprite, 80, 151, 115, {frame: {column: pose, row}});
  }
}

calm.onchange = () => {
  for (const canvas of host.querySelectorAll('canvas')) {
    const context = canvas.getContext('2d');
    const row = states.indexOf(canvas.dataset.state);
    const pose = row > 0 && calm.checked ? 3 : Number(canvas.dataset.frame);
    const sprite = spriteId(`creature-${canvas.dataset.species}-combat`);
    context.clearRect(0, 0, 160, 160);
    drawSprite(context, sprite, 80, 151, 115, {frame: {column: pose, row}});
  }
};
