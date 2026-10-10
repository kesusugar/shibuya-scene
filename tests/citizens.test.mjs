// Look 2 (docs/GTA-LOOK.md): the MakeHuman CC0 citizens. Ten builds instead of two superhero
// bodies, textured, on the crowd's own skeleton and clips, drawn by the crowd and the near pool.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHQCrowd} from '../src/life/hq-crowd.mjs';
import {CITIZENS,ARCHETYPES,PEOPLE,appearanceOf} from '../src/life/appearance.mjs';

const manifest=JSON.parse(readFileSync('public/data/crowd/citizens.json','utf8'));
const raw=readFileSync('public/data/crowd/citizens.bin');
const bin=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);
const hq=JSON.parse(readFileSync('public/data/crowd/hq-crowd.json','utf8'));
const level=(a,name)=>a.levels.find(l=>l.name===name);
const positions=(a)=>{const l=level(a,'L0');return new Float32Array(bin,l.position.byteOffset,l.position.count);};

test('citizens: one per appearance archetype, four levels, a texture, on the crowd skeleton and clips',()=>{
 assert.deepEqual(manifest.archetypes.map(a=>a.id),CITIZENS.map(c=>c.id));
 assert.deepEqual(manifest.boneNames,hq.boneNames);
 assert.deepEqual(manifest.clips,hq.clips);
 for(const a of manifest.archetypes){
  assert.deepEqual(a.levels.map(l=>l.name),['L0','L1','L2','L3']);
  const t=a.levels.map(l=>l.triangles);
  assert.ok(t[0]<=16000&&t[0]>t[1]&&t[1]>t[2]&&t[2]>t[3],`${a.id}: ${t}`);
  assert.ok(existsSync('public'+a.texture),`${a.id}: no ${a.texture}`);
  for(const k of ['skin','top','bottom','hair','shoe'])assert.equal(a.means[k]?.length,3,`${a.id}: no ${k} mean`);
  for(const k of ['skin','top','bottom','shoe'])assert.ok(a.regions[k]>0,`${a.id}: no ${k} vertices`);
  const l0=level(a,'L0'),si=new Uint8Array(bin,l0.skinIndex.byteOffset,l0.skinIndex.count),sw=new Uint8Array(bin,l0.skinWeight.byteOffset,l0.skinWeight.count);
  for(let v=0;v<l0.vertices;v+=97){
   assert.equal(sw[v*4]+sw[v*4+1]+sw[v*4+2]+sw[v*4+3],255,`${a.id}: weights of ${v} do not sum to one`);
   for(let k=0;k<4;k++)assert.ok(si[v*4+k]<hq.bones);
  }
 }
});

// The owner's ask: not one muscular build for everyone.
test('citizens: the builds differ -- a heavy man is broader at the waist than a thin student',()=>{
 const waist=id=>{const a=manifest.archetypes.find(x=>x.id===id),p=positions(a);let w=0;
  for(let i=0;i<p.length;i+=3)if(p[i+1]>.95&&p[i+1]<1.1)w=Math.max(w,Math.abs(p[i+2]));return w;};
 assert.ok(waist('salaryman-50')>waist('student-m')*1.15,`${waist('salaryman-50')} vs ${waist('student-m')}`);
 assert.ok(waist('casual-f')>waist('student-f')*1.1);
 const ages=new Set(manifest.archetypes.map(a=>Math.round(a.macro.age*10))),genders=new Set(manifest.archetypes.map(a=>a.macro.gender));
 assert.ok(ages.size>=4&&genders.size===2);
});

test('citizens: the crowd draws them textured, one material per archetype, with no extra attribute',()=>{
 const crowd=createHQCrowd(manifest,bin,{capacity:8,lods:['L0','L3']});
 assert.equal(crowd.lanes.length,manifest.archetypes.length*2);
 for(const lane of crowd.lanes){
  assert.ok(lane.geometry.attributes.crowdUV&&!lane.geometry.attributes.color);
  assert.equal(lane.material.defines.HQ_TEXTURED,'1');
  assert.equal(lane.material.vertexColors,false);
 }
 const n=Object.keys(crowd.lanes[0].geometry.attributes).length;
 const old=createHQCrowd(hq,(()=>{const r=readFileSync('public/data/crowd/hq-crowd.bin');return r.buffer.slice(r.byteOffset,r.byteOffset+r.byteLength);})(),{capacity:8,lods:['L0']});
 assert.equal(n,Object.keys(old.lanes[0].geometry.attributes).length,'the citizens need a vertex attribute slot the crowd does not have');
});

test('citizens: appearance draws from them by default, from the RUN 6.8 bodies with ?people=classic',()=>{
 const ids=new Set(CITIZENS.map(c=>c.id));
 for(let id=0;id<200;id++)assert.ok(ids.has(appearanceOf(id).archetype.id));
 const seen=new Set();for(let id=0;id<400;id++)seen.add(appearanceOf(id).archetype.id);
 assert.equal(seen.size,CITIZENS.length,'an archetype never appears');
 // Salarymen wear suits.
 for(let id=0;id<400;id++){const l=appearanceOf(id);if(l.archetype.id==='salaryman')assert.ok(CITIZENS[0].tops.includes(l.top));}
 PEOPLE.mode='classic';
 try{const legacy=new Set(ARCHETYPES.map(a=>a.id));for(let id=0;id<50;id++)assert.ok(legacy.has(appearanceOf(id).archetype.id));}
 finally{PEOPLE.mode='citizens';}
});

import {createHQLayer} from '../src/life/hq-layer.mjs';
test('citizens: the HQ layer draws a crowd in every one of them, nobody dropped',()=>{
 const people=[];for(let id=0;id<400;id++){const a=id*2.4,r=4+(id%60);
  people.push({id,active:true,controlled:false,archetype:'adult',state:'walking',x:Math.cos(a)*r,z:Math.sin(a)*r,renderX:Math.cos(a)*r,renderZ:Math.sin(a)*r,
   height:0,heading:0,speed:1.3,crossing:null,queueKey:null,edge:3,route:[3]});}
 const layer=createHQLayer(manifest,bin,{budget:400}),cam={x:0,z:0};
 layer.sync(people,cam,0,{time:0});layer.relod();layer.sync(people,cam,0,{time:0});
 const got=layer.crowd.inspect();
 assert.equal(got.population,400);
 const used=new Set();for(let i=0;i<got.population;i++)used.add(layer.crowd.lanes[layer.crowd.state.lane[i]].archetype.id);
 assert.equal(used.size,CITIZENS.length);
});

import {AnimationMixer,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {humanoidCitizen} from '../src/player/character-asset.mjs';
import {CITIZEN_PACK} from '../src/life/citizen-pack.mjs';
globalThis.ProgressEvent??=class{constructor(t,i={}){Object.assign(this,{type:t},i);}};
test('citizens: up close (the near pool) a citizen is the same mesh, skinned to the rig, and walks',async()=>{
 const report=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
 const bytes=readFileSync('public/data/character/citizen.glb');
 const gltf=await new Promise((res,rej)=>new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',res,rej));
 const asset=humanoidCitizen(gltf,report);
 // Before the pack is in: the RUN 6.8 body the citizen names.
 const early=asset.instance(undefined,CITIZENS[1]);let legacy=0;early.root.traverse(o=>{if(o.isSkinnedMesh&&!o.geometry.attributes.crowdUV)legacy++;});
 assert.ok(legacy>0);
 CITIZEN_PACK.current={manifest,bin,texture:null,skins:new Map()};
 try{
  for(const c of [CITIZENS[0],CITIZENS[6]]){
   const inst=asset.instance(undefined,c);const meshes=[];inst.root.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
   assert.equal(meshes.length,1,'a citizen is one skinned mesh');
   const mesh=meshes[0];
   assert.ok(mesh.geometry.attributes.crowdUV);
   assert.equal(mesh.geometry.index.count/3,manifest.archetypes.find(a=>a.id===c.id).levels[0].triangles);
   assert.equal(mesh.skeleton.bones.filter(Boolean).length,manifest.bones);
   const mixer=new AnimationMixer(inst.root);mixer.clipAction(inst.clips.find(x=>x.name==='Walk')).play();mixer.update(.3);
   inst.root.updateMatrixWorld(true);mesh.skeleton.update();
   const v=new Vector3();let lo=9,hi=-9;
   for(let i=0;i<mesh.geometry.attributes.position.count;i+=7){mesh.getVertexPosition(i,v);v.applyMatrix4(mesh.matrixWorld);lo=Math.min(lo,v.y);hi=Math.max(hi,v.y);}
   assert.ok(lo>-.05&&hi<1.9&&hi>1.4,`${c.id} walks from ${lo.toFixed(2)} to ${hi.toFixed(2)} m`);
   inst.dispose();
  }
 }finally{CITIZEN_PACK.current=null;}
});
