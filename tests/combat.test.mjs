import test from 'node:test';
import assert from 'node:assert/strict';
import {createMeleeCombat,COMBAT,PHASE} from '../src/player/combat.mjs';
import {ATTACKS,attackOf,activeWindow} from '../src/player/attack-timing.mjs';

/** The parts of the crowd simulation combat actually touches. */
function crowd(people=[]){
 const log={left:[],struck:[],said:[]};
 const c={
  time:0,log,
  network:{ctx:{safe:()=>true,height:()=>0}},
  grid:new Map(),
  cell:(x,z)=>Math.floor(x/2)+','+Math.floor(z/2),
  insert(p){const k=c.cell(p.x,p.z);if(!c.grid.has(k))c.grid.set(k,[]);c.grid.get(k).push(p);},
  leave(p){log.left.push(p.id);p.crossing=null;p.queueKey=null;},
  strike(p,dx,dz,speed){log.struck.push({id:p.id,dx,dz,speed});c.leave(p);p.struck=0;return true;},
  say(p,kind,urgency){log.said.push({id:p.id,kind,urgency});return true;},
  vehicleOverlap:()=>false,blocked:()=>false
 };
 for(const p of people)c.insert(p);
 return c;
}
const npc=(id,x,z,extra={})=>({id,active:true,controlled:false,choreographed:false,
 archetype:'adult',state:'walking',x,z,renderX:x,renderZ:z,heading:0,speed:1.2,
 crossing:null,queueKey:null,combatHealth:100,combatTarget:null,combatUntil:0,
 combatNext:0,combatAction:0,combatDead:false,...extra});
/** A player facing +z at the origin. */
const player=()=>{
 const state={x:0,z:0,heading:0,bodyHeading:0,alive:true,health:100,attackTime:0,hurtTime:0};
 return {state,startAttack(sec){state.attackTime=Math.max(state.attackTime,sec);return true;},
  hurt(amount){if(!state.alive||state.hurtTime>0)return false;
   state.health=Math.max(0,state.health-amount);state.hurtTime=.34;
   if(state.health<=0)state.alive=false;return true;}};
};
/** Run the fight forward, advancing the crowd clock as the simulation does. */
function run(melee,c,p,seconds,dt=1/60){
 for(let t=0;t<seconds;t+=dt){c.time+=dt;melee.update(dt,c,p);}
}

test('the measured timings are a real window inside each clip',()=>{
 assert.ok(ATTACKS.length>=2,'a one-two needs two clips');
 for(const a of ATTACKS){
  assert.ok(a.windup>0,`${a.name} lands on frame zero`);
  assert.ok(a.activeEnd>a.windup,`${a.name} has no active window`);
  assert.ok(a.duration>a.activeEnd,`${a.name} has no recovery`);
  assert.ok(a.peak>=a.windup&&a.peak<=a.activeEnd,
   `${a.name}: the fist peaks at ${a.peak}s, outside its own active window`);
  const w=activeWindow(a);
  assert.ok(w.from>0.1&&w.to<0.95,`${a.name}: active window ${w.from}-${w.to} spans the clip`);
 }
 // The two clips must use different hands, or a one-two is the same arm twice.
 assert.notEqual(ATTACKS[0].hand,ATTACKS[1].hand);
});

test('DAMAGE DOES NOT HAPPEN ON THE INPUT TICK',()=>{
 // The bug this run exists for: `request()` used to subtract health in the same update.
 const target=npc(1,0,1.0);
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 melee.request();
 melee.update(1/60,c,p);
 assert.equal(target.combatHealth,100,'health changed on the tick the button was pressed');
 assert.equal(melee.phase,PHASE.WINDUP,`expected WINDUP, got ${melee.phase}`);
 assert.equal(melee.snapshot().hits,0);
});

test('nothing is damaged during the wind-up',()=>{
 const target=npc(1,0,1.0);
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 const timing=attackOf(ATTACKS[0].name);
 melee.request();
 // Stop one frame short of the active window.
 run(melee,c,p,timing.windup-1/60);
 assert.equal(melee.phase,PHASE.WINDUP);
 assert.equal(target.combatHealth,100,`health fell during wind-up`);
});

test('damage lands inside the active window',()=>{
 const target=npc(1,0,1.0);
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 const timing=attackOf(ATTACKS[0].name);
 melee.request();
 run(melee,c,p,timing.activeEnd);
 assert.equal(target.combatHealth,100-COMBAT.playerDamage,
  `expected ${100-COMBAT.playerDamage} health, got ${target.combatHealth}`);
 assert.equal(melee.snapshot().hits,1);
});

test('one swing damages at most once, however long the window is',()=>{
 const target=npc(1,0,1.0);
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 melee.request();
 run(melee,c,p,3);                                  // well past the whole clip
 assert.equal(target.combatHealth,100-COMBAT.playerDamage,
  'a single swing applied damage more than once');
 assert.equal(melee.snapshot().hits,1);
});

test('a press during recovery does not start a second swing',()=>{
 const target=npc(1,0,1.0);
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 melee.request();
 const timing=attackOf(ATTACKS[0].name);
 run(melee,c,p,timing.activeEnd+1/60);
 assert.equal(melee.phase,PHASE.RECOVERY);
 const swingId=melee.swing.id;
 melee.request();
 melee.update(1/60,c,p);
 assert.equal(melee.swing.id,swingId,'a new swing started during recovery');
 assert.equal(melee.snapshot().swings,1);
});

test('a punch at nobody misses',()=>{
 const c=crowd([]),p=player(),melee=createMeleeCombat();
 melee.request();
 run(melee,c,p,2);
 const s=melee.snapshot();
 assert.equal(s.hits,0);
 assert.equal(s.misses,1,'an air punch was not recorded as a miss');
 assert.equal(melee.phase,PHASE.IDLE);
});

test('someone out of range misses',()=>{
 const target=npc(1,0,COMBAT.range+1.5);
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 melee.request();
 run(melee,c,p,2);
 assert.equal(target.combatHealth,100);
 assert.equal(melee.snapshot().misses,1);
});

test('someone behind the player misses',()=>{
 // Directly behind, well inside range. A punch is an arc, not a radius.
 const target=npc(1,0,-1.0);
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 melee.request();
 run(melee,c,p,2);
 assert.equal(target.combatHealth,100,'a punch connected with somebody behind the player');
 assert.equal(melee.snapshot().misses,1);
});

test('a target who walks away during the wind-up is missed',()=>{
 // This is the case the old code could not express at all: in range at the press, gone by
 // the time the fist arrives.
 const target=npc(1,0,1.0);
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 const timing=attackOf(ATTACKS[0].name);
 melee.request();
 run(melee,c,p,timing.windup*.5);
 assert.equal(target.combatHealth,100,'hit before the fist was out');
 // They leave while the arm is still coming back.
 const bucket=c.grid.get(c.cell(target.x,target.z));
 bucket.splice(bucket.indexOf(target),1);
 target.z=COMBAT.range+4;c.insert(target);
 run(melee,c,p,2);
 assert.equal(target.combatHealth,100,'a target who walked away was still hit');
 assert.equal(melee.snapshot().misses,1);
});

test('a target who walks IN during the wind-up is hit',()=>{
 const target=npc(1,0,COMBAT.range+4);
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 const timing=attackOf(ATTACKS[0].name);
 melee.request();
 run(melee,c,p,timing.windup*.5);
 const bucket=c.grid.get(c.cell(target.x,target.z));
 bucket.splice(bucket.indexOf(target),1);
 target.z=1.0;c.insert(target);
 run(melee,c,p,2);
 assert.equal(target.combatHealth,100-COMBAT.playerDamage,
  'somebody who stepped into a swing was not hit');
});

test('swings alternate between the two clips',()=>{
 const c=crowd([]),p=player(),melee=createMeleeCombat();
 const seen=[];
 for(let k=0;k<4;k++){
  melee.request();
  melee.update(1/60,c,p);
  seen.push(melee.swing.name);
  run(melee,c,p,1.5);                               // let it finish
 }
 assert.deepEqual(seen,[ATTACKS[0].name,ATTACKS[1].name,ATTACKS[0].name,ATTACKS[1].name],
  `the same arm was thrown every time: ${seen.join(',')}`);
});

test('a fatal hit goes through the simulation, not around it',()=>{
 const target=npc(1,0,1.0,{combatHealth:COMBAT.playerDamage});
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 melee.request();
 run(melee,c,p,2);
 assert.equal(target.combatDead,true);
 assert.equal(c.log.struck.length,1,'a kill did not go through crowd.strike');
 assert.equal(c.log.struck[0].id,target.id);
 // Thrown away from the player, not in an arbitrary direction.
 assert.ok(c.log.struck[0].dz>0,'the body was not thrown away from the punch');
 assert.notEqual(target.struck,undefined,'the simulation was not told the body is down');
});

test('a pedestrian on a crossing CAN be hit',()=>{
 // Excluding them made the middle of a scramble crossing a place where combat did nothing.
 const target=npc(1,0,1.0,{crossing:'scramble',queueKey:'k'});
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 melee.request();
 run(melee,c,p,2);
 assert.equal(target.combatHealth,100-COMBAT.playerDamage,
  'a pedestrian on a crossing could not be punched');
});

test('a light hit does not take a pedestrian off their crossing',()=>{
 // The signal group is the thing that must survive. A pedestrian stopped mid-crossing holds
 // their group, and the controller stops the clock for the whole map while any group is held.
 const target=npc(1,0,1.0,{crossing:'scramble',queueKey:'k'});
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 melee.request();
 run(melee,c,p,2);
 assert.equal(target.crossing,'scramble','a survivable punch cleared a crossing');
 assert.equal(target.queueKey,'k','a survivable punch cleared a queue key');
 assert.equal(c.log.left.length,0,'leave() was called for a hit nobody went down from');
 assert.notEqual(target.state,'fighting','a crossing pedestrian was stopped to fight');
});

test('a fatal hit on a crossing DOES use the formal leave path',()=>{
 const target=npc(1,0,1.0,{crossing:'scramble',queueKey:'k',combatHealth:COMBAT.playerDamage});
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 melee.request();
 run(melee,c,p,2);
 assert.equal(c.log.struck.length,1);
 assert.equal(target.crossing,null,'a downed body kept its crossing');
 assert.ok(c.log.left.includes(target.id),'the signal group was never released');
});

test('a witness event is reported once per swing, with a bounded radius',()=>{
 const target=npc(1,0,1.0);
 const events=[];
 const c=crowd([target]),p=player();
 const melee=createMeleeCombat({onWitness:e=>{events.push(e);return 7;}});
 melee.request();
 run(melee,c,p,2);
 assert.equal(events.length,1,`expected one witness event, got ${events.length}`);
 assert.ok(events[0].radius>0&&events[0].radius<=25,
  `a punch was broadcast ${events[0].radius} m`);
 assert.equal(events[0].victim,target.id);
 assert.equal(melee.snapshot().witnesses,7);
});

test('even a miss is witnessed, but more weakly',()=>{
 const hit=[],miss=[];
 {const target=npc(1,0,1.0),c=crowd([target]),p=player();
  const m=createMeleeCombat({onWitness:e=>{hit.push(e);return 0;}});
  m.request();run(m,c,p,2);}
 {const c=crowd([]),p=player();
  const m=createMeleeCombat({onWitness:e=>{miss.push(e);return 0;}});
  m.request();run(m,c,p,2);}
 assert.equal(hit.length,1);assert.equal(miss.length,1);
 assert.ok(miss[0].severity<hit[0].severity,
  'throwing a punch at nothing alarmed the street as much as connecting');
});

test('the NPC swings on the same model the player does',()=>{
 // A player who must respect a hit window while the crowd lands instantly is not fighting.
 const attacker=npc(1,0,1.0);
 const c=crowd([attacker]),p=player(),melee=createMeleeCombat();
 melee.request();
 run(melee,c,p,2);                                   // provoke them
 assert.equal(attacker.combatTarget,'player');
 const before=p.state.health;
 // One frame after they decide to swing, nothing has landed yet.
 c.time+=COMBAT.npcWindup;melee.update(1/60,c,p);
 assert.equal(p.state.health,before,'an NPC punch landed on the frame it started');
 run(melee,c,p,3);
 assert.ok(p.state.health<before,'the NPC never actually landed a punch');
});

test('a dead player cannot swing',()=>{
 const target=npc(1,0,1.0);
 const c=crowd([target]),p=player(),melee=createMeleeCombat();
 p.state.alive=false;
 melee.request();
 run(melee,c,p,2);
 assert.equal(target.combatHealth,100);
 assert.equal(melee.snapshot().swings,0);
});

test('nothing produces NaN or a stuck phase',()=>{
 const people=[];
 for(let i=0;i<20;i++)people.push(npc(i,Math.cos(i)*1.2,Math.sin(i)*1.2,
  {crossing:i%3?null:'scramble'}));
 const c=crowd(people),p=player(),melee=createMeleeCombat({onWitness:()=>3});
 for(let k=0;k<40;k++){melee.request();run(melee,c,p,.7);}
 run(melee,c,p,4);
 for(const q of people){
  for(const key of ['x','z','combatHealth','combatAction'])
   assert.ok(Number.isFinite(q[key]),`pedestrian ${q.id} has a non-finite ${key}`);
 }
 assert.ok(Number.isFinite(p.state.health));
 assert.equal(melee.phase,PHASE.IDLE,`combat ended stuck in ${melee.phase}`);
});
