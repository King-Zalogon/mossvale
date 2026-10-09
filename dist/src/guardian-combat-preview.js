import pack from '../maps/index.json' with {type:'json'};
import {assets, spriteId} from './data/assets.js';
import {species} from './data/species.js';
import {drawCreatureAnimated, drawSprite, sprites} from './render/sprites.js';
const states=['idle','attack','hit','faint','capture'];
const calm=document.querySelector('#calm');
const animation=document.querySelector('#animation');
const host=document.querySelector('#species');
const media=matchMedia('(prefers-reduced-motion: reduce)');
calm.checked=media.matches;
const pairs=[];
async function load(id){
  if(sprites[id])return;
  const image=new Image();image.src=new URL(`../${assets[id].src}`,import.meta.url);await image.decode();sprites[id]=image;
}
function play(){for(const pair of pairs){
  drawCreatureAnimated(pair.normal,pair.id,107,animation.value,calm.checked);
  drawCreatureAnimated(pair.form,pair.id,107,animation.value,calm.checked,pair.sprite);
}}
try{
  for(const mapId of pack.maps){
    const response=await fetch(new URL(`../maps/${mapId}.json`,import.meta.url));
    if(!response.ok)throw new Error(`Map ${mapId} could not load`);
    const map=await response.json();
    for(const landmark of map.landmarks??[]){
      const guardian=landmark.guardian;if(landmark.kind!=='shrine'||!guardian?.combatSprite)continue;
      const id=species.findIndex(entry=>entry.id===guardian.species);const sprite=spriteId(guardian.combatSprite);
      await Promise.all([load(sprite),load(spriteId(`creature-${guardian.species}-combat`)),load(species[id].sprite)]);
      const card=document.createElement('article');card.className='creature';card.dataset.map=mapId;
      card.innerHTML=`<h2>${map.name} · ${species[id].name}</h2><div class="frames"><figure><canvas width="160" height="145" data-pair="normal" aria-label="${species[id].name} normal form animated"></canvas><figcaption>Normal · 107 px</figcaption></figure><figure><canvas width="160" height="145" data-pair="form" aria-label="${species[id].name} shrine form animated"></canvas><figcaption>Shrine form · 107 px</figcaption></figure></div><div class="states">${states.map(state=>`<section class="state"><h3>${state}</h3><div class="frames">${[0,1,2,3].map(column=>`<figure class="frame"><canvas width="160" height="145" data-state="${state}" data-frame="${column}" aria-label="${species[id].name} shrine ${state} frame ${column+1}"></canvas><figcaption>${column+1}</figcaption></figure>`).join('')}</div></section>`).join('')}</div>`;
      host.append(card);pairs.push({id,sprite,normal:card.querySelector('[data-pair="normal"]'),form:card.querySelector('[data-pair="form"]')});
      for(const canvas of card.querySelectorAll('[data-state]'))drawSprite(canvas.getContext('2d'),sprite,80,138,107,{frame:{row:states.indexOf(canvas.dataset.state),column:Number(canvas.dataset.frame)}});
    }
  }
  play();host.dataset.ready='true';
}catch(error){const message=document.createElement('p');message.setAttribute('role','alert');message.textContent=`Guardian preview unavailable: ${error.message}`;host.append(message);}
calm.onchange=play;animation.onchange=play;document.querySelector('#replay').onclick=play;
media.addEventListener('change',event=>{calm.checked=event.matches;play();});
