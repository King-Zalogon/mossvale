import {assets, spriteId} from './data/assets.js';
import {species, replaceSpecies} from './data/species.js';
import {drawSpriteFrame, drawCreatureAnimated, sprites} from './render/sprites.js';

const resource = document.body.dataset.resource || 'parrocket';
if (!['parrocket', 'blastoucan', 'rumblet', 'coglet', 'wispurr'].includes(resource)) throw new Error('Unknown creature resource');
const definition = await fetch(`resources/creatures/${resource}.json`).then(response => {
  if (!response.ok) throw new Error('Creature resource definition failed to load');
  return response.json();
});
// This isolated review page imports the optional definition; the normal game roster stays unchanged.
replaceSpecies([...species.map(entry => ({...entry, sprite: assets[entry.sprite].name})), definition]);
const id = species.findIndex(entry => entry.id === definition.id);
const assetIds = ['', '-combat', '-follower'].map(suffix => spriteId(definition.sprite + suffix));
await Promise.all(
  assetIds.map(async id => {
    const image = new Image();
    image.src = assets[id].src;
    await image.decode();
    sprites[id] = image;
  }),
);
document.querySelector('#portrait').src = assets[assetIds[0]].src;
for (const [host, assetId, width, labels] of [
  ['directions', assetIds[2], 37, assets[assetIds[2]].frames.rowOrder],
  ['states', assetIds[1], 115, assets[assetIds[1]].frames.rowOrder],
]) {
  const asset = assets[assetId];
  for (const [row, label] of labels.entries()) {
    const section = document.createElement('section');
    section.className = 'state';
    const heading = document.createElement('h3');
    heading.textContent = label;
    section.append(heading);
    const frames = document.createElement('div');
    frames.className = 'frames';
    for (let column = 0; column < asset.frames.columns; column++) {
      const canvas = document.createElement('canvas');
      canvas.width = width === 37 ? 80 : 160;
      canvas.height = canvas.width;
      canvas.dataset.kind = host;
      canvas.dataset.row = String(row);
      canvas.dataset.column = String(column);
      canvas.setAttribute('aria-label', `${definition.name} ${label} ${column}`);
      drawSpriteFrame(canvas.getContext('2d'), assetId, column, row, canvas.width / 2, canvas.height - 7, width);
      frames.append(canvas);
    }
    section.append(frames);
    document.querySelector('#' + host).append(section);
  }
}
const calm = document.querySelector('#calm');
calm.checked = matchMedia('(prefers-reduced-motion: reduce)').matches;
const action = document.querySelector('#action');
const play = () => drawCreatureAnimated(document.querySelector('#playback'), id, 115, action.value, calm.checked);
action.onchange = play;
calm.onchange = play;
document.querySelector('#replay').onclick = play;
play();
document.querySelector('#status').textContent = 'Ready: portrait, 40 directional poses and 20 battle poses.';
