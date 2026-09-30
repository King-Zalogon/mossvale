'use strict';
(() => {
const $ = selector => document.querySelector(selector);
const canvas = $('#game'), ctx = canvas.getContext('2d'), mini = $('#minimap').getContext('2d');
const sprites = [], N = 25, TILE_W = 56, TILE_H = 28;
const species = [
 {name:'Fernling',type:'Leaf',sprite:4,hp:42,color:'#bade7e',move:'Leaf burst',strong:['Water','Stone'],weak:['Fire','Ice'],desc:'A brave little fox that naps beneath the ferns.'},
 {name:'Emberkin',type:'Fire',sprite:5,hp:40,color:'#ffb56c',move:'Ember spark',strong:['Leaf','Ice'],weak:['Water','Stone'],desc:'Warm paws, bright eyes, and a fiery spirit.'},
 {name:'Brooklet',type:'Water',sprite:6,hp:46,color:'#83dbe8',move:'Ripple rush',strong:['Fire','Stone'],weak:['Leaf','Spark'],desc:'Collects smooth pebbles from the meadow pond.'},
 {name:'Duskwing',type:'Air',sprite:7,hp:38,color:'#c5a2ef',move:'Gust spiral',strong:['Leaf','Spore'],weak:['Spark','Ice'],desc:'Its wings scatter soft starlight at dusk.'},
 {name:'Voltkit',type:'Spark',sprite:16,hp:39,color:'#f0d87d',move:'Static leap',strong:['Water','Air'],weak:['Stone'],desc:'A lightning-fast rabbit with an electric personality.'},
 {name:'Mushmallow',type:'Spore',sprite:17,hp:48,color:'#c59ae5',move:'Spore cloud',strong:['Water','Spark'],weak:['Fire','Air'],desc:'A shy hedgehog carrying a tiny mushroom garden.'},
 {name:'Frostowl',type:'Ice',sprite:18,hp:43,color:'#a9d6f4',move:'Frost feather',strong:['Leaf','Air'],weak:['Fire','Stone'],desc:'A quiet owl with feathers as cool as fresh snow.'},
 {name:'Pebblit',type:'Stone',sprite:19,hp:52,color:'#e2bb75',move:'Stone tumble',strong:['Spark','Fire','Ice'],weak:['Water','Leaf'],desc:'A patient tortoise with a sun-warmed crystal shell.'}
];
const regions = [
 {name:'Mossvale Meadow',short:'Meadow',subtitle:'Tall grass, old trails, and new friends.',tag:'THE MEADOW TRAIL',palette:['#86ae70','#97b76a','#8aa55c','#d6c08b','#4e9c9a','#577b48'],pool:[0,1,2,3],level:5,boss:5,bossLevel:7,seal:'Verdant seal',preview:0,desc:'A sunlit meadow where every trail begins.',spawn:{x:12,y:13}},
 {name:'Amber Ridge',short:'Ridge',subtitle:'Golden trails and sparks in the sandstone.',tag:'THE AMBER TRAIL',palette:['#c7a075','#d6b47e','#b19459','#e8cc99','#739ca4','#986f48'],pool:[1,4,5,7],level:7,boss:7,bossLevel:9,seal:'Amber seal',preview:22,desc:'Stone spires, electric friends, and a sleeping guardian.',spawn:{x:12,y:13}},
 {name:'Frostveil Grove',short:'Grove',subtitle:'Follow the snowflakes to the final shrine.',tag:'THE FROSTVEIL TRAIL',palette:['#a9c7c9','#d4e3dc','#acc2bb','#b0c7c5','#6d9cab','#7c9898'],pool:[2,3,6,7],level:9,boss:6,bossLevel:11,seal:'Frostveil seal',preview:21,desc:'A quiet snowy grove at the edge of the isles.',spawn:{x:12,y:13}}
];
const fresh = {version:2,region:0,x:12,y:13,active:0,orbs:12,potions:3,coins:0,seen:[0],caught:[0],team:{0:{xp:0,hp:42}},badges:[],chests:[],visited:[0],met:false,wins:0,playTime:0};
let save = structuredClone(fresh);
try {
 const current = JSON.parse(localStorage.getItem('mossvale-v2'));
 if (current?.version===2) {
  Object.assign(save,current);
  for(const key of ['seen','caught'])save[key]=[...new Set((Array.isArray(save[key])?save[key]:[0]).filter(i=>Number.isInteger(i)&&species[i]))];
  for(const key of ['badges','chests','visited'])save[key]=[...new Set((Array.isArray(save[key])?save[key]:[]).filter(i=>Number.isInteger(i)&&regions[i]))];
  if(!save.caught.length)save.caught=[0];
  save.team=save.team&&typeof save.team==='object'?save.team:{};
 } else {
  const old = JSON.parse(localStorage.getItem('mossvale-v1'));
  if(old){save.seen=[...new Set([0,...(old.seen||[])])].filter(i=>species[i]);save.caught=[...new Set([0,...(old.caught||[])])].filter(i=>species[i]);save.orbs=Number.isFinite(old.orbs)?Math.max(0,old.orbs):12;save.wins=old.wins||0;save.met=!!old.met;save.team[0]={xp:(old.wins||0)*14,hp:old.hp??42}}
 }
} catch {}
for(const id of save.caught){if(!save.team[id])save.team[id]={xp:0,hp:species[id].hp};save.team[id].xp=Math.max(0,Number(save.team[id].xp)||0)}
if(!save.caught.includes(save.active))save.active=save.caught[0];
for(const key of ['orbs','potions','coins','wins','playTime'])save[key]=Math.max(0,Number(save[key])||0);
if(!regions[save.region]||!unlocked(save.region))save.region=0;
let player={x:Number.isFinite(save.x)?save.x:12,y:Number.isFinite(save.y)?save.y:13,dir:8};
let world={tiles:[],objects:[]},keys={},touch=null,touchRun=false,paused=false,modalMode='',battle=null,now=0,last=0,steps=0,encounterAt=4,encounterCooldown=2,sound=false,audio=null,toastTimer,saveAvailable=true,zoom=1.45,camera={x:player.x,y:player.y},nearest=null,modalFocus=null,frame=0;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
function level(id){return 5+Math.floor((save.team[id]?.xp||0)/45)}
function maxHP(id){return species[id].hp+(level(id)-5)*4}
function companion(id=save.active){return save.team[id]}
function unlocked(id){return id===0||save.badges.includes(id-1)}
function effectiveness(attacker,defender){const a=species[attacker],t=species[defender].type;return a.strong.includes(t)?1.6:a.weak.includes(t)?.65:1}
function rnd(x,y){const v=Math.sin(x*127.1+y*311.7+save.region*59.7)*43758.5453;return v-Math.floor(v)}
function land(x,y){return x>=0&&y>=0&&x<N&&y<N&&((x-12)**2/148+(y-12)**2/136)<1.12}
function water(x,y){return ((x-6)**2/9+(y-15.5)**2/13)<1&&save.region!==1}
function path(x,y){return Math.abs(x-12)<1.35||Math.abs(y-12)<1.25||(x>9&&x<14&&y>7&&y<11)}
function grass(x,y){return land(x,y)&&!water(x,y)&&!path(x,y)&&((x>14&&y>7&&y<19)||(x<10&&y<9)||(x>8&&x<18&&y>16))}
function buildWorld(){
 world={tiles:[],objects:[]};
 const special=[{x:13,y:8.3,id:2,w:133,solid:1.15,kind:'cottage'},{x:10.5,y:11,id:8,w:37,kind:'ranger',label:'Talk to Ranger Iris'},{x:12,y:4.6,id:20,w:99,solid:.65,kind:'shrine',label:'Visit the shrine'},{x:17.2,y:16,id:23,w:44,kind:'chest',label:'Open the treasure chest'},{x:11,y:13.2,id:14,w:38,kind:'sign',label:'Read the trail sign'},{x:22.4,y:12,id:14,w:40,kind:'gate',target:save.region<2?save.region+1:0,label:'Take the eastern trail'}];
 if(save.region>0)special.push({x:1.9,y:12,id:14,w:40,kind:'gate',target:save.region-1,label:'Take the western trail'});
 for(let y=0;y<N;y++)for(let x=0;x<N;x++)if(land(x,y)){
  const t={x,y,water:water(x,y),path:path(x,y),grass:grass(x,y)};world.tiles.push(t);
  const r=rnd(x,y),nearSpecial=special.some(o=>Math.hypot(x-o.x,y-o.y)<2.15);
  if(nearSpecial||t.water||t.path)continue;
  if(!t.grass&&r>.65){const id=save.region===2?21:save.region===1?(r>.9?22:3):(r>.84?1:0);world.objects.push({x:x+.1,y:y+.1,id,w:id===22?71:id===3?49:79,solid:.52,kind:'scenery'})}
  else if(t.grass&&r>.41)world.objects.push({x,y,id:save.region===2?12:save.region===1?12:12,w:27,kind:'grass'});
  else if(r<.075&&save.region===0)world.objects.push({x,y,id:13,w:32,kind:'flower'});
 }
 world.objects.push(...special);world.objects.sort((a,b)=>a.x+a.y-b.x-b.y);
 $('#region-name').textContent=regions[save.region].name;$('#region-subtitle').textContent=regions[save.region].subtitle;$('#area-number').textContent='AREA 0'+(save.region+1);$('#world-tag').textContent='✦  '+regions[save.region].tag;$('#coordinates').textContent=regions[save.region].short.toUpperCase();
}
function valid(x,y){return land(x,y)&&!water(x,y)&&!world.objects.some(o=>o.solid&&Math.hypot(x-o.x,y-o.y)<o.solid+.22)}
function persist(){save.x=player.x;save.y=player.y;try{localStorage.setItem('mossvale-v2',JSON.stringify(save));$('#saved').textContent='PROGRESS SAVED';saveAvailable=true}catch{saveAvailable=false;$('#saved').textContent='SESSION ONLY';$('#save-note').textContent='Storage unavailable. Keep this tab open to retain progress.'}}
function loadAssets(){return Promise.all(Array.from({length:24},(_,i)=>new Promise(resolve=>{const im=new Image();sprites[i]=im;im.onload=()=>resolve();im.onerror=()=>resolve();im.src=`sprite${i}.png`})))}
function drawSprite(c,id,x,y,w,options={}){
 const im=sprites[id];if(!im?.complete||!im.naturalWidth)return;
 const h=w*im.height/im.width;c.save();c.imageSmoothingEnabled=false;
 if(options.alpha!==undefined)c.globalAlpha=options.alpha;
 if(options.tint)c.filter=options.tint;
 if(options.flip){c.translate(Math.round(x),Math.round(y));c.scale(-1,1);c.drawImage(im,Math.round(-w/2),Math.round(-h),Math.round(w),Math.round(h))}
 else c.drawImage(im,Math.round(x-w/2),Math.round(y-h),Math.round(w),Math.round(h));c.restore();
}
function art(selector,id,w=105){const c=$(selector)?.getContext('2d');if(!c)return;c.clearRect(0,0,c.canvas.width,c.canvas.height);drawSprite(c,species[id].sprite,c.canvas.width/2,c.canvas.height-7,w)}
function raw(x,y){return {x:(x-y)*TILE_W/2,y:(x+y)*TILE_H/2}}
function point(x,y){const a=raw(x,y),b=raw(camera.x,camera.y);return {x:canvas.width/2+(a.x-b.x)*zoom,y:canvas.height*.49+(a.y-b.y)*zoom}}
function poly(points,color){ctx.fillStyle=color;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill()}
function diamond(s,color){const w=TILE_W/2*zoom,h=TILE_H/2*zoom;poly([{x:s.x,y:s.y-h},{x:s.x+w,y:s.y},{x:s.x,y:s.y+h},{x:s.x-w,y:s.y}],color)}
function shadow(s,w=16){ctx.fillStyle='#17372538';ctx.beginPath();ctx.ellipse(s.x,s.y,w*zoom,5*zoom,0,0,Math.PI*2);ctx.fill()}
function occludesPlayer(o,s){if(!['scenery','cottage'].includes(o.kind)||o.x+o.y<=player.x+player.y)return false;const p=point(player.x,player.y),im=sprites[o.id],height=o.w*zoom*(im?.height/im?.width||1);return Math.abs(s.x-p.x)<o.w*zoom*.48&&p.y>s.y-height&&p.y-30*zoom<s.y;}
function drawWorld(){
 const r=regions[save.region],palette=r.palette;
 ctx.imageSmoothingEnabled=false;ctx.fillStyle=palette[0];ctx.fillRect(0,0,canvas.width,canvas.height);
 for(const t of world.tiles){const s=point(t.x,t.y);if(s.x<-100||s.x>canvas.width+100||s.y<-120||s.y>canvas.height+120)continue;
  const w=28*zoom,h=14*zoom;
  if(!land(t.x,t.y+1)||!land(t.x+1,t.y))poly([{x:s.x-w,y:s.y},{x:s.x,y:s.y+h},{x:s.x+w,y:s.y},{x:s.x+w,y:s.y+20*zoom},{x:s.x,y:s.y+34*zoom},{x:s.x-w,y:s.y+20*zoom}],palette[5]);
  diamond(s,t.water?palette[4]:t.path?palette[3]:t.grass?palette[2]:(rnd(t.x,t.y)>.5?palette[1]:palette[0]));
  if(t.water){ctx.fillStyle='#b7e2dd99';ctx.fillRect(s.x-13*zoom+Math.sin(now/1300+t.x)*2*zoom,s.y,16*zoom,zoom);ctx.fillRect(s.x+7*zoom,s.y+5*zoom,8*zoom,zoom)}
  else for(let i=0;i<2;i++){ctx.fillStyle=t.path?'#6a643c35':save.region===2?'#829fa755':'#54783c55';ctx.fillRect(s.x+(-17+rnd(t.x+i,t.y)*34)*zoom,s.y+(-6+rnd(t.y+i,t.x)*12)*zoom,2*zoom,zoom)}
 }
 const follow={x:player.x-.75,y:player.y+.8,id:species[save.active].sprite,w:37,kind:'companion'};
 const all=[...world.objects,follow,{x:player.x,y:player.y,id:player.dir,w:36,kind:'player'}].sort((a,b)=>a.x+a.y-b.x-b.y);
 const isMoving=moving()&&!modalMode&&!paused;
 for(const o of all){const s=point(o.x,o.y);if(s.x<-180||s.x>canvas.width+180||s.y<-100||s.y>canvas.height+230)continue;
  if(o.kind==='player'||o.kind==='companion')shadow(s,o.kind==='player'?12:15);if(o.kind==='player'){ctx.strokeStyle='#e9efadbb';ctx.lineWidth=1.4*zoom;ctx.beginPath();ctx.ellipse(s.x,s.y,13*zoom,5*zoom,0,0,Math.PI*2);ctx.stroke()}
  if(o.kind==='shrine'){
   ctx.fillStyle=save.badges.includes(save.region)?'#e8df964d':'#76dbf048';ctx.beginPath();ctx.ellipse(s.x,s.y-10*zoom,34*zoom,13*zoom,0,0,Math.PI*2);ctx.fill();
  }
  if(o.kind==='chest'&&save.chests.includes(save.region))drawSprite(ctx,o.id,s.x,s.y,o.w*zoom,{alpha:.45});
  else drawSprite(ctx,o.id,s.x,s.y+(isMoving&&(o.kind==='player'||o.kind==='companion')?Math.sin(now/95)*1.5*zoom:0),o.w*zoom,{tint:save.region===2&&o.kind==='grass'?'saturate(.3) brightness(1.35)':save.region===1&&o.kind==='grass'?'sepia(.5)':'none',alpha:occludesPlayer(o,s)?.24:1});
  if(['ranger','shrine','chest','gate'].includes(o.kind)&&!(o.kind==='chest'&&save.chests.includes(save.region))){
   const height=o.w*zoom*(sprites[o.id]?.height/sprites[o.id]?.width||1);ctx.fillStyle=o.kind==='shrine'?'#a2ddf8':o.kind==='chest'?'#f4ce81':'#eef2c0';ctx.font=`bold ${Math.round(13*zoom)}px sans-serif`;ctx.textAlign='center';ctx.fillText(o.kind==='ranger'?'IRIS':o.kind==='shrine'?(save.badges.includes(save.region)?'AWAKENED':'SHRINE'):o.kind==='chest'?'TREASURE':regions[o.target].short.toUpperCase()+(unlocked(o.target)?'':' · LOCKED'),s.x,s.y-height-7*zoom);
  }
 }
 if(save.region===2){ctx.fillStyle='#edf6f0aa';for(let i=0;i<34;i++){const x=(rnd(i,92)*canvas.width+now*.014*(i%2?1:-1)+canvas.width*10)%canvas.width,y=(rnd(i,48)*canvas.height+now*.022)%canvas.height;ctx.fillRect(x,y,2.5,2.5)}}
 else{ctx.fillStyle='#f7ecb488';for(let i=0;i<11;i++){ctx.fillRect(rnd(i,40)*canvas.width+Math.sin(now/2100+i)*9,rnd(i,32)*canvas.height+Math.cos(now/2600+i)*8,2,2)}}
 if(paused){ctx.fillStyle='#0b231477';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.textAlign='center';ctx.font='24px sans-serif';ctx.fillStyle='#ecf0d4';ctx.fillText('Adventure paused',canvas.width/2,canvas.height/2)}
}
function drawMinimap(){
 mini.clearRect(0,0,120,100);const mp=(x,y)=>({x:60+(x-y)*2.2,y:11+(x+y)*1.55});
 for(const t of world.tiles){const s=mp(t.x,t.y);mini.fillStyle=t.water?'#70b6c3':t.path?'#e7d79e':t.grass?'#5e8549':save.region===2?'#aec7c7':'#8caf6b';mini.fillRect(s.x-2,s.y-1,4,2.4)}
 for(const o of world.objects){if(!['shrine','ranger','chest','gate'].includes(o.kind)||(o.kind==='chest'&&save.chests.includes(save.region)))continue;const s=mp(o.x,o.y);mini.fillStyle=o.kind==='shrine'?'#80dcff':o.kind==='chest'?'#f6c25b':'#eff3d5';mini.fillRect(s.x-2,s.y-2,4,4)}
 const s=mp(player.x,player.y);mini.fillStyle='#e85d48';mini.beginPath();mini.arc(s.x,s.y,2.7,0,Math.PI*2);mini.fill();mini.strokeStyle='#fff4cc';mini.lineWidth=1;mini.stroke();
}
function toast(message,duration=5800){$('#toast').textContent=message;$('#toast').style.opacity='1';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.opacity='0',duration)}
function tone(f=440,duration=.2){if(!sound)return;try{audio ||=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type='triangle';o.frequency.setValueAtTime(f,audio.currentTime);g.gain.setValueAtTime(.05,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+duration)}catch{}}
function objective(){
 if(save.caught.length<2)return {title:'A friend in the grass',copy:'Find a wild creature, weaken it, then throw a capture orb.',lines:[[save.met,'Meet a wild creature'],[save.caught.length>1,'Catch your first new friend']],pin:'Explore the tall grass',step:'01'};
 for(let i=0;i<3;i++)if(!save.badges.includes(i))return {title:i===0?'Awaken the meadow':i===1?'The heart of Amber Ridge':'A light in the snow',copy:i===0?'Visit the blue crystal shrine north of camp and challenge its guardian.':`Travel to ${regions[i].name} and awaken its shrine. A strong team helps.`,lines:[[save.badges.includes(i),`Earn the ${regions[i].seal.toLowerCase()}`],[save.visited.includes(i),`Explore ${regions[i].short.toLowerCase()}`]],pin:save.region===i?'Follow the blue shrine marker north':`Take the eastern trail to ${regions[i].short}`,step:'0'+(i+2),region:i};
 return {title:save.caught.length===8?'Keeper of the isles':'Every friend has a story',copy:save.caught.length===8?'All three shrines are awake, and every creature has a place in your journal. Keep exploring.':'The shrines are awake. Explore all three regions to befriend the remaining creatures.',lines:[[true,'Awaken all three shrines'],[save.caught.length===8,`Befriend every species (${save.caught.length} / 8)`]],pin:save.caught.length===8?'All shrines awakened · Keep exploring':'Find the remaining creatures',step:'05'};
}
function ui(){
 for(const id of save.caught)companion(id).hp=Math.max(0,Math.min(maxHP(id),Number(companion(id).hp)||0));
 const s=species[save.active],c=companion(),hp=maxHP(save.active);$('#companion-name').textContent=s.name;$('#companion-desc').textContent=s.desc;$('#companion-type').textContent=s.type.toUpperCase();$('#companion-type').style.background=s.color+'33';$('#companion-type').style.color=s.color;$('#level').textContent='LV. '+level(save.active);$('#health').textContent=`${c.hp} / ${hp}`;$('#hpbar').style.width=c.hp/hp*100+'%';$('#hpbar').style.background=s.color;$('#xp-label').textContent=`${c.xp%45} / 45 XP`;$('#xpbar').style.width=c.xp%45/45*100+'%';$('#orbs').textContent=save.orbs;$('#potions').textContent=save.potions;$('#coins').textContent=save.coins;$('#count').textContent=`${save.caught.length} befriended · ${save.seen.length} / 8 seen`;$('#badge-count').textContent=`${save.badges.length} / 3 shrine seals`;
 const q=objective();$('#quest-title').textContent=q.title;$('#quest-copy').textContent=q.copy;$('#quest-step').textContent=q.step;$('#quest-lines').innerHTML=q.lines.map(([done,text])=>`<div class="quest-line"><span>${done?'✓':'○'}</span>${text}</div>`).join('');$('#objective-pin').textContent=q.pin;
 art('#buddy',save.active,106);persist();
}
function gainXP(amount,id=save.active){const before=level(id);companion(id).xp+=amount;const after=level(id);if(after>before)companion(id).hp=Math.min(maxHP(id),companion(id).hp+(after-before)*12);return after>before?`${species[id].name} reached level ${after}!`:`${species[id].name} gained ${amount} XP.`}
function open(content,mode,label='Game menu'){
 if(!modalMode)modalFocus=document.activeElement;
 modalMode=mode;keys={};touch=null;document.body.classList.add('modal-open');const m=$('#modal');m.innerHTML=content;m.hidden=false;m.setAttribute('aria-label',label);m.scrollTop=0;$('#interact').style.display='none';requestAnimationFrame(()=>m.focus({preventScroll:true}));
}
function close(){if(battle?.busy)return;if(battle&&modalMode==='battle'){flee();return}if(battle&&modalMode==='party'){renderBattle('Choose your next move.');return}$('#modal').hidden=true;modalMode='';document.body.classList.remove('modal-open');const f=modalFocus;modalFocus=null;if(f?.isConnected&&f!==document.body)f.focus({preventScroll:true});else canvas.focus({preventScroll:true});keys={};touch=null;persist()}
function header(eyebrow,title,closeButton=true){return `${closeButton?'<button class="close" aria-label="Close menu">×</button>':''}<div class="modal-header"><div class="eyebrow">${eyebrow}</div><h2>${title}</h2></div>`}
function wireClose(){const c=$('#modal .close');if(c)c.onclick=close}
function travel(id){
 if(battle||!unlocked(id)){toast('Awaken the previous shrine to open this trail.');return}
 save.region=id;save.visited=[...new Set([...save.visited,id])];Object.assign(player,regions[id].spawn);camera={x:player.x,y:player.y};encounterCooldown=3;steps=0;buildWorld();close();ui();tone(600);toast(`Welcome to ${regions[id].name}. The next chapter is yours.`);
}
function worldMap(){
 if(battle)return;
 open(`${header('THREE ISLANDS. ONE ADVENTURE.','The Verdant Isles')}<p>Follow the eastern trails, or travel directly to any unlocked region.</p><div class="map-cards">${regions.map((r,i)=>`<div class="region-card ${save.region===i?'current':''} ${!unlocked(i)?'locked':''}"><div class="region-preview"><canvas id="region-art-${i}" width="110" height="110"></canvas></div><h3>${r.name}</h3><p>${unlocked(i)?r.desc:`Earn the ${regions[i-1].seal.toLowerCase()} to open this trail.`}</p><button data-travel="${i}" ${!unlocked(i)?'disabled':''}>${!unlocked(i)?'Trail locked':save.region===i?'Return to this camp':'Travel to '+r.short}</button></div>`).join('')}</div><div class="map-progress">${save.badges.length?save.badges.map(i=>'✦ '+regions[i].seal).join(' &nbsp; · &nbsp; '):'Your first seal awaits at the meadow shrine. Befriend a wild creature, then visit the blue crystal north of camp.'}</div><div class="map-legend"><span><i class="legend-dot"></i> Camp / trail</span><span><i class="legend-dot blue"></i> Shrine</span><span><i class="legend-dot gold"></i> Treasure</span><span style="color:#e59b85">● You</span></div>`,'map','Island map');
 regions.forEach((r,i)=>{const c=$(`#region-art-${i}`).getContext('2d');drawSprite(c,r.preview,55,103,r.preview===0?80:88)});for(const b of document.querySelectorAll('[data-travel]'))b.onclick=()=>travel(+b.dataset.travel);wireClose();
}
function journal(filter='all'){
 if(battle)return;
 const ids=species.map((s,i)=>i).filter(i=>filter==='all'||save.caught.includes(i));
 open(`${header('NOTES FROM THE MEADOW','Your field journal')}<p>${save.caught.length} species befriended · ${save.seen.length} discovered · ${8-save.seen.length} yet to discover</p><div class="tab-buttons"><button id="all-species" class="${filter==='all'?'selected':''}">All species</button><button id="caught-species" class="${filter==='caught'?'selected':''}">Befriended</button></div><div class="journal-grid">${ids.map(i=>{const s=species[i],seen=save.seen.includes(i),caught=save.caught.includes(i);return `<div class="species ${save.active===i?'active':''}">${seen?`<canvas id="spec-${i}" width="110" height="110"></canvas>`:'<div class="unseen">?</div>'}<h3>${seen?s.name:'Unknown creature'}</h3><small>${caught?'Befriended · Lv. '+level(i):seen?'Seen · '+s.type:'Not yet discovered'}</small><p>${seen?s.desc:'A new friend is waiting along a wild trail.'}</p><small>${seen?regions.filter(r=>r.pool.includes(i)).map(r=>r.short).join(' / '):'Explore to discover'}</small>${caught?`<button data-select="${i}" ${save.active===i?'disabled':''}>${save.active===i?'Your companion':'Travel together'}</button>`:''}</div>`}).join('')}</div>`,'journal','Field journal');
 ids.forEach(i=>{if(save.seen.includes(i))art('#spec-'+i,i,85)});$('#all-species').onclick=()=>journal('all');$('#caught-species').onclick=()=>journal('caught');wireSelect();wireClose();
}
function party(){
 if(battle?.busy)return;
 open(`${header('FRIENDS FOR THE TRAIL','Your companions',!battle)}<p>${battle?'Switching companions uses your turn. Choose a friend with health remaining.':'Every creature you befriend can join you on the trail.'}</p><div class="journal-grid party-grid">${save.caught.map(i=>`<div class="species ${save.active===i?'active':''}"><canvas id="party-${i}" width="110" height="110"></canvas><h3>${species[i].name}</h3><small>${species[i].type} · Lv. ${level(i)}</small><div class="bar"><i style="width:${companion(i).hp/maxHP(i)*100}%;background:${species[i].color}"></i></div><small>${companion(i).hp} / ${maxHP(i)} HP</small><button data-select="${i}" ${(save.active===i||companion(i).hp===0)?'disabled':''}>${save.active===i?'Active companion':companion(i).hp===0?'Needs a rest':'Choose companion'}</button></div>`).join('')}</div>${battle?'<button id="back-battle" class="muted-button" style="margin-top:14px">Back to encounter</button>':''}`,'party','Companion team');save.caught.forEach(i=>art('#party-'+i,i,85));wireSelect();wireClose();if($('#back-battle'))$('#back-battle').onclick=()=>renderBattle('Choose your next move.');
}
function wireSelect(){for(const b of document.querySelectorAll('[data-select]'))b.onclick=()=>selectCompanion(+b.dataset.select)}
function selectCompanion(id){
 if(!save.caught.includes(id)||companion(id).hp<=0||battle?.busy)return;
 save.active=id;ui();tone(560);
 if(battle){battle.busy=true;renderBattle(`${species[id].name} joined the encounter!`);enemyTurn(`${species[id].name} joined the encounter.`)}else{close();toast(`${species[id].name} is ready to travel with you.`)}
}
function rest(){for(const id of save.caught)companion(id).hp=maxHP(id);save.orbs=Math.max(save.orbs,12);ui();tone(640);ranger('Everyone is rested, and your capture orbs are topped up. Safe travels!')}
function ranger(message='The shrines have been quiet for years. Perhaps your new friends can help wake them.'){
 if(battle)return;
 open(`${header('RANGER STATION','A moment with Iris')}<div class="ranger-body"><canvas id="ranger-art" width="90" height="135"></canvas><div><p>${message}</p><p>Rest here for free. I’ll refill your bag to 12 orbs, too.</p><div class="item-counts"><span>● ${save.coins} coins</span><span>✚ ${save.potions} potions</span><span>◉ ${save.orbs} orbs</span></div></div></div><div class="ranger-actions"><button class="primary" id="rest-team">Rest your team</button><button id="buy-potion" ${save.coins<10?'disabled':''}>Potion · 10 coins</button><button id="buy-orbs" ${save.coins<15?'disabled':''}>5 orbs · 15 coins</button></div><p class="dialog-note">Potions restore 24 HP during battle. Earn coins from encounters and treasure chests.</p>`,'ranger','Ranger Iris');const c=$('#ranger-art').getContext('2d');drawSprite(c,8,45,130,65);$('#rest-team').onclick=rest;$('#buy-potion').onclick=()=>{if(save.coins<10)return;save.coins-=10;save.potions++;ui();ranger('One potion for the trail. Use it when your companion needs a little help.')};$('#buy-orbs').onclick=()=>{if(save.coins<15)return;save.coins-=15;save.orbs+=5;ui();ranger('Five fresh capture orbs. There’s always room for one more friend.')};wireClose();
}
function returnToCamp(){if(battle){toast('Finish your encounter before returning to camp.');return}Object.assign(player,regions[save.region].spawn);camera={x:player.x,y:player.y};encounterCooldown=3;steps=0;close();persist();toast('Back at camp. Talk to Iris just northwest of the trail to rest.');}
function nearestObject(){return world.objects.filter(o=>o.kind&&['ranger','shrine','chest','sign','gate'].includes(o.kind)).map(o=>({...o,distance:Math.hypot(player.x-o.x,player.y-o.y)})).filter(o=>o.distance<1.95).sort((a,b)=>a.distance-b.distance)[0]||null}
function interact(){
 if(battle||modalMode||paused)return;const o=nearestObject();if(!o){toast('Follow the trail, or wander into tall grass to meet a friend.');return}
 tone(480);
 if(o.kind==='ranger')ranger();
 else if(o.kind==='sign')toast('North: crystal shrine · East: the next island · Blue minimap marker: shrine · Gold: treasure');
 else if(o.kind==='chest'){
  if(save.chests.includes(save.region)){toast('This treasure chest is empty. The next island may have another.');return}save.chests.push(save.region);save.coins+=30;save.potions+=2;save.orbs+=4;ui();result({title:'A little trail treasure',copy:'Something useful for the road ahead.',sprite:23,rewards:['30 coins','2 potions','4 capture orbs'],button:'Keep exploring'});
 }else if(o.kind==='gate'){
  if(!unlocked(o.target))toast(`This trail opens when you earn the ${regions[o.target-1].seal.toLowerCase()}. Visit the blue shrine marker.`);else travel(o.target);
 }else if(o.kind==='shrine')shrine();
}
function shrine(){
 const r=regions[save.region];
 if(save.badges.includes(save.region)){toast(`The ${r.seal.toLowerCase()} glows warmly. This shrine is awake.`);return}
 if(save.caught.length<2){toast('The shrine stirs… Befriend a wild creature before challenging its guardian.');return}
 open(`${header('THE CRYSTAL SHRINE',r.name+' guardian')}<canvas id="guardian-preview" class="result-art" width="150" height="150"></canvas><p style="text-align:center">${species[r.boss].name} · Level ${r.bossLevel} · ${species[r.boss].type}</p><p style="text-align:center;max-width:460px;margin:0 auto 17px">Win this challenge to earn the ${r.seal.toLowerCase()}${save.region<2?' and open the trail to '+regions[save.region+1].name:'. All three shrines will be awake'}.</p><div style="display:flex;justify-content:center;gap:10px"><button id="challenge" class="primary">Challenge guardian</button><button id="prepare-team">Prepare your team</button></div><p class="dialog-note" style="text-align:center">Guardian creatures cannot be captured. Potions and type strengths can help.</p>`,'shrine','Shrine guardian');art('#guardian-preview',r.boss,110);$('#challenge').onclick=()=>startBattle(r.boss,true);$('#prepare-team').onclick=party;wireClose();
}
function startBattle(id,boss=false){
 if(battle)return;if(companion().hp===0){const healthy=save.caught.find(i=>companion(i).hp>0);if(healthy===undefined){toast('Your team needs a rest. Talk to Iris at camp.');return}save.active=healthy}
 const r=regions[save.region];if(id===undefined){const missing=r.pool.filter(i=>!save.seen.includes(i));const pool=missing.length&&Math.random()<.6?missing:r.pool;id=pool[Math.floor(Math.random()*pool.length)]}
 const enemyLevel=boss?r.bossLevel:r.level+Math.floor(Math.random()*3),hp=species[id].hp+(enemyLevel-5)*4+(boss?18:0);
 battle={id,hp,max:hp,level:enemyLevel,boss,busy:false,guard:false,turn:0,token:Symbol('encounter')};save.met=true;if(!save.seen.includes(id))save.seen.push(id);ui();tone(boss?230:660);renderBattle(`${boss?'The shrine guardian':'A wild '+species[id].name} appeared! Choose your next move.`);
}
function captureChance(){return battle?.boss?0:Math.min(.96,.25+(1-battle.hp/battle.max)*.67+Math.max(0,level(save.active)-battle.level)*.025)}
function battleButton(id,title,detail,disabled=false,extra=''){return `<button id="${id}" ${disabled?'disabled':''} class="${extra}">${title}<small>${detail}</small></button>`}
function renderBattle(message,animation=''){
 if(!battle)return;const b=battle,a=species[save.active],s=species[b.id],eff=effectiveness(save.active,b.id);
 open(`${header(b.boss?'SHRINE GUARDIAN':'WILD ENCOUNTER',b.boss?'A shrine begins to stir.':s.name+' crossed your path.',false)}<div class="battle-top"><span>${a.type} ${eff>1?'is strong against':eff<1?'is weaker against':'meets'} ${s.type}</span><span class="${b.boss?'boss-label':''}">${b.boss?regions[save.region].seal:'Turn '+(b.turn+1)}</span></div><div class="battle-scene"><div class="fighter"><canvas id="fight-buddy" class="${animation==='attack'?'attack':animation==='enemy'?'hit':''}" width="160" height="145"></canvas><div class="name-line">${a.name} · Lv. ${level(save.active)}</div><div class="bar"><i style="width:${companion().hp/maxHP(save.active)*100}%;background:${a.color}"></i></div><small>${companion().hp} / ${maxHP(save.active)} HP</small></div><div class="fighter"><canvas id="fight-wild" class="${animation==='attack'?'hit':animation==='capture'?'catching':''}" width="160" height="145"></canvas><div class="name-line">${s.name} · Lv. ${b.level}</div><div class="bar"><i style="width:${b.hp/b.max*100}%;background:${s.color}"></i></div><small>${b.hp} / ${b.max} HP</small></div></div><div class="battle-log" role="status" aria-live="polite">${message}</div><div class="battle-actions">${battleButton('attack','1 · Quick strike','Reliable damage',b.busy)}${battleButton('element','2 · '+a.move,eff>1?'Super effective!':eff<1?'Less effective':'Elemental attack',b.busy)}${battleButton('catch','3 · Capture orb',b.boss?'Guardians cannot be caught':Math.round(captureChance()*100)+'% chance · '+save.orbs+' left',b.busy||b.boss||save.orbs===0,'capture-button')}${battleButton('potion','4 · Potion','Restore 24 HP · '+save.potions+' left',b.busy||save.potions===0||companion().hp===maxHP(save.active))}${battleButton('guard','5 · Guard','Reduce the next hit',b.busy)}${battleButton('switch','6 · Switch friend','Choose a companion',b.busy||save.caught.filter(i=>companion(i).hp>0).length<2)}</div><div class="battle-subactions"><button id="flee" ${b.busy?'disabled':''}>Leave encounter <kbd>Esc</kbd></button><span>${b.boss?'Win to awaken the shrine':'Weaken it before you catch it'}</span></div>`,'battle',s.name+' encounter');
 art('#fight-buddy',save.active,107);art('#fight-wild',b.id,107);$('#attack').onclick=()=>action('attack');$('#element').onclick=()=>action('element');$('#catch').onclick=()=>action('catch');$('#potion').onclick=()=>action('potion');$('#guard').onclick=()=>action('guard');$('#switch').onclick=party;$('#flee').onclick=flee;
}
function action(kind){
 if(!battle||battle.busy||modalMode!=='battle')return;const b=battle,a=species[save.active];let message='',animation='';
 if(kind==='attack'||kind==='element'){
  const eff=kind==='element'?effectiveness(save.active,b.id):1,base=kind==='element'?12:10;
  const damage=Math.max(3,Math.round((base+(level(save.active)-5)*1.25+Math.random()*4)*eff));b.hp=Math.max(0,b.hp-damage);message=`${a.name} used ${kind==='element'?a.move:'Quick strike'} for ${damage} damage.${eff>1?' Super effective!':eff<1?' Not very effective.':''}`;animation='attack';tone(kind==='element'?490:330);
  if(b.hp===0){winBattle();return}
 }else if(kind==='catch'){
  if(b.boss||save.orbs<1)return;save.orbs--;tone(760);b.busy=true;renderBattle('The orb glows… will your new friend stay?','capture');ui();const token=b.token;
  setTimeout(()=>{if(battle?.token!==token)return;if(Math.random()<captureChance())caughtBattle();else{battle.busy=true;renderBattle('The creature broke free of the orb!');enemyTurn('The creature broke free of the orb.')}},reducedMotion?250:850);return;
 }else if(kind==='potion'){
  if(save.potions<1||companion().hp===maxHP(save.active))return;save.potions--;const healed=Math.min(24,maxHP(save.active)-companion().hp);companion().hp+=healed;message=`${a.name} recovered ${healed} HP.`;tone(610);
 }else if(kind==='guard'){b.guard=true;message=`${a.name} braced for the next hit.`;tone(400)}
 b.busy=true;ui();renderBattle(message,animation);enemyTurn(message);
}
function enemyTurn(previous){
 if(!battle)return;const token=battle.token;
 setTimeout(()=>{
  if(battle?.token!==token)return;const b=battle,element=b.turn%2===1,eff=element?effectiveness(b.id,save.active):1;
  const damage=Math.max(2,Math.round((7+(b.level-5)*.65+Math.random()*3)*(b.boss?1.08:1)*eff*(b.guard?.35:1)));
  companion().hp=Math.max(0,companion().hp-damage);b.guard=false;b.turn++;b.busy=false;ui();tone(210);
  if(companion().hp===0){
   const healthy=save.caught.find(i=>i!==save.active&&companion(i).hp>0);
   if(healthy!==undefined){const fainted=species[save.active].name;save.active=healthy;ui();renderBattle(`${fainted} needs a rest. ${species[healthy].name} stepped in!`,'enemy')}
   else loseBattle();
  }else renderBattle(`${previous} ${species[b.id].name} used ${element?species[b.id].move:'Quick strike'} for ${damage} damage.`,'enemy');
 },reducedMotion?250:650);
}
function finishEncounter(){battle=null;steps=0;encounterAt=4+Math.random()*3;encounterCooldown=4;ui()}
function winBattle(){
 const b=battle,r=regions[save.region],newSeal=b.boss&&!save.badges.includes(save.region),reward=newSeal?60:b.boss?12:8+Math.floor(Math.random()*7),xp=newSeal?65:b.boss?20:24;save.wins++;save.coins+=reward;const xpText=gainXP(xp);
 if(newSeal){save.badges.push(save.region);save.potions+=2;for(const id of save.caught)companion(id).hp=maxHP(id)}
 finishEncounter();tone(840,.3);result({title:newSeal?r.seal+' awakened!':'A little stronger.',copy:newSeal?(save.region<2?`The eastern trail to ${regions[save.region+1].name} is open. Your team is rested and ready.`:'All three shrines shine again. You’ve become a keeper of the Verdant Isles!'):`${species[b.id].name} retreated into the wild.`,id:b.id,rewards:[reward+' coins',xp+' XP',...(newSeal?['2 potions']:[])],note:xpText,button:newSeal&&save.region<2?'Visit '+regions[save.region+1].short:'Back to the trail',onContinue:newSeal&&save.region<2?()=>travel(save.region+1):undefined});
}
function caughtBattle(){
 const id=battle.id,isNew=!save.caught.includes(id),enemyLevel=battle.level;if(isNew){save.caught.push(id);save.team[id]={xp:Math.max(0,enemyLevel-5)*45,hp:0};save.team[id].hp=maxHP(id)}
 const xpText=gainXP(20);save.coins+=10;save.wins++;finishEncounter();tone(880,.35);result({title:isNew?species[id].name+' is your new friend!':'Another friendly face.',copy:isNew?'Choose them from your companion team to travel and battle together.':`You already befriended ${species[id].name}. This one heads home happily.`,id,rewards:['10 coins','20 XP'],note:xpText,button:'Keep exploring',secondary:isNew?'Travel with '+species[id].name:undefined,onSecondary:()=>{save.active=id;ui();close();toast(species[id].name+' is ready for the trail.')}});
}
function flee(){if(!battle||battle.busy)return;finishEncounter();close();toast('You returned safely to the trail.');}
function loseBattle(){
 const id=save.active;finishEncounter();for(const i of save.caught)companion(i).hp=maxHP(i);Object.assign(player,regions[save.region].spawn);camera={x:player.x,y:player.y};ui();result({title:'A fresh start at camp.',copy:'Iris brought your team back safely. Everyone is rested. Try switching companions or using potions next time.',id,rewards:['Team fully healed'],button:'Back to the trail'});
}
function result({title,copy,id,sprite,rewards=[],note='',button='Keep exploring',onContinue,secondary,onSecondary}){
 open(`${header('A MOMENT FOR YOUR JOURNAL',title,false)}<div class="result-content"><canvas id="result-art" class="result-art" width="160" height="145"></canvas><p>${copy}</p><div class="reward-row">${rewards.map(r=>`<span class="reward-chip">${r}</span>`).join('')}</div>${note?`<p class="xp-gain">${note}</p>`:''}<button id="result-continue" class="primary">${button}</button>${secondary?`<button id="result-secondary" class="muted-button" style="display:block;margin:9px auto 0">${secondary}</button>`:''}</div>`,'result','Encounter result');if(id!==undefined)art('#result-art',id,110);else{const c=$('#result-art').getContext('2d');drawSprite(c,sprite,80,138,110)}$('#result-continue').onclick=onContinue||close;if(secondary)$('#result-secondary').onclick=onSecondary;
}
function help(){if(battle?.busy)return;if(battle)return;open(`${header('A FIELD GUIDE','Make yourself at home.')}<div class="help-copy"><p>Explore the isles with your companion. Befriend wild creatures and awaken all three shrines.</p><div class="shortcut-grid"><span><kbd>WASD</kbd> / arrows · Move in 8 directions</span><span><kbd>Shift</kbd> · Run</span><span><kbd>E</kbd> · Talk, open, or travel</span><span><kbd>M</kbd> · Island map</span><span><kbd>J</kbd> · Field journal</span><span><kbd>Q</kbd> · Companion team</span></div><ul><li>Walk through tall grass to meet creatures. Weaken them, then use a capture orb. The chance improves as their health drops.</li><li>Elemental attacks have strengths and weaknesses. The battle panel shows the current matchup.</li><li>Every friend you catch can become your companion. They gain XP, levels, and more health.</li><li>Find the blue shrine north of each camp. Win against its guardian to earn a seal and unlock the next region.</li><li>Talk to Iris to heal everyone and refill your orbs. Spend coins on extra orbs and potions.</li><li>On touch screens, use the eight-direction pad and tap Run. Tap the interaction prompt near a landmark.</li></ul><p>Your original meadow progress has been preserved. The game saves automatically on this device.</p></div>`,'help','How to play');wireClose()}
function moving(){return !!touch||['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].some(k=>keys[k])}
function movement(dt){
 const sx=touch?touch[0]:(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0),sy=touch?touch[1]:(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0);if(!sx&&!sy)return;
 const magnitude=Math.hypot(sx,sy),v=(keys.shift||touchRun?4.7:2.8)*dt,dx=(sx/magnitude+sy/magnitude)*v,dy=(sy/magnitude-sx/magnitude)*v,before={x:player.x,y:player.y};
 if(valid(player.x+dx,player.y))player.x+=dx;if(valid(player.x,player.y+dy))player.y+=dy;
 player.dir=Math.abs(sx)>.3?(sx<0?10:11):sy<0?9:8;
 const distance=Math.hypot(player.x-before.x,player.y-before.y);
 if(grass(Math.round(player.x),Math.round(player.y))){steps+=distance;if(encounterCooldown<=0&&steps>=encounterAt){steps=0;startBattle()}}else steps=Math.max(0,steps-distance*.4);
}
function resize(){const bounds=canvas.getBoundingClientRect();const height=Math.round(960*bounds.height/bounds.width);if(Number.isFinite(height)&&height>0&&canvas.height!==height)canvas.height=height;zoom=innerWidth<760?1.9:1.45;}
function loop(t){const dt=Math.min((t-last)/1000,.04)||0;last=t;now=t;frame++;if(!document.hidden){encounterCooldown=Math.max(0,encounterCooldown-dt);if(!paused&&!modalMode){save.playTime+=dt;movement(dt);nearest=nearestObject();$('#interact').style.display=nearest?'block':'none';if(nearest)$('#interact').textContent='E · '+nearest.label}
 const smoothing=reducedMotion?1:Math.min(1,dt*7);camera.x+=(player.x-camera.x)*smoothing;camera.y+=(player.y-camera.y)*smoothing;drawWorld();if(frame%4===0)drawMinimap()}
 requestAnimationFrame(loop);
}
$('#worldmap').onclick=worldMap;$('#quest-map').onclick=worldMap;$('#journal').onclick=()=>journal();$('#party').onclick=party;$('#help').onclick=help;$('#camp').onclick=returnToCamp;$('#interact').onclick=interact;$('#touch-e').onclick=interact;
$('#sound').onclick=()=>{sound=!sound;$('#sound').textContent=sound?'Sound on':'Sound off';$('#sound').setAttribute('aria-pressed',String(sound));tone(620)};
$('#pause').onclick=()=>{if(battle||modalMode)return;paused=!paused;$('#pause').textContent=paused?'Resume':'Pause';keys={};touch=null;toast(paused?'Taking a breather. Resume when you’re ready.':'Back to the adventure.')};
$('#zoom-in').onclick=()=>zoom=Math.min(2.5,zoom+.2);$('#zoom-out').onclick=()=>zoom=Math.max(.85,zoom-.2);
$('#touch-run').onclick=()=>{touchRun=!touchRun;$('#touch-run').setAttribute('aria-pressed',String(touchRun))};
for(const b of document.querySelectorAll('[data-dir]')){b.onpointerdown=e=>{if(modalMode||paused)return;e.preventDefault();b.setPointerCapture(e.pointerId);touch=b.dataset.dir.split(',').map(Number)};b.onpointerup=b.onpointercancel=()=>touch=null}
window.addEventListener('keydown',e=>{
 const k=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)&&!modalMode)e.preventDefault();
 if(modalMode){
  if(k==='escape'){e.preventDefault();close();return}
  if(k==='tab'){const focusable=[...$('#modal').querySelectorAll('button:not(:disabled),[tabindex="0"]')];if(focusable.length){const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===$('#modal'))){e.preventDefault();last.focus()}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===$('#modal'))){e.preventDefault();first.focus()}}return}
  if(modalMode==='battle'&&!e.repeat&&['1','2','3','4','5','6'].includes(k)){e.preventDefault();const id=['attack','element','catch','potion','guard','switch'][+k-1],button=$('#'+id);if(button&&!button.disabled)button.click()}return;
 }
 if(e.repeat&&['e','m','j','q'].includes(k))return;
 if(k==='e')interact();else if(k==='m')worldMap();else if(k==='j')journal();else if(k==='q')party();else keys[k]=true;
});
window.addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
window.addEventListener('blur',()=>{keys={};touch=null;persist()});document.addEventListener('visibilitychange',()=>{keys={};touch=null;persist()});window.addEventListener('pagehide',persist);window.addEventListener('resize',resize);
buildWorld();if(!valid(player.x,player.y))Object.assign(player,regions[save.region].spawn);camera={x:player.x,y:player.y};resize();ui();loadAssets().then(()=>{ui();toast(save.badges.length?'Your trail continues. Welcome back, explorer.':'The shrines are stirring. Find a new friend in the tall grass.');requestAnimationFrame(loop)});setInterval(persist,6000);
window.mossvale={getState:()=>({player,save,battle,paused,modalMode,world,zoom}),encounter:startBattle,valid,grass,travel,interact,objective,level,maxHP,effectiveness};
})();
