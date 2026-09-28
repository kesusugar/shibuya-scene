// Katana A: the katana worn at the left hip, put back after a while with no cut (noto), and drawn
// out of the scabbard as it cuts (iai) -- the blow's timing untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {humanoidCitizen} from '../src/player/character-asset.mjs';
import {createPlayerFigure,carriedWeapon} from '../src/player/figure.mjs';
import {createMeleeCombat,COMBAT,PHASE} from '../src/player/combat.mjs';
import {SWORD} from '../src/player/attack-timing.mjs';
import {DRAW} from '../src/player/weapons.mjs';

globalThis.ProgressEvent??=class{constructor(type,init={}){Object.assign(this,{type},init);}};
const REPORT=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
const BYTES=readFileSync('public/data/character/citizen.glb');
let cached=null;
const humanoid=async()=>cached??=humanoidCitizen(await new Promise((res,rej)=>new GLTFLoader()
 .parse(BYTES.buffer.slice(BYTES.byteOffset,BYTES.byteOffset+BYTES.byteLength),'',res,rej)),REPORT);

const crowd=()=>({time:0,network:{ctx:{safe:()=>true,height:()=>0}},grid:new Map(),cell:(x,z)=>Math.floor(x/2)+','+Math.floor(z/2),
 insert(){},leave(){},strike(){return true;},say(){return true;},vehicleOverlap:()=>false,blocked:()=>false});
const player=()=>{const state={x:0,z:0,heading:0,bodyHeading:0,alive:true,health:100,attackTime:0,hurtTime:0,weapon:'katana'};
 return {state,startAttack(sec){state.attackTime=Math.max(state.attackTime,sec);return true;}};};

test('Katana A: after notoAfter s with no cut the katana is sheathed; the next cut draws it (iai) with the same timing',()=>{
 let weapon='katana';const melee=createMeleeCombat({weapon:()=>weapon}),c=crowd(),pl=player(),dt=1/30;
 for(let t=0;t<COMBAT.notoAfter-.3;t+=dt)melee.update(dt,c,pl);
 assert.ok(!pl.state.katanaSheathed,'sheathed too early');
 for(let t=0;t<.5;t+=dt)melee.update(dt,c,pl);
 assert.equal(pl.state.katanaSheathed,true,'not sheathed after notoAfter');
 assert.equal(carriedWeapon(pl.state),'fists','a sheathed katana is carried, the hands empty');
 // The cut from the scabbard.
 melee.request();melee.update(dt,c,pl);
 assert.equal(pl.state.katanaSheathed,false);assert.equal(pl.state.drawCut,true,'not marked as a draw-cut');
 assert.equal(melee.snapshot().iai,1);
 let firstActive=null,t=dt;
 while(melee.phase!==PHASE.IDLE&&t<3){melee.update(dt,c,pl);t+=dt;if(firstActive===null&&melee.phase===PHASE.ACTIVE)firstActive=t;
  if(melee.phase!==PHASE.WINDUP)assert.equal(pl.state.drawCut,false,'the draw outlived the wind-up');}
 assert.ok(Math.abs(firstActive-SWORD.windup)<.05,`the blade went live at ${firstActive.toFixed(2)} s, not the cut's own ${SWORD.windup}`);
 // A second cut straight after is an ordinary one.
 melee.request();melee.update(dt,c,pl);assert.equal(pl.state.drawCut,false);assert.equal(melee.snapshot().iai,1);
 // Another weapon (or picking the katana again) starts it drawn.
 pl.state.katanaSheathed=true;weapon='pistol';melee.update(dt,c,pl);assert.equal(pl.state.katanaSheathed,false);
});

test('Katana A: sheathed, the katana is shown at the hip; the draw-cut puts it in the hand within the reach, the left hand on the scabbard',async()=>{
 const figure=createPlayerFigure(await humanoid(),undefined,{weapons:['pistol','katana']});
 const state={x:0,y:0,z:0,speed:0,heading:0,bodyHeading:0,alive:true,attackTime:0,weapon:'katana'};
 const get=n=>figure.root.getObjectByName(n),dt=1/60;
 for(let i=0;i<60;i++)figure.update(state,dt);
 assert.ok(get('weapon-katana').visible&&!get('weapon-sheathed').visible,'the drawn katana is not in the hand');
 // Put back: the hand takes it to the hip, then it is carried there.
 state.katanaSheathed=true;
 for(let t=0;t<DRAW.holster+DRAW.noto+.1;t+=dt)figure.update(state,dt);
 assert.ok(!get('weapon-katana').visible&&get('weapon-sheathed').visible,'the katana did not go back into the scabbard');
 // The draw-cut: the cut's clip and the draw at once.
 state.katanaSheathed=false;state.drawCut=true;state.attackTime=SWORD.duration;state.attackName='SwordAttack';
 const mouth=new Vector3(),palm=new Vector3(),hand=get('hand_l');let closest=Infinity,drawnAt=null;
 for(let t=0;t<DRAW.iaiReach+DRAW.iaiDraw+.1;t+=dt){
  figure.update(state,dt);figure.root.updateMatrixWorld(true);
  if(drawnAt===null&&get('weapon-katana').visible)drawnAt=t;
  if(t<DRAW.iaiReach+.05){get('weapon-saya').visible?get('weapon-saya').localToWorld(mouth.set(0,0,DRAW.iaiMouth)):get('weapon-sheathed').localToWorld(mouth.set(0,0,DRAW.iaiMouth));
   hand.getWorldPosition(palm);closest=Math.min(closest,palm.distanceTo(mouth));}
 }
 assert.ok(drawnAt!==null&&drawnAt<=DRAW.iaiReach+2*dt,`the blade was in the hand at ${drawnAt} s, not by ${DRAW.iaiReach} s`);
 assert.ok(closest<.16,`the left hand came no nearer the scabbard's mouth than ${closest.toFixed(2)} m`);
 figure.dispose();
});

test('Katana A: walking and running, the scabbard at the hip stays clear of the left thigh',async()=>{
 const figure=createPlayerFigure(await humanoid(),undefined,{weapons:['pistol','katana']});
 const get=n=>figure.root.getObjectByName(n),a=new Vector3(),b=new Vector3(),k0=new Vector3(),k1=new Vector3();
 const segDist=(p0,p1,q0,q1)=>{let best=Infinity;for(let i=0;i<=12;i++){const p=p0.clone().lerp(p1,i/12);for(let j=0;j<=12;j++)best=Math.min(best,p.distanceTo(q0.clone().lerp(q1,j/12)));}return best;};
 for(const speed of [1.4,4.5]){
  const state={x:0,y:0,z:0,speed,heading:0,bodyHeading:0,alive:true,attackTime:0,weapon:'fists'};
  let min=Infinity;
  for(let i=0;i<120;i++){state.z+=speed/60;figure.update(state,1/60);figure.root.updateMatrixWorld(true);
   const s=get('weapon-sheathed');s.localToWorld(a.set(0,0,.25));s.localToWorld(b.set(0,0,.72));
   get('thigh_l').getWorldPosition(k0);get('calf_l').getWorldPosition(k1);
   if(i>30)min=Math.min(min,segDist(a,b,k0,k1));}
  assert.ok(min>.07,`at ${speed} m/s the scabbard came within ${min.toFixed(3)} m of the left thigh's bone`);
 }
 figure.dispose();
});

test('Katana A: the slung submachine gun is not drawn on the back (the long black plank); the draw still fetches it from there',async()=>{
 const figure=createPlayerFigure(await humanoid(),undefined,{weapons:['pistol','katana','smg']});
 const state={x:0,y:0,z:0,speed:0,heading:0,bodyHeading:0,alive:true,attackTime:0,weapon:'fists'};
 for(let i=0;i<10;i++)figure.update(state,1/30);
 const slung=figure.root.getObjectsByProperty('name','weapon-smg').find(m=>m.parent.name==='spine_03');
 assert.ok(slung&&!slung.visible,'the slung submachine gun is drawn on the back');
 assert.ok(figure.weapons.stowPoint('smg',new Vector3()),'the hand has nowhere to fetch it from');
 assert.ok(figure.root.getObjectByName('weapon-sheathed').visible,'the katana is not shown at the hip');
 figure.dispose();
});
