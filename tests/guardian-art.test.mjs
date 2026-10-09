import test from 'node:test';
import assert from 'node:assert/strict';
import {assets} from '../dist/src/data/assets.js';
import {species} from '../dist/src/data/species.js';
import {buildAdventure} from '../dist/src/domain/adventure.js';
import {guardianCombatSprite} from '../dist/src/render/battle-art.js';
import {content, mapsById, rawMaps, codec, newSave} from './helpers.mjs';
import {createBattle} from '../dist/src/domain/battle.js';

const forms = {'meadow':'mushmallow-thorn-mantle','amber-ridge':'pebblit-crystal-ridge','frostveil-grove':'frostowl-ice-mantle','reedfen-wetlands':'siltkip-tide-sail'};
for (const [mapId, form] of Object.entries(forms)) {
  test(`${mapId}: only its configured guardian uses ${form}; battle rules/save remain unchanged`, () => {
    const map = mapsById[mapId];
    const guardian = map.objects.find(object => object.kind === 'shrine').guardian;
    const expected = assets.findIndex(asset => asset.name === `creature-${form}-combat`);
    assert.ok(expected >= 0);
    const battle = createBattle(newSave(), () => 0.5, {...guardian, boss:true});
    assert.equal(guardianCombatSprite(map,battle), expected);
    assert.equal(guardianCombatSprite(map,{...battle,boss:false}), undefined);
    assert.equal(guardianCombatSprite(map,{...battle,id:species.findIndex(entry=>entry.id==='fernling')}), undefined);
    assert.equal(guardianCombatSprite({objects:[]},battle), undefined);
    const raw=rawMaps();delete raw.find(m=>m.id===mapId).landmarks.find(l=>l.kind==='shrine').guardian.combatSprite;
    const unconfigured=buildAdventure(raw,content);
    assert.deepEqual(unconfigured.errors,[]);
    assert.equal(guardianCombatSprite(unconfigured.mapsById[mapId],battle), undefined);
    assert.deepEqual(createBattle(newSave(),()=>0.5,{...unconfigured.mapsById[mapId].objects.find(o=>o.kind==='shrine').guardian,boss:true}),battle);
    const save=newSave();save.mapId=mapId;save.battle=battle;
    const payload=codec.serialize(save);const decoded=codec.load({getItem:key=>key==='mossvale-v3'?payload:null,setItem:()=>{}}).save;
    assert.equal(guardianCombatSprite(map,decoded.battle),expected,'reload derives current pack art without persisting manifest indices');
  });
}
test('override rejects missing, mismatched and static assets, while old packs need no override',()=>{
  for(const name of ['missing-combat','creature-frostowl-ice-mantle-combat','creature-mushmallow']) {
    const raw=rawMaps();raw[0].landmarks.find(l=>l.kind==='shrine').guardian.combatSprite=name;
    assert.ok(buildAdventure(raw,content).errors.some(e=>e.includes('guardian.combatSprite')),name);
  }
  const modified=structuredClone(content);const asset=modified.assets.find(a=>a.name==='creature-mushmallow-thorn-mantle-combat');asset.frames.rows=4;
  assert.ok(buildAdventure(rawMaps(),modified).errors.some(e=>e.includes('4×5')));
});
test('ambiguous same-species shrine configurations fail safely to ordinary art',()=>{
  const map=mapsById.meadow;const shrine=map.objects.find(o=>o.kind==='shrine');
  assert.equal(guardianCombatSprite({objects:[shrine,shrine]},{boss:true,...shrine.guardian}),undefined);
});
