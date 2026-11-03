// Reality alignment (docs/PLAN-REALITY.md): the scene follows surveyed data, not a chosen view.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CAMERAS} from '../src/app/foundation.mjs';
import {resolveHeight,buildBuildingModel} from '../src/buildings/model.mjs';
import {HEIGHT_OVERRIDES} from '../src/buildings/config.mjs';
import {HERO_DEFINITIONS} from '../src/heroes/config.mjs';
import {prepareHero} from '../src/heroes/model.mjs';
import {BUILDERS} from '../src/heroes/builders.mjs';
import {SIGN_STRUCTURES,signStructureLayout} from '../src/signs/sign-structures.mjs';
import {EXCLUDED_ADS} from '../src/signs/reference-ads.mjs';
const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json','utf8'));

test('reference cameras: solved from photographs, kept out of the main bar, existing presets unchanged',()=>{
 const refs=CAMERAS.filter(c=>c.reference);
 assert.deepEqual(refs.map(c=>c.id),['ref-a','ref-b','ref-c']);
 for(const c of refs){assert.ok([...c.position,...c.target,c.fov].every(Number.isFinite));assert.ok(c.frame?.length===2&&c.source);}
 assert.deepEqual(CAMERAS.find(c=>c.id==='ref').position,[12,86,136]);
 assert.deepEqual(CAMERAS.find(c=>c.id==='scramble').position,[52,48,60]);
 assert.match(readFileSync('app/ShibuyaScene.tsx','utf8'),/!c\.reference/);
});

test('PLATEAU heights: merged into the scene data and preferred over guesses; no view-driven overrides',()=>{
 const merged=data.buildings.filter(b=>b.plateau);
 assert.ok(merged.length>=550,`${merged.length} buildings carry PLATEAU data`);
 assert.equal(data.source.plateau?.provider,'MLIT Project PLATEAU');
 assert.deepEqual(HEIGHT_OVERRIDES,{});
 const r=resolveHeight({id:'x',tags:{},plateau:{h:27.3}});assert.equal(r.height,27.3);assert.equal(r.method,'plateau');
 const model=buildBuildingModel(data);
 const taiseido=model.buildings.find(b=>b.id==='way/136690966');
 assert.equal(taiseido.height,24.1,'the Taiseido building stands at its measured 24.1 m');
 const methods={};for(const b of model.buildings)methods[b.method]=(methods[b.method]??0)+1;
 assert.ok((methods.seeded??0)<40,`seeded heights left: ${methods.seeded}`);
 // Roof steps sit on the main roof, inside the footprint.
 const stepped=model.buildings.filter(b=>b.roofSteps?.length);assert.ok(stepped.length>=20,`${stepped.length} buildings with roof steps`);
 for(const b of stepped)for(const s of b.roofSteps){assert.ok(s.y>b.height&&s.y<=b.height+30);assert.ok(s.area>=4);}
});

test('QFRONT: glass block to the top storey, a full-perimeter crown to 52.1 m, deck recessed at 48.4 m',()=>{
 const def=HERO_DEFINITIONS.find(d=>d.key==='qfront');assert.equal(def.height,52.1);
 const h=prepareHero(data,def);BUILDERS.qfront(h);
 const by=Object.fromEntries(h.masses.map(m=>[m.label,m]));
 assert.ok(Math.abs(by['roof-crown'].top-(52.1+.15))<.01);
 assert.equal(by['roof-crown'].polygon.holes.length,1,'the crown is a screen round the perimeter, not a box');
 assert.ok(Math.abs(by['roof-deck'].top-(48.4+.15))<.01);
 assert.ok(Math.abs(by['upper-storeys'].top-(44+.15))<.01);
 assert.equal(by['roof-crown'].polygon.outer,h.footprint.outer,'the crown is not set back');
});

test('sign structures: the Hisamitsu / サロンパス frame stands on the Taiseido roof and faces the crossing',()=>{
 assert.equal(EXCLUDED_ADS[15],'carried-by-sign-structure');assert.equal(EXCLUDED_ADS[16],'carried-by-sign-structure');
 for(const s of SIGN_STRUCTURES){const lay=signStructureLayout(s);
  const mid=[(s.a[0]+s.b[0])/2,(s.a[1]+s.b[1])/2],toCrossing=[6.5-mid[0],2-mid[1]];
  assert.ok(lay.normal[0]*toCrossing[0]+lay.normal[1]*toCrossing[1]>0,'faces the crossing');
  assert.ok(lay.boards.every(b=>b.p[1]-b.height/2>=s.roof));
  assert.ok(lay.top>=38&&lay.top<=42,`top ${lay.top}`);
  const b=data.buildings.find(r=>r.id===s.building);assert.equal(b.plateau.h,s.roof);}
});
