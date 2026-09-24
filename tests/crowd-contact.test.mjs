import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildGroundModel} from '../src/ground/model.mjs';
import {buildBuildingModel} from '../src/buildings/model.mjs';
import {buildStationModel} from '../src/station/model.mjs';
import {buildStreetscapeModel} from '../src/streetscape/model.mjs';
import {buildPedestrianNetwork} from '../src/life/network.mjs';
import {CrowdSimulation} from '../src/life/simulation.mjs';
import {createPlayer,PLAYER} from '../src/player/controller.mjs';
import {CONTACT,bodiesNear} from '../src/player/crowd-contact.mjs';

// The player bumps into people instead of walking through them. Staged on the real pedestrian
// network, with the crowd's own simulation moving the people, on a clear 5 m patch of pavement.
const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
const ground=buildGroundModel(data),generic=buildBuildingModel(data);
const core=buildStationModel(data,{ground,generic});
const street=buildStreetscapeModel(data,{tier:'high',ground,generic,core});
const network=buildPedestrianNetwork(data,{ground,generic,street,core});
const ctx=network.ctx;
const SPOT={x:-38,z:74};

/** A crowd with nobody in it but whoever the test puts there. */
function emptyCrowd(){
 const sim=new CrowdSimulation(network,{tier:'high'});
 for(const p of sim.pool)sim.despawn(p,'test');
 sim.setCamera(SPOT.x,SPOT.z);          // nobody is spawned within 12 m of the camera
 sim.refillClock=-1e9;                  // and nobody is refilled at all
 sim.rebuild();
 return sim;
}
/** Someone standing at x,z, the way an idle pedestrian stands. */
function person(sim,x,z,extra={}){
 const p=sim.pool.find(q=>!q.active);
 Object.assign(p,{active:true,choreographed:false,controlled:false,flee:null,fleeOffX:0,fleeOffZ:0,
  x,z,renderX:x,renderZ:z,previousX:x,previousZ:z,height:ctx.height(x,z),heading:0,
  mode:'idle',state:'idle',speed:0,age:0,pause:0,crossing:null,queueKey:null,
  combatDead:false,combatTarget:null,combatHealth:100,combatUntil:0,archetype:'casual',
  lod:'near',elapsed:0,edge:-1,route:[],bumpUntil:undefined,struck:undefined,...extra});
 sim.insert(p);return p;
}
function walker(sim,{x=SPOT.x,z=SPOT.z,heading=0}={}){
 const player=createPlayer(ctx,{start:[x,z],heading,bodies:sim?()=>sim:null});
 Object.assign(player.state,{x,z,y:ctx.height(x,z),heading,bodyHeading:heading,course:heading});
 return player;
}
/** One frame as the scene runs it: the player, then the crowd. */
function frame(player,sim,dt=1/60){player.step(dt);sim?.update(dt);}

test('the contact radii are the player\'s and a pedestrian\'s bodies',()=>{
 assert.equal(CONTACT.playerRadius,PLAYER.radius);
 assert.equal(CONTACT.gap,CONTACT.playerRadius+CONTACT.bodyRadius);
 assert.equal(CONTACT.knockDown,false);
});

test('1. walking into someone standing still: never closer than 0.55 m, and the player slides past',()=>{
 const sim=emptyCrowd();
 const other=person(sim,SPOT.x+.2,SPOT.z);
 const player=walker(sim,{z:SPOT.z-1.6,heading:0});
 player.setTouch({forward:1,strafe:0,running:false});
 let closest=Infinity;
 for(let i=0;i<180;i++){
  frame(player,sim);
  closest=Math.min(closest,Math.hypot(player.state.x-other.x,player.state.z-other.z));
 }
 assert.ok(closest>=.55,`centres came within ${closest.toFixed(3)} m`);
 assert.ok(player.state.z>other.z+.5,`the player is stuck behind them at z ${(player.state.z-other.z).toFixed(2)} m`);
 assert.ok(player.contact.stats.bumps>=1,'nobody was bumped');
 assert.ok(player.contact.stats.trappedSeconds<.5,`shoved for ${player.contact.stats.trappedSeconds}s past one person`);
});

test('1b. head-on into someone standing still: the player goes round, not through',()=>{
 const sim=emptyCrowd();
 const other=person(sim,SPOT.x,SPOT.z);
 const player=walker(sim,{z:SPOT.z-1.6,heading:0});
 player.setTouch({forward:1,strafe:0,running:false});
 let closest=Infinity;
 for(let i=0;i<180;i++){frame(player,sim);closest=Math.min(closest,Math.hypot(player.state.x-other.x,player.state.z-other.z));}
 assert.ok(closest>=.55,`centres came within ${closest.toFixed(3)} m`);
 assert.ok(player.state.z>other.z+.5,'never got past');
});

test('2. a full ring of people within 0.7 m does not trap the player',()=>{
 const sim=emptyCrowd();
 const ring=[];
 for(let i=0;i<8;i++){const a=i/8*Math.PI*2;ring.push(person(sim,SPOT.x+Math.sin(a)*.66,SPOT.z+Math.cos(a)*.66));}
 const player=walker(sim,{heading:.2});
 player.setTouch({forward:1,strafe:0,running:false});
 let out=null,closest=Infinity;
 for(let i=0;i<180&&out===null;i++){
  frame(player,sim);
  for(const p of ring)closest=Math.min(closest,Math.hypot(player.state.x-p.x,player.state.z-p.z));
  const d=Math.hypot(player.state.x-SPOT.x,player.state.z-SPOT.z);
  if(d>.66+CONTACT.gap)out=(i+1)/60;
 }
 assert.ok(out!==null,'still inside the ring after 3 s');
 // Out by going through the gap the ring opened, not through a body.
 assert.ok(closest>=.5,`passed within ${closest.toFixed(3)} m of someone on the way out`);
 const pace=(.66+CONTACT.gap)/out;
 assert.ok(pace>=.3,`got out at ${pace.toFixed(2)} m/s`);
});

test('4. someone on another level does not block',()=>{
 const run=(lift)=>{
  const sim=emptyCrowd();
  const other=person(sim,SPOT.x,SPOT.z,{height:ctx.height(SPOT.x,SPOT.z)+lift});
  const player=walker(sim,{z:SPOT.z-1.2,heading:0});
  player.setTouch({forward:1,strafe:0,running:false});
  let closest=Infinity;
  for(let i=0;i<120;i++){frame(player,sim);closest=Math.min(closest,Math.hypot(player.state.x-other.x,player.state.z-other.z));}
  return {closest,x:player.state.x,z:player.state.z};
 };
 const above=run(CONTACT.level+.3),below=run(-(CONTACT.level+.3)),same=run(0);
 assert.ok(above.closest<.1,`a person ${CONTACT.level+.3} m above pushed the player to ${above.closest.toFixed(2)} m`);
 assert.ok(below.closest<.1,'a person below blocked');
 assert.ok(same.closest>=.55,'the control case, on the same level, did not block');
});

test('7. with no crowd, movement is exactly what it was',()=>{
 const wall={height:()=>0,solid:(x,z)=>z>2.5||x<-1.8,safe:()=>true,onRoad:()=>false};
 const script=f=>f<50?{forward:1,strafe:0}:f<110?{forward:1,strafe:-1,running:true}:f<150?{forward:0,strafe:1}:{forward:0,strafe:0};
 const trace=player=>{const out=[];for(let f=0;f<200;f++){player.setTouch(script(f));player.step(1/60);out.push([player.state.x,player.state.z,player.state.speed,player.state.bodyHeading]);}return out;};
 const plain=createPlayer(wall,{start:[0,0],heading:0});plain.place(0,0,0);
 const hooked=createPlayer(wall,{start:[0,0],heading:0,bodies:()=>null});hooked.place(0,0,0);
 const nobody=emptyCrowd();
 const empty=createPlayer(wall,{start:[0,0],heading:0,bodies:()=>nobody});empty.place(0,0,0);
 const a=trace(plain),b=trace(hooked),c=trace(empty);
 assert.deepEqual(b,a,'a hook that returns no crowd changed the walk');
 assert.deepEqual(c,a,'a crowd with nobody near changed the walk');
});

test('bodiesNear reads only the 3x3 cells round the player and skips who it should',()=>{
 const sim=emptyCrowd();
 const near=person(sim,SPOT.x+.5,SPOT.z);
 person(sim,SPOT.x+.5,SPOT.z+.3,{struck:0});
 person(sim,SPOT.x-.5,SPOT.z,{combatDead:true});
 person(sim,SPOT.x,SPOT.z+.5,{controlled:true});
 person(sim,SPOT.x+7,SPOT.z);
 sim.rebuild();
 const out=[];
 bodiesNear(sim,SPOT.x,SPOT.z,ctx.height(SPOT.x,SPOT.z),1.4,out);
 assert.deepEqual(out.map(p=>p.id),[near.id]);
 const again=out;bodiesNear(sim,SPOT.x,SPOT.z,0,1.4,out);
 assert.equal(out,again,'the buffer was reallocated');
});

test('anyone close enough to touch the player is on the every-frame (near) update',()=>{
 const sim=emptyCrowd();
 const p=person(sim,SPOT.x+.6,SPOT.z,{lod:'far'});
 sim.setCamera(SPOT.x,SPOT.z);
 for(let i=0;i<40;i++)sim.step(1/30);
 assert.equal(p.lod,'near');
});
