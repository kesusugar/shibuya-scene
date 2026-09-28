// Katana D: three cuts in a row -- the kesa (袈裟, down from high left to low right), a rising cut
// (逆袈裟, from low right, where the kesa leaves the blade, up to high left) and a level cut (横一文字,
// at chest height from the left across to the right, then zanshin) -- a press during one cut carries
// on to the next; the blow goes the way each blade goes; and the blade leaves a trail while live.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Group} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {SWORD,SWORD_GYAKU,SWORD_YOKO,KATANA_COMBO,swordBearing,swordHeight} from '../src/player/attack-timing.mjs';
import {createMeleeCombat,katanaSweep,PHASE} from '../src/player/combat.mjs';
import {humanoidCitizen} from '../src/player/character-asset.mjs';
import {createPlayerFigure} from '../src/player/figure.mjs';

test('Katana D: the three cuts are measured, in order, each going its own way',()=>{
 assert.deepEqual(KATANA_COMBO.map(c=>c.name),['SwordAttack','SwordGyaku','SwordYoko']);
 for(const c of KATANA_COMBO){
  assert.ok(c.windup<c.activeEnd&&c.activeEnd<c.duration,`${c.name}: window outside the clip`);
  assert.equal(c.heights.length,c.sweep.length,`${c.name}: a height per sweep sample`);
  assert.ok(c.tipReach>1.15,`${c.name}: the tip reaches ${c.tipReach} m, short of the warp's standoff`);
 }
 // The kesa: left to right, down. The rising cut: right to left, up. The level cut: left to right, level.
 assert.ok(SWORD.sweepFrom>0&&SWORD.sweepTo<0&&swordHeight(SWORD.windup)>swordHeight(SWORD.activeEnd)+1);
 assert.ok(SWORD_GYAKU.sweepFrom<0&&SWORD_GYAKU.sweepTo>0,'the rising cut does not go right to left');
 assert.ok(swordHeight(SWORD_GYAKU.activeEnd,SWORD_GYAKU)>swordHeight(SWORD_GYAKU.windup,SWORD_GYAKU)+.8,'the rising cut does not rise');
 assert.ok(SWORD_YOKO.sweepFrom>0&&SWORD_YOKO.sweepTo<0,'the level cut does not go left to right');
 const ys=SWORD_YOKO.heights;assert.ok(Math.max(...ys)-Math.min(...ys)<.35&&Math.min(...ys)>1.1&&Math.max(...ys)<1.8,`the level cut is not level at the chest: ${Math.min(...ys)}-${Math.max(...ys)} m`);
 // Each carries on from where the last leaves the blade: the kesa ends low on the right, the rising
 // cut starts there; the rising cut ends high on the left, the level cut starts on the left.
 assert.ok(swordBearing(SWORD.activeEnd)<0&&swordBearing(SWORD_GYAKU.windup,SWORD_GYAKU)<0);
 assert.ok(swordBearing(SWORD_GYAKU.activeEnd,SWORD_GYAKU)>0&&swordBearing(SWORD_YOKO.windup,SWORD_YOKO)>0);
 // The chain point: after the blade has passed, before any zanshin; only the last cut holds.
 assert.ok(SWORD.chainAt>SWORD.activeEnd&&SWORD.chainAt<SWORD.zanshin[0]);
 assert.ok(SWORD_GYAKU.chainAt>SWORD_GYAKU.activeEnd&&SWORD_GYAKU.chainAt<SWORD_GYAKU.duration);
 assert.ok(!SWORD_YOKO.chainAt&&SWORD_YOKO.zanshin[0]>SWORD_YOKO.activeEnd&&SWORD_YOKO.cancelAt<SWORD_YOKO.duration);
 // A person straight ahead is in every cut's path.
 for(const c of KATANA_COMBO)
  assert.equal(katanaSweep({x:0,z:0,heading:0},c.windup,c.activeEnd,{timing:c,people:[{id:1,x:0,z:1.1}]}).people.length,1,`${c.name} misses the person in front`);
});

const cell=(x,z)=>Math.floor(x/2)+','+Math.floor(z/2);
function street(people){
 const grid=new Map(),struck=[];
 const c={time:0,pool:people,grid,cell,network:{ctx:{safe:()=>true,height:()=>0}},struck,
  insert(p){const k=cell(p.x,p.z);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(p);},
  leave(){},strike(p,dx,dz,v,impulse){p.struck=0;struck.push({id:p.id,impulse});return true;},say(){},flee(){},vehicleOverlap:()=>false,blocked:()=>false};
 for(const p of people)c.insert(p);return c;
}
const npc=(id,x,z)=>({id,active:true,archetype:'adult',state:'walking',x,z,heading:Math.PI,speed:0,combatHealth:100});
const player=()=>{const state={x:0,z:0,heading:0,bodyHeading:0,speed:0,alive:true,health:100,attackTime:0,hurtTime:0,weapon:'katana'};
 return {state,startAttack(sec,name){state.attackTime=sec;state.attackDuration=sec;state.attackName=name;return true;}};};

test('Katana D: a press during a cut carries on to the next at its chain point; without one the cut holds and the combo starts over',()=>{
 const dt=1/60,melee=createMeleeCombat({weapon:()=>'katana'}),c=street([]),p=player(),names=[];
 const step=()=>{c.time+=dt;melee.update(dt,c,p);if(names.at(-1)!==p.state.attackName)names.push(p.state.attackName);};
 melee.request();step();
 // Pressed during the kesa's cut: the rising cut starts at the kesa's chain point, not before.
 while(melee.swing.elapsed<SWORD.activeEnd)step();melee.request();step();
 assert.equal(p.state.attackName,'SwordAttack');
 while(p.state.attackName==='SwordAttack')step();
 assert.equal(p.state.attackName,'SwordGyaku');assert.equal(melee.snapshot().step,1);
 // Pressed during the rising cut: the level cut.
 melee.request();step();while(p.state.attackName==='SwordGyaku')step();
 assert.equal(p.state.attackName,'SwordYoko');assert.equal(melee.snapshot().step,2);
 // The last cut: a press in it is dropped; it holds (zanshin) and ends.
 melee.request();step();
 while(melee.phase!==PHASE.IDLE)step();
 assert.deepEqual(names,['SwordAttack','SwordGyaku','SwordYoko']);
 assert.equal(melee.snapshot().chains,2);
 // The next press starts over with the kesa.
 melee.request();step();assert.equal(p.state.attackName,'SwordAttack');assert.equal(melee.snapshot().step,0);
 // Not pressed again: the kesa plays out with its zanshin, no rising cut.
 while(melee.phase!==PHASE.IDLE)step();
 assert.equal(melee.snapshot().chains,2,'a cut carried on without a press');
});

test('Katana D: each cut knocks its person the way its blade goes; a rising cut that kills lifts the body',()=>{
 const dt=1/60;
 const hit=(step)=>{
  const v=npc(7,0,1.1),c=street([v]),p=player(),melee=createMeleeCombat({weapon:()=>'katana'});
  // Walk the combo up to `step` on nobody, then cut the person in front.
  if(step>0){melee.request();c.time+=dt;melee.update(dt,c,p);v.active=false;
   for(let s=0;s<step;s++){while(melee.swing.elapsed<KATANA_COMBO[s].activeEnd){c.time+=dt;melee.update(dt,c,p);}melee.request();
    while(p.state.attackName===KATANA_COMBO[s].name){c.time+=dt;melee.update(dt,c,p);}}
   v.active=true;Object.assign(v,{x:p.state.x+Math.sin(p.state.attackHeading)*1.1,z:p.state.z+Math.cos(p.state.attackHeading)*1.1});
   c.grid.clear();c.insert(v);
  }else{melee.request();c.time+=dt;melee.update(dt,c,p);}
  const T=KATANA_COMBO[step];
  while(melee.swing&&melee.swing.elapsed<T.activeEnd+.05){c.time+=dt;melee.update(dt,c,p);}
  const h=p.state.attackHeading,right={x:-Math.cos(h),z:Math.sin(h)};
  return {v,c,side:v.hurtX*right.x+v.hurtZ*right.z,dir:melee.snapshot().lastCutDir};
 };
 const kesa=hit(0),gyaku=hit(1),yoko=hit(2);
 for(const [r,name] of [[kesa,'SwordAttack'],[gyaku,'SwordGyaku'],[yoko,'SwordYoko']])assert.equal(r.dir?.cut,name,`${name} did not land`);
 assert.ok(kesa.side>.3,'the kesa does not knock them to the right');
 assert.ok(gyaku.side<-.3,'the rising cut does not knock them to the left');
 assert.ok(yoko.side>.3,'the level cut does not knock them to the right');
 assert.notEqual(yoko.dir.zone,'legs','the level cut took them in the legs');
 // The kesa's 50 and the rising cut's 50: down, and lifted a little.
 const v=npc(8,0,1.1),c=street([v]),p=player(),melee=createMeleeCombat({weapon:()=>'katana'});v.combatHealth=50;
 melee.request();c.time+=dt;melee.update(dt,c,p);v.active=false;
 while(melee.swing.elapsed<SWORD.activeEnd){c.time+=dt;melee.update(dt,c,p);}melee.request();
 while(p.state.attackName==='SwordAttack'){c.time+=dt;melee.update(dt,c,p);}
 v.active=true;c.grid.clear();Object.assign(v,{x:Math.sin(p.state.attackHeading)*1.1,z:Math.cos(p.state.attackHeading)*1.1});c.insert(v);
 while(melee.swing&&melee.swing.elapsed<SWORD_GYAKU.activeEnd+.05){c.time+=dt;melee.update(dt,c,p);}
 const s=c.struck.find(x=>x.id===8);
 assert.ok(s&&s.impulse.y>0,'a rising cut that kills does not lift the body');
});

globalThis.ProgressEvent??=class{constructor(type,init={}){Object.assign(this,{type},init);}};
const REPORT=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
const BYTES=readFileSync('public/data/character/citizen.glb');
const humanoid=async()=>humanoidCitizen(await new Promise((res,rej)=>new GLTFLoader()
 .parse(BYTES.buffer.slice(BYTES.byteOffset,BYTES.byteOffset+BYTES.byteLength),'',res,rej)),REPORT);

test('Katana D: the three cuts are in the character, and each leaves a trail only while its blade is live',async()=>{
 const asset=await humanoid();
 for(const c of KATANA_COMBO)assert.ok(asset.clips?.some?.(x=>x.name===c.name)??true,`${c.name} is not in the character`);
 const scene=new Group(),figure=createPlayerFigure(asset,undefined,{weapons:['katana']});scene.add(figure.root);
 const dt=1/60,state={x:0,y:0,z:0,speed:0,heading:0,bodyHeading:0,alive:true,attackTime:0,weapon:'katana'};
 for(let i=0;i<30;i++)figure.update(state,dt);
 assert.equal(figure.trail.count,0);assert.equal(figure.trail.mesh.parent,scene,'the trail is not in the scene');
 for(const c of KATANA_COMBO){
  state.attackName=c.name;state.attackDuration=state.attackTime=c.duration;
  let most=0,before=0,after=Infinity;
  for(let t=0;t<c.duration;t+=dt){
   figure.update(state,dt);state.attackTime=Math.max(1e-3,state.attackTime-dt);
   const into=c.duration-state.attackTime;
   if(into<c.windup-.08)before=Math.max(before,figure.trail.count);
   if(into>c.activeEnd+.3)after=Math.min(after,figure.trail.count);
   most=Math.max(most,figure.trail.count);
  }
  assert.equal(before,0,`${c.name}: a trail before the cut`);
  assert.ok(most>=4,`${c.name}: the trail had ${most} samples`);
  if(after!==Infinity)assert.equal(after,0,`${c.name}: the trail outlived the cut`);
  state.attackTime=0;for(let i=0;i<20;i++)figure.update(state,dt);
  assert.equal(figure.trail.count,0,`${c.name}: the trail outlived the cut`);assert.equal(figure.trail.mesh.visible,false);
 }
 figure.dispose();assert.equal(figure.trail.mesh.parent,null);
});
