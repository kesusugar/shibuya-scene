// Katana B: the cut closes the distance to its person through the wind-up (a motion warp moved by
// the controller, the one authority over position), and the body winds round onto them eased.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createMeleeCombat,WARP,PHASE} from '../src/player/combat.mjs';
import {SWORD,warpFraction,smootherstep} from '../src/player/attack-timing.mjs';
import {createPlayer} from '../src/player/controller.mjs';
import {createBodyFacing} from '../src/player/locomotion.mjs';
import {STRIKE} from '../src/player/figure.mjs';

const flat=(solid=()=>false)=>({solid,safe:()=>true,height:()=>0,onRoad:()=>false});
const cell=(x,z)=>Math.floor(x/2)+','+Math.floor(z/2);
function street(people){
 const grid=new Map();
 const crowd={time:0,pool:people,network:{ctx:{safe:()=>true,height:()=>0}},grid,cell,
  insert(p){const k=cell(p.x,p.z);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(p);},
  leave(){},strike(p){p.struck=0;return true;},say(){return true;},flee(){},vehicleOverlap:()=>false,blocked:()=>false};
 for(const p of people)crowd.insert(p);
 return crowd;
}
const person=(id,x,z)=>({id,x,z,active:true,archetype:'adult',state:'walking'});

/** One cut at `who` from the origin facing +z; returns the player, the combat and the path. */
function cutAt(who,{weapon='katana',dt=1/60,solid}={}){
 const pl=createPlayer(flat(solid),{start:[0,0],heading:0,bodies:null});pl.state.weapon=weapon;
 const crowd=street(who),melee=createMeleeCombat({weapon:()=>weapon});
 melee.request();melee.update(dt,crowd,pl);
 const path=[];let t=0;
 while(melee.phase!==PHASE.IDLE&&t<3){pl.step(dt);crowd.time+=dt;melee.update(dt,crowd,pl);t+=dt;path.push({t,x:pl.state.x,z:pl.state.z,phase:melee.phase,d:Math.hypot(who[0].x-pl.state.x,who[0].z-pl.state.z)});}
 return {pl,melee,path,crowd};
}

test('Katana B: the warp curve is a smootherstep inside the wind-up, the same at any frame rate',()=>{
 assert.equal(smootherstep(0),0);assert.equal(smootherstep(1),1);assert.equal(smootherstep(.5),.5);
 assert.ok(WARP.from>=0&&WARP.to<SWORD.windup,'the step must be over before the blade goes live');
 assert.ok(WARP.standoff<SWORD.tipReach,'stopping beyond the tip would cut the air in front of them');
 for(const rate of [1,1.12]){
  for(const dt of [1/30,1/60,1/144]){
   let left=1;for(let t=0;t<SWORD.windup;t+=dt)left*=1-warpFraction(t,t+dt,rate);
   assert.ok(left<1e-9,`at ${(1/dt).toFixed(0)} fps x${rate} ${left} of the step was left`);
  }
  assert.equal(warpFraction(0,WARP.from/rate*.9,rate),0,'the body moved before the turn had its start');
 }
});

test('Katana B: a cut at someone 3 m off steps in and cuts them; the step ends before the blade is live',()=>{
 const target=person(1,0,3);
 const {pl,melee,path}=cutAt([target]);
 const i=path.findIndex(s=>s.phase!==PHASE.WINDUP),live=path[i],at=path[i-1].d;
 assert.ok(Math.abs(at-WARP.standoff)<.05,`the blade went live ${at.toFixed(2)} m from them, not ${WARP.standoff}`);
 assert.equal(melee.snapshot().cuts,1,'the cut did not reach them');
 assert.equal(melee.snapshot().warps,1);
 // Nothing moves after the wind-up: the feet are planted for the cut itself.
 const after=path.filter(s=>s.t>SWORD.windup+.02);
 for(const s of after)assert.ok(Math.hypot(s.x-live.x,s.z-live.z)<.02,'the body kept travelling through the cut');
 // It starts gently and ends gently: no frame carries more than ~12 m/s, and the first and last
 // frames of travel are slow.
 let peak=0;for(let i=1;i<path.length;i++)peak=Math.max(peak,Math.hypot(path[i].x-path[i-1].x,path[i].z-path[i-1].z)*60);
 assert.ok(peak<12,`the step peaked at ${peak.toFixed(1)} m/s`);
 assert.equal(pl.state.attackWarp,null,'the warp outlived the swing');
});

test('Katana B: nobody close is stepped to or away from; nobody out of range is locked; fists never step',()=>{
 {const {path}=cutAt([person(1,0,1)]);const e=path.at(-1);assert.ok(Math.hypot(e.x,e.z)<.01,'stepped at someone already within the sword');}
 {const {path,melee}=cutAt([person(1,0,WARP.range+.3)]);const e=path.at(-1);
  assert.ok(Math.hypot(e.x,e.z)<.01,'stepped at someone out of range');assert.equal(melee.snapshot().warps??0,0);}
 {const {path}=cutAt([person(1,0,2)],{weapon:'fists'});const e=path.at(-1);assert.ok(Math.hypot(e.x,e.z)<.01,'a punch stepped');}
});

test('Katana B: the step goes through the controller, so a wall stops it',()=>{
 const wall=(x,z)=>z>.8;
 const {path}=cutAt([person(1,0,3)],{solid:wall});
 assert.ok(path.every(s=>s.z<=.8),'the warp went through a wall');
});

test('Katana B: someone stepping aside during the wind-up is still arrived at',()=>{
 const target=person(1,0,3),dt=1/60;
 const pl=createPlayer(flat(),{start:[0,0],heading:0,bodies:null});pl.state.weapon='katana';
 const crowd=street([target]),melee=createMeleeCombat({weapon:()=>'katana'});
 melee.request();melee.update(dt,crowd,pl);
 let t=0;while(melee.phase===PHASE.WINDUP&&t<2){target.x+=.8*dt;pl.step(dt);melee.update(dt,crowd,pl);t+=dt;}
 const d=Math.hypot(target.x-pl.state.x,target.z-pl.state.z);
 assert.ok(d<WARP.standoff+.15,`the blade went live ${d.toFixed(2)} m from them`);
});

test('Katana B: the cut turns the body eased -- it builds speed, then settles without overshoot',()=>{
 const f=createBodyFacing(0),dt=1/60,goal=1.2,rates=[];let prev=0;
 for(let i=0;i<30;i++){f.update(goal,0,dt,STRIKE.cutTurn);rates.push((f.heading-prev)/dt);prev=f.heading;
  assert.ok(f.heading<=goal+1e-9,'the turn went past its person');}
 assert.ok(rates[0]<rates[3],'the turn started at full speed (a snap)');
 const top=Math.max(...rates),i=rates.indexOf(top);
 assert.ok(rates.slice(i+1).some(r=>r<top*.6&&r>0),'the turn did not slow as it arrived');
 assert.ok(Math.abs(f.heading-goal)<1e-6,'not square to them after half a second');
 // Square before the step is half done, so the body travels facing them.
 const g=createBodyFacing(0);let t=0;while(Math.abs(g.heading-goal)>.05)g.update(goal,0,dt,STRIKE.cutTurn),t+=dt;
 assert.ok(t<(WARP.from+WARP.to)/2,`square after ${t.toFixed(2)} s`);
});
