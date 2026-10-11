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
  assert.ok(t[0]<=16000+12&&t[0]>t[1]&&t[1]>t[2]&&t[2]>t[3],`${a.id}: ${t}`);
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

// Look 2b, the owner's two complaints, as numbers: "Gundam bodies" (everyone on the superhero
// skeleton) and "everyone leans forward at the lights" (the fighter's Idle).
test('citizens: their own shoulders, and an upright stance at the lights',async()=>{
 const report=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
 const bytes=readFileSync('public/data/character/citizen.glb');
 const gltf=await new Promise((res,rej)=>new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',res,rej));
 const asset=humanoidCitizen(gltf,report);
 CITIZEN_PACK.current={manifest,bin,texture:null,skins:new Map()};
 try{
  const span={};
  for(const c of CITIZENS){
   const inst=asset.instance(undefined,c),root=inst.root;root.scale.set(1,1,1);
   const bone=n=>{let f=null;root.traverse(o=>{if(!f&&o.isBone&&o.name===n)f=o;});return f;};
   const P=n=>bone(n).getWorldPosition(new Vector3());
   root.updateMatrixWorld(true);span[c.id]=P('upperarm_l').distanceTo(P('upperarm_r'));
   const mixer=new AnimationMixer(root),clip=inst.clips.find(x=>x.name==='Idle');mixer.clipAction(clip).play();
   for(const t of [0,.3,.6]){
    mixer.setTime(t*clip.duration);root.updateMatrixWorld(true);
    const d=P('neck_01').sub(P('pelvis')),lean=Math.atan2(d.z,d.y)*180/Math.PI;
    const arm=P('lowerarm_l').sub(P('upperarm_l')),out=Math.atan2(Math.abs(arm.x),-arm.y)*180/Math.PI;
    const knee=P('thigh_l').sub(P('calf_l')).angleTo(P('foot_l').sub(P('calf_l')))*180/Math.PI;
    // Look 2d: the straightened spine carries the neck a little ahead of the hips, as a person's
    // does (a few centimetres), so up to 5 degrees.
    assert.ok(lean<5,`${c.id} leans ${lean.toFixed(1)} deg forward at the lights`);
    // Look 2d: hands are kept clear of the hips (clearFor), so a broader or a woman's body holds
    // them a little further out.
    const a=manifest.archetypes.find(x=>x.id===c.id);
    assert.ok(out<10+Math.max(0,a.macro.weight-.4)*20+(a.female?5:0),`${c.id} holds the arm ${out.toFixed(1)} deg out`);
    assert.ok(knee>163,`${c.id} stands with the knee at ${knee.toFixed(1)} deg`);
   }
   inst.dispose();
  }
  // The crowd skeleton's shoulders are 42.4 cm apart; nobody is drawn on them any more.
  for(const [id,s] of Object.entries(span))assert.ok(s<.40,`${id}: shoulders ${s.toFixed(3)} m`);
  assert.ok(span['office-f']<span['salaryman']*.92,'a woman as broad as a man');
 }finally{CITIZEN_PACK.current=null;}
});

// Look 2c: everyday idles and walks from 100STYLE (CC BY 4.0), per person.
import {MOVES} from '../src/life/appearance.mjs';
import {movesClips,decodeBase64,HURRY} from '../src/life/citizen-moves.mjs';
test('moves: each citizen carries its own idles and walks, baked after the shared rows',()=>{
 const moves=JSON.parse(readFileSync('public/data/character/citizen-moves.json','utf8'));
 assert.match(moves.license,/CC BY 4\.0/);
 for(const a of manifest.archetypes){
  const want=[...new Set([...MOVES[a.id].idles,...MOVES[a.id].walks,MOVES[a.id].hurry].filter(Boolean))];
  for(const n of want){const c=a.clips.find(x=>x.name===n);assert.ok(c,`${a.id} lacks ${n}`);
   assert.ok(c.row+c.frames<=a.boneAtlas.height,`${a.id} ${n} runs off its atlas`);
   if(n.startsWith('Walk.'))assert.ok(c.stride>.5&&c.stride<2.2,`${a.id} ${n} stride ${c.stride}`);}
  // The shared rows are where they were, so every reaction clip still plays.
  assert.deepEqual(a.clips.slice(0,manifest.clips.length).map(c=>[c.name,c.row]),manifest.clips.map(c=>[c.name,c.row]));
 }
});
test('moves: standing they play their own idle, walking their own walk, and the hurried walk when fast',()=>{
 const crowd=createHQCrowd(manifest,bin,{capacity:8,lods:['L0']});
 const a=manifest.archetypes.find(x=>x.id==='salaryman'),lane=crowd.laneFor(a.id,'L0');
 const row=n=>a.clips.find(c=>c.name===n).row,playing=i=>crowd.state.clipRow[i];
 const look={...appearanceOf(3),archetype:CITIZENS[0],idle:'Idle.phone',walk:'Walk.neutral',hurry:'Walk.rushed'};
 const i=crowd.spawn(77,look,lane,{speed:0});crowd.update(1/60,{time:0});
 assert.equal(playing(i),row('Idle.phone'));
 for(let k=0;k<40;k++)crowd.pace(i,1.2/30,0,1/30);
 assert.equal(playing(i),row('Walk.neutral'));
 for(let k=0;k<60;k++)crowd.pace(i,(HURRY+.4)/30,0,1/30);
 assert.equal(playing(i),row('Walk.rushed'));
});
test('moves: looking at a phone, the hands are in front of the chest and the head is down',async()=>{
 const report=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
 const bytes=readFileSync('public/data/character/citizen.glb');
 const gltf=await new Promise((res,rej)=>new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',res,rej));
 const asset=humanoidCitizen(gltf,report);
 const moves=movesClips(JSON.parse(readFileSync('public/data/character/citizen-moves.json','utf8')),decodeBase64);
 CITIZEN_PACK.current={manifest,bin,texture:null,skins:new Map(),moves};
 try{
  const inst=asset.instance(undefined,CITIZENS.find(c=>c.id==='student-m')),root=inst.root;root.scale.set(1,1,1);
  const P=n=>{let f=null;root.traverse(o=>{if(!f&&o.isBone&&o.name===n)f=o;});return f.getWorldPosition(new Vector3());};
  const mixer=new AnimationMixer(root),clip=inst.clips.find(c=>c.name==='Idle.text');assert.ok(clip,'no Idle.text up close');
  mixer.clipAction(clip).play();mixer.setTime(.3*clip.duration);root.updateMatrixWorld(true);
  const neck=P('neck_01'),pelvis=P('pelvis');
  for(const s of ['l','r']){const h=P('hand_'+s);
   assert.ok(h.z-neck.z>.12,`hand_${s} not in front (${(h.z-neck.z).toFixed(2)})`);
   assert.ok(h.y<neck.y&&h.y>pelvis.y,`hand_${s} at ${h.y.toFixed(2)}`);}
  inst.dispose();
 }finally{CITIZEN_PACK.current=null;}
});

// Look 2d, the owner's next two complaints: "leaning back, is the spine that curved?" (the crowd
// skeleton's rest spine, sway-backed, under every clip) and "the hands are hidden too much".
import {createPlayerFigure} from '../src/player/figure.mjs';
import {PHONE_BONE} from '../src/life/citizen-pose.mjs';
import {DataUtils} from 'three';
const nearAsset=async()=>{
 const report=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
 const bytes=readFileSync('public/data/character/citizen.glb');
 const gltf=await new Promise((res,rej)=>new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',res,rej));
 return humanoidCitizen(gltf,report);
};
test('posture: shoulders over the hips, the neck a little ahead, hands out from the hips and not behind them',async()=>{
 const asset=await nearAsset();
 CITIZEN_PACK.current={manifest,bin,texture:null,skins:new Map(),moves:movesClips(JSON.parse(readFileSync('public/data/character/citizen-moves.json','utf8')),decodeBase64)};
 try{
  for(const c of CITIZENS){
   const inst=asset.instance(undefined,c),root=inst.root;root.scale.set(1,1,1);
   const P=n=>{let f=null;root.traverse(o=>{if(!f&&o.isBone&&o.name===n)f=o;});return f.getWorldPosition(new Vector3());};
   const mixer=new AnimationMixer(root);
   for(const [name,standing] of [['Idle.stand',true],[MOVES[c.id].walks[0],false]]){
    const clip=inst.clips.find(x=>x.name===name),a=mixer.clipAction(clip);a.reset().play();
    for(const t of [0,.25,.5,.75]){
     mixer.setTime(t*clip.duration);root.updateMatrixWorld(true);const pel=P('pelvis');
     const sh=P('upperarm_l').add(P('upperarm_r')).multiplyScalar(.5).z-pel.z,nk=P('neck_01').z-pel.z;
     const at=`${c.id} ${name} @${t}`;
     assert.ok(sh>(standing?-.06:-.04)&&sh<(standing?.05:.09),`${at}: shoulders ${sh.toFixed(3)} m from over the hips`);
     assert.ok(nk>(standing?-.02:0)&&nk<(standing?.08:.17),`${at}: neck ${nk.toFixed(3)} m ahead of the hips`);
     for(const [s,k] of [['l',1],['r',-1]]){const out=(P('hand_'+s).x-P('thigh_'+s).x)*k;assert.ok(out>.09,`${at}: hand_${s} ${out.toFixed(3)} m out from the hip`);}
     if(standing)for(const s of ['l','r']){const z=P('hand_'+s).z-P('thigh_'+s).z;assert.ok(z>-.03,`${at}: hand_${s} ${z.toFixed(3)} m behind the hip`);}
    }
    a.stop();
   }
   inst.dispose();
  }
 }finally{CITIZEN_PACK.current=null;}
});
test('moves: few people hide their hands -- pockets, behind the back and folded are a minority',()=>{
 let hidden=0;const n=2000;
 for(let id=0;id<n;id++)if(/^Idle\.(pockets|behind|folded)$/.test(appearanceOf(id).idle))hidden++;
 assert.ok(hidden/n<.2,`${(100*hidden/n).toFixed(0)}% hide their hands`);
 let texting=0;for(let id=0;id<n;id++)if(appearanceOf(id).walk==='Walk.text')texting++;
 assert.ok(texting>n*.08,'nobody walks looking at a phone');
});
test('phone: baked only into the clips that hold one -- the hand\'s matrix there, nothing elsewhere',()=>{
 const phone=manifest.boneNames.indexOf(PHONE_BONE),hand=manifest.boneNames.indexOf('hand_r');
 for(const a of manifest.archetypes){
  const holds=MOVES[a.id].idles.includes('Idle.text');
  assert.equal(a.regions.phone>0,holds,`${a.id}: phone vertices`);
  if(!holds)continue;
  assert.ok(a.regions.screen>0&&level(a,'L0').triangles>level(a,'L1').triangles);
  const half=new Uint16Array(bin,a.boneAtlas.byteOffset,a.boneAtlas.count),bones=manifest.boneNames.length;
  const read=(row,b)=>[...half.slice((row*bones+b)*12,(row*bones+b)*12+12)].map(DataUtils.fromHalfFloat);
  for(const [name,on] of [['Idle.stand',false],['Idle.text',true],['Walk.text',true],['Walk',false]]){
   const spec=a.clips.find(c=>c.name===name);if(!spec)continue;
   const row=spec.row+1,m=read(row,phone);
   if(on)assert.deepEqual(m,read(row,hand),`${a.id} ${name}: the phone leaves the hand`);
   else assert.ok(m.every(v=>v===0),`${a.id} ${name}: a phone where none is held`);
  }
 }
});
test('near: each person walks their own walk, gait rebuilt on its stride, and the texter\'s phone shows',async()=>{
 const asset=await nearAsset();
 CITIZEN_PACK.current={manifest,bin,texture:null,skins:new Map(),moves:movesClips(JSON.parse(readFileSync('public/data/character/citizen-moves.json','utf8')),decodeBase64)};
 try{
  const figure=createPlayerFigure(asset,undefined,{variant:CITIZENS.find(c=>c.id==='student-m')});
  const phone=figure.root.userData.phoneBone;assert.ok(phone,'no phone bone up close');
  const stride=n=>figure.gait.ladder?.find?.(x=>x.name==='Walk')?.stride;
  figure.setMoves({idle:'Idle.text',walk:'Walk.pockets'});
  const pockets=manifest.archetypes.find(a=>a.id==='student-m').clips.find(c=>c.name==='Walk.pockets').stride;
  for(let k=0;k<60;k++)figure.update({x:0,y:0,z:k*.04,speed:1.2,heading:0},1/30);
  assert.equal(phone.scale.x,0,'a phone out while walking with hands in pockets');
  if(stride())assert.ok(Math.abs(stride()-pockets)<.1,`stride ${stride()} vs ${pockets}`);
  figure.reset();figure.setMoves({idle:'Idle.text',walk:'Walk.text'});
  for(let k=0;k<30;k++)figure.update({x:0,y:0,z:0,speed:0,heading:0},1/30);
  assert.equal(phone.scale.x,1,'no phone in a texter\'s hands');
  figure.reset();figure.setMoves({idle:'Idle.stand'});
  for(let k=0;k<30;k++)figure.update({x:0,y:0,z:0,speed:0,heading:0},1/30);
  assert.equal(phone.scale.x,0);
  figure.dispose();
 }finally{CITIZEN_PACK.current=null;}
});
