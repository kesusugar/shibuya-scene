// Katana C: the whole body in the cut (the front foot steps in and lands with it, the hips go
// forward and down, the hips lead the chest, the eyes stay on the person) and zanshin (the blade
// held low after it), then the way back to guard, which may be cut short once the hold is over.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {bodyMechanics} from '../qa/gta-upgrade/katana-body.mjs';
import {SWORD,WARP} from '../src/player/attack-timing.mjs';
import {WEAPONS} from '../src/player/weapons.mjs';
import {createMeleeCombat,PHASE} from '../src/player/combat.mjs';
import {createPlayer} from '../src/player/controller.mjs';
import {humanoidCitizen} from '../src/player/character-asset.mjs';
import {createPlayerFigure} from '../src/player/figure.mjs';

globalThis.ProgressEvent??=class{constructor(type,init={}){Object.assign(this,{type},init);}};
let body=null;
const mechanics=async()=>body??=await bodyMechanics('assets/character/cmu-weapons/katana-cut.json');

test('Katana C: the hips lead the chest into the cut, and the tip is fastest inside the cut window',async()=>{
 const m=await mechanics();
 assert.ok(m.hipsLead.leadMs>=60,`the hips turn fastest only ${m.hipsLead.leadMs} ms before the chest`);
 assert.ok(m.tipPeak.t>=SWORD.windup&&m.tipPeak.t<=SWORD.activeEnd,`the tip peaks at ${m.tipPeak.t} s, outside ${SWORD.windup}-${SWORD.activeEnd}`);
 assert.ok(m.tipPeak.ms>=15,`the tip peaks at only ${m.tipPeak.ms} m/s`);
});

test('Katana C: the front foot steps in, the hips go forward and down onto it, no planted foot skates',async()=>{
 const m=await mechanics();
 assert.ok(m.frontFootForwardCm>=20,`the front foot steps in only ${m.frontFootForwardCm} cm`);
 assert.ok(m.hipDropCm>=5,`the hips drop only ${m.hipDropCm} cm`);
 assert.ok(m.hipTravelCm>=12,`the hips go forward only ${m.hipTravelCm} cm`);
 for(const side of ['left','right'])assert.ok(m.footSlideCm[side]<=5,`the ${side} foot slides ${m.footSlideCm[side]} cm while planted`);
 // The step lands with the cut: the front foot is down (within 2 cm of its lowest) at the tip's peak.
 const low=Math.min(...m.rows.map(r=>r.ballR.y)),atPeak=m.rows.reduce((a,r)=>Math.abs(r.t-m.tipPeak.t)<Math.abs(a.t-m.tipPeak.t)?r:a);
 assert.ok(atPeak.ballR.y<low+.02,`the front foot is ${((atPeak.ballR.y-low)*100).toFixed(1)} cm up as the blade cuts`);
 // And back to guard by the end: the feet and hips where they started.
 const [a,z]=[m.rows[0],m.rows.at(-1)];
 assert.ok(a.ballR.distanceTo(z.ballR)<.05&&a.ballL.distanceTo(z.ballL)<.05,'the feet did not come back to guard');
 assert.ok(Math.hypot(a.hip.x-z.hip.x,a.hip.z-z.hip.z)<.05,'the hips did not come back');
});

test('Katana C: the eyes stay on the person through the coil, the cut and the hold',async()=>{
 const m=await mechanics();
 assert.ok(Math.max(...m.yawRange.head.map(Math.abs))<=8,`the head turns ${m.yawRange.head} degrees`);
 // While the chest winds 40 degrees and more each way.
 assert.ok(m.yawRange.chest[1]-m.yawRange.chest[0]>=80,'the chest no longer winds');
});

test('Katana C: zanshin -- the blade held low and still after the cut, then the return',async()=>{
 const m=await mechanics();
 assert.ok(m.holdS>=.3,`the blade is held still for only ${m.holdS} s`);
 const [h0,h1]=SWORD.zanshin;
 assert.ok(h0>SWORD.activeEnd&&h1>h0&&h1<SWORD.duration,'the hold is not between the cut and the end');
 assert.equal(SWORD.cancelAt,h1);
 const inHold=m.rows.filter(r=>r.t>h0+.03&&r.t<h1-.03);
 assert.ok(inHold.length&&inHold.every(r=>r.tipSpeed<1.2),'the blade moves through the hold');
 // Held low: the tip below the hips.
 assert.ok(inHold.every(r=>r.tip.y<r.hip.y),'the blade is not held low');
 // The blade reaches further with the step in, and the reach constant follows it.
 assert.ok(SWORD.tipReach>1.5&&WEAPONS.katana.reach>=SWORD.tipReach+.25,`reach ${WEAPONS.katana.reach} for a tip at ${SWORD.tipReach}`);
 assert.ok(WARP.to<SWORD.windup,'the warp still ends before the blade is live');
});

const flat={solid:()=>false,safe:()=>true,height:()=>0,onRoad:()=>false};
const cell=(x,z)=>Math.floor(x/2)+','+Math.floor(z/2);
const emptyStreet=()=>({time:0,pool:[],grid:new Map(),cell,network:{ctx:{safe:()=>true,height:()=>0}},
 insert(){},leave(){},strike(){return true;},say(){},flee(){},vehicleOverlap:()=>false,blocked:()=>false});

test('Katana C: in the hold a press is dropped; after it, the next cut starts at once, or walking off ends the return',()=>{
 const dt=1/60;
 const run=(until,pl,melee,crowd)=>{while(melee.swing&&melee.swing.elapsed<until){pl.step(dt);melee.update(dt,crowd,pl);}};
 {// A press during the hold does nothing.
  const pl=createPlayer(flat,{start:[0,0],heading:0,bodies:null}),melee=createMeleeCombat({weapon:()=>'katana'}),crowd=emptyStreet();
  melee.request();melee.update(dt,crowd,pl);const id=melee.swing.id;
  run(SWORD.zanshin[0]+.1,pl,melee,crowd);assert.equal(melee.phase,PHASE.RECOVERY);
  melee.request();melee.update(dt,crowd,pl);assert.equal(melee.swing.id,id,'a press in the hold started a cut');
  assert.equal(pl.state.attackCancel,false);
 }
 {// After the hold, the next cut starts at once.
  const pl=createPlayer(flat,{start:[0,0],heading:0,bodies:null}),melee=createMeleeCombat({weapon:()=>'katana'}),crowd=emptyStreet();
  melee.request();melee.update(dt,crowd,pl);const id=melee.swing.id;
  run(SWORD.cancelAt+.02,pl,melee,crowd);assert.equal(pl.state.attackCancel,true);
  melee.request();melee.update(dt,crowd,pl);
  assert.notEqual(melee.swing.id,id,'the next cut waited for the return');assert.equal(melee.phase,PHASE.WINDUP);
  assert.equal(melee.snapshot().misses,1,'the cut short cut was not counted');
 }
 {// After the hold, walking off ends the return and the body walks.
  const pl=createPlayer(flat,{start:[0,0],heading:0,bodies:null}),melee=createMeleeCombat({weapon:()=>'katana'}),crowd=emptyStreet();
  melee.request();melee.update(dt,crowd,pl);
  run(SWORD.cancelAt+.02,pl,melee,crowd);
  pl.setTouch({forward:1});
  for(let i=0;i<30;i++){pl.step(dt);melee.update(dt,crowd,pl);}
  assert.equal(melee.phase,PHASE.IDLE,'walking off did not end the return');
  assert.ok(pl.state.z>.05,'the body did not walk');
 }
 {// Before the hold, walking does not.
  const pl=createPlayer(flat,{start:[0,0],heading:0,bodies:null}),melee=createMeleeCombat({weapon:()=>'katana'}),crowd=emptyStreet();
  melee.request();melee.update(dt,crowd,pl);pl.setTouch({forward:1});
  run(SWORD.zanshin[1]-.05,pl,melee,crowd);
  assert.notEqual(melee.phase,PHASE.IDLE);assert.ok(Math.abs(pl.state.z)<.01,'the body walked out of the cut');
 }
});

const REPORT=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
const BYTES=readFileSync('public/data/character/citizen.glb');
const humanoid=async()=>humanoidCitizen(await new Promise((res,rej)=>new GLTFLoader()
 .parse(BYTES.buffer.slice(BYTES.byteOffset,BYTES.byteOffset+BYTES.byteLength),'',res,rej)),REPORT);

test('Katana C: a cut started over the last one\'s return blends out of it rather than jumping to the first key',async()=>{
 const figure=createPlayerFigure(await humanoid(),undefined,{weapons:['katana']}),dt=1/60;
 const state={x:0,y:0,z:0,speed:0,heading:0,bodyHeading:0,alive:true,attackTime:0,weapon:'katana'};
 for(let i=0;i<30;i++)figure.update(state,dt);
 const hand=figure.root.getObjectByName('hand_r'),v=new Vector3(),prev=new Vector3();
 const cut=()=>{state.attackTime=state.attackDuration=SWORD.duration;state.attackName='SwordAttack';};
 cut();
 while(SWORD.duration-state.attackTime<SWORD.cancelAt+.02){state.attackTime-=dt;figure.update(state,dt);}
 figure.root.updateMatrixWorld(true);hand.getWorldPosition(prev);
 cut();state.attackTime-=dt;figure.update(state,dt);figure.root.updateMatrixWorld(true);hand.getWorldPosition(v);
 const jump=v.distanceTo(prev);
 // One frame of the cut itself moves the hand at most ~8 cm at this point; a jump to the first
 // key would be tens of centimetres.
 assert.ok(jump<.12,`the hand jumped ${(jump*100).toFixed(0)} cm in one frame`);
 figure.dispose();
});
