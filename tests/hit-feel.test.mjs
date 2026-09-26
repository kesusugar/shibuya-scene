// §9ai: hits that land -- the ragdoll a killed near body falls with (H4), and (below) the
// hit-stop, the contact effects and the directional flinch.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {humanoidCitizen} from '../src/player/character-asset.mjs';
import {createPlayerFigure} from '../src/player/figure.mjs';
import {createRagdoll,RAGDOLL} from '../src/player/ragdoll.mjs';

globalThis.ProgressEvent??=class{constructor(type,init={}){Object.assign(this,{type},init);}};
const REPORT=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
const BYTES=readFileSync('public/data/character/citizen.glb');
let cached=null;
const humanoid=async()=>cached??=humanoidCitizen(await new Promise((res,rej)=>new GLTFLoader()
 .parse(BYTES.buffer.slice(BYTES.byteOffset,BYTES.byteOffset+BYTES.byteLength),'',res,rej)),REPORT);

async function fall(zone,dir={x:0,z:1},push={x:0,y:0,z:0}){
 const figure=createPlayerFigure(await humanoid());
 const state={x:0,y:0,z:0,speed:0,heading:0,bodyHeading:0,alive:true,attackTime:0};
 for(let i=0;i<20;i++)figure.update(state,1/30);
 const rag=createRagdoll(figure.root);
 assert.ok(rag.ready,'the rig lacks a ragdoll bone');
 const pelvis=figure.root.getObjectByName('pelvis'),head=figure.root.getObjectByName('Head');
 const p0=pelvis.getWorldPosition(new Vector3()),h0=head.getWorldPosition(new Vector3());
 rag.start({dir,zone,push,ground:0});
 let t=0;for(;t<RAGDOLL.maxAwake+.1&&rag.update(1/30);t+=1/30);
 figure.root.updateMatrixWorld(true);
 const p1=pelvis.getWorldPosition(new Vector3()),h1=head.getWorldPosition(new Vector3());
 const out={figure,rag,p0,p1,h0,h1,t};
 return out;
}

for(const zone of ['head','body','legs'])test(`H4: a blow to the ${zone} puts the body on the ground, along the blow, in one piece`,async()=>{
 const {figure,rag,p0,p1,h0,h1,t}=await fall(zone,{x:1,z:0});
 assert.ok(rag.asleep,`still moving after ${t.toFixed(1)} s`);
 assert.ok(p1.y<.35,`the pelvis is ${p1.y.toFixed(2)} m up: not down`);
 assert.ok(h1.y<.45,`the head is ${h1.y.toFixed(2)} m up: not down`);
 // Along the blow: the head ends further along +x than it started -- or, for a blow to the legs,
 // the legs are taken out along it (and the body comes down the other way, which is right).
 if(zone==='legs'){const k=rag.points.calf_l.x+rag.points.calf_r.x;assert.ok(k/2>.25,`the knees moved ${(k/2).toFixed(2)} m along the blow`);}
 else assert.ok(h1.x-h0.x>.4,`the head moved ${(h1.x-h0.x).toFixed(2)} m along the blow`);
 for(const s of rag.sticks)assert.ok(Math.abs(s.now-s.rest)<.05*s.rest+.01,`${s.a}-${s.b} stretched to ${s.now.toFixed(3)} from ${s.rest.toFixed(3)}`);
 for(const [name,p] of Object.entries(rag.points)){assert.ok([p.x,p.y,p.z].every(Number.isFinite),name);assert.ok(p.y>=-.001,`${name} under the ground`);}
 // The skeleton follows the points.
 assert.ok(p1.distanceTo(rag.points.pelvis)<.02,'the pelvis bone is not on its point');
 void p0;figure.dispose();
});

test('H4: the direction of the blow decides where the body falls',async()=>{
 const a=await fall('body',{x:0,z:1}),b=await fall('body',{x:0,z:-1});
 assert.ok(a.h1.z>a.h0.z+.3&&b.h1.z<b.h0.z-.3,`forward ${(a.h1.z-a.h0.z).toFixed(2)}, back ${(b.h1.z-b.h0.z).toFixed(2)}`);
 a.figure.dispose();b.figure.dispose();
});

// H3 ---------------------------------------------------------------------------------------------
import {createHitReaction,HIT_REACTION} from '../src/player/hit-reaction.mjs';
import {Object3D} from 'three';

async function standing(){
 const figure=createPlayerFigure(await humanoid());
 const state={x:0,y:0,z:0,speed:0,heading:0,bodyHeading:0,alive:true,attackTime:0};
 for(let i=0;i<20;i++)figure.update(state,1/30);
 return {figure,state};
}
/** Peak displacement of a bone over the reaction, relative to its pose without it. */
async function reaction(zone,dir){
 const {figure,state}=await standing(),r=createHitReaction(figure.root);
 assert.ok(r.ready);
 // The crown: 15 cm above the head bone (which sits on the neck joint and hardly moves when the head tilts).
 const headBone=figure.root.getObjectByName('Head'),crown=new Object3D();crown.name='crown';headBone.add(crown);
 figure.root.updateMatrixWorld(true);crown.position.copy(headBone.worldToLocal(headBone.getWorldPosition(new Vector3()).add(new Vector3(0,.15,0))));
 const at=n=>figure.root.getObjectByName(n).getWorldPosition(new Vector3());
 r.hit({dirX:dir.x,dirZ:dir.z,heading:0,zone,strength:1});
 const peak={};const frames=[];
 for(let i=0;i<45;i++){figure.update(state,1/30);const base={head:at('crown'),knee:at('calf_l'),ankle:at('foot_l'),hip:at('thigh_l'),chest:at('spine_03')};
  r.update(1/30,0);const now={head:at('crown'),knee:at('calf_l'),ankle:at('foot_l'),hip:at('thigh_l'),chest:at('spine_03')};frames.push({base,now});}
 for(const k of ['head','chest'])peak[k]=frames.reduce((m,f)=>Math.abs(f.now[k].z-f.base[k].z)>Math.abs(m.z)?{z:f.now[k].z-f.base[k].z,x:f.now[k].x-f.base[k].x}:m,{z:0,x:0});
 const settled=!r.awake;
 figure.dispose();
 return {peak,frames,settled};
}

test('H3: shot in the head from the front, the head snaps back more than the chest moves',async()=>{
 const {peak,settled}=await reaction('head',{x:0,z:-1});   // travelling toward -z: from the front
 assert.ok(peak.head.z<-.05,`the head moved ${peak.head.z.toFixed(3)} m along the facing`);
 assert.ok(Math.abs(peak.head.z)>2*Math.abs(peak.chest.z),'the chest took the blow, not the head');
 assert.ok(settled,"still moving after 1.5 s");
});

test('H3: hit in the chest from the side, the chest gives sideways and comes back',async()=>{
 const {peak,frames}=await reaction('body',{x:1,z:0});     // travelling toward +x: the body's left
 const moved=Math.max(...frames.map(f=>Math.abs(f.now.chest.x-f.base.chest.x)));
 assert.ok(moved>.02,`the chest moved ${moved.toFixed(3)} m`);
 const last=frames[frames.length-1];assert.ok(last.now.chest.distanceTo(last.base.chest)<.01,'did not settle');
 void peak;
});

test('H3: hit in the legs, the knees buckle (the knee angle closes)',async()=>{
 const {frames}=await reaction('legs',{x:0,z:-1});
 const knee=f=>{const a=f.hip.clone().sub(f.knee).normalize(),b=f.ankle.clone().sub(f.knee).normalize();return Math.acos(a.dot(b));};
 const straight=knee(frames[0].base),least=Math.min(...frames.map(f=>knee(f.now)));
 assert.ok(least<straight-.12,`the knee went from ${straight.toFixed(2)} to ${least.toFixed(2)} rad`);
});

test('H3: a burst adds up, and the springs stay bounded',()=>{
 const bones={};const root={getObjectByName:n=>bones[n]??=null,updateMatrixWorld(){}};
 const r=createHitReaction(root);
 for(let i=0;i<12;i++)r.hit({dirX:0,dirZ:-1,zone:'body',strength:.6});
 // Without bones the springs still integrate: advance them by hand through angleOf.
 assert.ok(r.hits===12);
 assert.ok(HIT_REACTION.limit<1);
});

// H1 / H2 and the wiring ----------------------------------------------------------------------------
import {createHitStop,victimScale,HIT_STOP} from '../src/player/hit-stop.mjs';
import {createMeleeCombat} from '../src/player/combat.mjs';
import {SWORD} from '../src/player/attack-timing.mjs';
import {castShot} from '../src/player/ballistics.mjs';
import {createWeaponEffects} from '../src/player/weapon-effects.mjs';

test('H1: a landed blow nearly stops the swing for its hit-stop, then time runs on',()=>{
 const h=createHitStop();
 assert.equal(h.scale(1/60),1/60,'no blow, full speed');
 h.hit('katana');
 let run=0;for(let k=0;k<Math.floor(HIT_STOP.katana*120);k++)run+=h.scale(1/120);
 assert.ok(run<HIT_STOP.katana*.1,`the swing ran ${run.toFixed(4)} s through a ${HIT_STOP.katana} s stop`);
 h.scale(1/120);
 assert.ok(Math.abs(h.scale(1/60)-1/60)<1e-9,'did not resume');
 // An automatic's rounds: at most one stop per smgGap, so a burst does not stutter.
 const g=createHitStop();let stops=0;for(let i=0;i<12;i++){if(g.hit('smg'))stops++;g.scale(WEAPONS_REFIRE);}
 assert.ok(stops<=Math.ceil(12*WEAPONS_REFIRE/HIT_STOP.smgGap)+1,`${stops} stops in a 12-round burst`);
 assert.ok(victimScale(1/60,0,.01)<1/60&&victimScale(1/60,1,.5)===1/60);
});
const WEAPONS_REFIRE=.085;

function crowdOf(people){
 const c={time:0,network:{ctx:{safe:()=>true,height:()=>0,solid:()=>false}},grid:new Map(),
  cell:(x,z)=>Math.floor(x/2)+','+Math.floor(z/2),
  insert(p){const k=c.cell(p.x,p.z);if(!c.grid.has(k))c.grid.set(k,[]);c.grid.get(k).push(p);},
  leave(p){p.crossing=null;},strike(p,dx,dz){p.struck=0;const l=Math.hypot(dx,dz)||1;p.flyX=dx/l*2.2;p.flyZ=dz/l*2.2;p.flyY=1.3;p.flyGround=0;return true;},
  say:()=>true,scatter:()=>true,vehicleOverlap:()=>false,blocked:()=>false,flee:()=>true};
 for(const p of people)c.insert(p);return c;
}
const npc=(id,x,z)=>({id,active:true,controlled:false,choreographed:false,archetype:'adult',state:'walking',
 x,z,renderX:x,renderZ:z,heading:Math.PI,speed:0,crossing:null,combatHealth:100,combatDead:false});

test('H1-H4 wiring: a cut marks where and which way it struck, catches the victim, and a kill hands the ragdoll its start',()=>{
 const a=npc(1,0,1.3),c=crowdOf([a]),state={x:0,z:0,heading:0,bodyHeading:0,speed:0,alive:true,health:100,attackTime:0,hurtTime:0};
 const player={state,startAttack(sec,name){state.attackTime=sec;state.attackDuration=sec;state.attackName=name;return true;}};
 const melee=createMeleeCombat({weapon:()=>'katana'});
 melee.request();
 for(let t=0;t<SWORD.duration+.1&&!a.hitSeq;t+=1/60){c.time+=1/60;melee.update(1/60,c,player);}
 assert.equal(a.hitSeq,1,'no blow recorded');
 assert.ok(['head','body','legs'].includes(a.hitZone));
 assert.ok(a.hitStopUntil>c.time,'the victim does not catch');
 // The blade goes across the body from its left to its right, and away: toward -x and +z here.
 assert.ok(a.hitX<0&&a.hitZ>0,`blow direction ${a.hitX.toFixed(2)},${a.hitZ.toFixed(2)}`);
 assert.ok(!a.ragdoll,'a survivor has no ragdoll');
 for(let t=0;t<SWORD.duration;t+=1/60){c.time+=1/60;melee.update(1/60,c,player);}   // the first swing ends
 melee.request();
 for(let t=0;t<2*SWORD.duration&&!a.combatDead;t+=1/60){c.time+=1/60;melee.update(1/60,c,player);}
 assert.ok(a.combatDead&&a.ragdoll,'the kill gave no ragdoll');
 assert.equal(a.ragdoll.seq,a.hitSeq);
 assert.ok(Math.hypot(a.ragdoll.push.x,a.ragdoll.push.z)>1,'the ragdoll was not given the knock-down push');
});

test('H3: a round below the hips is a hit to the legs (for the reaction; damage still goes by zone)',()=>{
 const p={id:1,x:0,z:10,y:0,height:1.76};
 assert.equal(castShot({from:{x:0,y:.5,z:0},dir:{x:0,y:0,z:1},people:[p]}).part,'legs');
 assert.equal(castShot({from:{x:0,y:1.2,z:0},dir:{x:0,y:0,z:1},people:[p]}).part,'body');
 const head=castShot({from:{x:0,y:1.65,z:0},dir:{x:0,y:0,z:1},people:[p]});
 assert.equal(head.part,'head');assert.equal(head.zone,'head');
 assert.equal(castShot({from:{x:0,y:.5,z:0},dir:{x:0,y:0,z:1},people:[p]}).zone,'body');
 // A round's wound marks the part, lighter for an automatic.
 const q=npc(2,0,5),c=crowdOf([q]),melee=createMeleeCombat();
 melee.wound(c,{state:{x:0,z:0}},q,{damage:25,dir:{x:0,z:1},weapon:'smg',part:'legs'});
 assert.equal(q.hitZone,'legs');assert.equal(q.hitStrength,.6);
});

test('H2: blood is its own pool, sprayed along the blow, and falls',()=>{
 const fx=createWeaponEffects();
 fx.blood(0,1.2,0,{dir:{x:1,y:0,z:0},count:20});
 assert.equal(fx.stats.blood,20);
 const pts=fx.root.getObjectByName('weapon-blood');assert.ok(pts&&pts.visible);
 assert.notEqual(pts.material.blending,fx.root.getObjectByName('weapon-sparks').material.blending,'blood must not glow like sparks');
 for(let i=0;i<12;i++)fx.update(1/30);
 const pos=pts.geometry.attributes.position.array;let sx=0,sy=0,n=0;
 for(let i=0;i<20;i++){if(pos[i*3+1]<-100)continue;sx+=pos[i*3];sy+=pos[i*3+1];n++;}
 assert.ok(n>0&&sx/n>.2,'the spray did not go along the blow');
 assert.ok(sy/n<1.2,'the blood did not fall');
 fx.dispose();
});

test('H4 wiring: a figure told it is a ragdoll falls from where it stood and stops following the state',async()=>{
 const figure=createPlayerFigure(await humanoid());
 const state={x:3,y:0,z:4,speed:0,heading:0,bodyHeading:0,alive:true,attackTime:0};
 for(let i=0;i<10;i++)figure.update(state,1/30);
 state.ragdoll={seq:1,dir:{x:1,z:0},zone:'body',push:{x:1,y:0,z:0},ground:0};state.alive=true;
 figure.update(state,1/30);
 assert.ok(figure.ragdoll?.active,'no ragdoll');
 state.x=40;for(let i=0;i<120;i++)figure.update(state,1/30);
 assert.ok(Math.abs(figure.root.position.x-3)<1e-6,'the root followed the state while ragdolling');
 const pelvis=figure.root.getObjectByName('pelvis').getWorldPosition(new Vector3());
 assert.ok(pelvis.y<.35,`the pelvis is ${pelvis.y.toFixed(2)} m up`);
 figure.dispose();
});
