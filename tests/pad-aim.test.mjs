// Owner's plan, item 3: the Switch Pro Controller's GTA aim -- ZL raises the gun and locks onto
// the nearest person in view (chest), a right-stick flick switches target (←/→) or goes to the
// head (↑), ZR attacks, and a gun never goes off on ZR without ZL. Letting go of ZL unlocks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createInputMap,flickOf,BUTTON,INPUT,controlHints} from '../src/player/input-map.mjs';
import {createArsenal,lockCandidates,ARSENAL} from '../src/player/arsenal.mjs';
import {WEAPONS} from '../src/player/weapons.mjs';

const pad=()=>({id:'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)',mapping:'standard',connected:true,axes:[0,0,0,0],
 buttons:Array.from({length:18},()=>({pressed:false,value:0}))});
const press=(p,name,v=1)=>{p.buttons[BUTTON[name]]={pressed:v>.5,value:v};};

test('item 3: a right-stick flick is reported once, and again only after the stick comes back',()=>{
 assert.deepEqual(flickOf(.9,0,true),{flick:'right',armed:false});
 assert.deepEqual(flickOf(-.9,.1,true),{flick:'left',armed:false});
 assert.deepEqual(flickOf(0,-.9,true),{flick:'up',armed:false},'up is the stick pushed away');
 assert.deepEqual(flickOf(0,.9,true),{flick:'down',armed:false});
 assert.equal(flickOf(.9,0,false).flick,null,'held out, it does not repeat');
 assert.equal(flickOf(.5,0,true).flick,null,'a small push is not a flick');
 const map=createInputMap(),p=pad();
 p.axes[2]=.95;assert.equal(map.poll(p,1/60,'foot').flick,'right');
 assert.equal(map.poll(p,1/60,'foot').flick,null,'held: once');
 p.axes[2]=0;map.poll(p,1/60,'foot');p.axes[2]=.95;assert.equal(map.poll(p,1/60,'foot').flick,'right','back to rest and out again: again');
 p.axes[2]=0;map.poll(p,1/60,'car');p.axes[2]=.95;assert.equal(map.poll(p,1/60,'car').flick,null,'no flicks in a car');
 assert.ok(INPUT.flick>INPUT.rest);
});

test('item 3: the Pro Con hint names ZL for the lock-on and ZR for the attack',()=>{
 const h=controlHints('switch');
 assert.match(h,/ZL 構える・ロックオン/);assert.match(h,/ZR 攻撃/);assert.match(h,/右スティック弾き/);
});

// A street of stand-ins, looked at from the origin along +z (the screen's right is world -x).
function scene(spots){
 const people=spots.map(([x,z],i)=>({id:i+1,x,z,active:true,controlled:false,archetype:'office',state:'walking',combatHealth:100}));
 const hits=[];
 const crowd={time:0,grid:new Map(),flee:()=>false,say:()=>true};
 const w={solid:()=>false,ground:()=>0,cars:[],dimsOf:()=>null,people:()=>people.filter(p=>p.active),bodyOf:()=>({y:0,height:1.76}),
  skip:p=>!p.active,clear:()=>true,crowd,wound:(p,hit)=>{hits.push({id:p.id,head:hit.head});return 'hit';},bleed:()=>{},muzzle:()=>null};
 const state={x:0,y:0,z:0,heading:0,bodyHeading:0,speed:0,alive:true};
 const camera={position:{x:0,y:1.5,z:0},direction:{x:0,y:0,z:1}};
 return {people,hits,w,state,player:{state},camera};
}
const step=(a,sc,dt=1/60)=>a.frame(dt,{player:sc.player,world:sc.w,camera:sc.camera,pad:true});

test('item 3: ZR without ZL fires no gun (pistol or automatic) and throws no punch; with ZL it fires',()=>{
 const sc=scene([[0,10]]),a=createArsenal();a.select(2);
 assert.equal(a.trigger({pad:true}),true,'the press is taken (no punch instead)');
 for(let i=0;i<30;i++)step(a,sc);
 assert.equal(a.snapshot().shots,0,'the pistol went off on ZR alone');
 assert.equal(sc.state.aim,0,'ZR alone raised the gun');
 a.select(4);a.hold(true,{pad:true});a.trigger({pad:true});
 for(let i=0;i<60;i++)step(a,sc);
 assert.equal(a.snapshot().shots,0,'the automatic went off on ZR alone');
 // ZL now, ZR still held: the automatic fires.
 a.aim(true,{pad:true});
 for(let i=0;i<60;i++)step(a,sc);
 assert.ok(a.snapshot().shots>3,'held ZR with ZL did not fire the automatic');
 a.hold(false,{pad:true});a.aim(false,{pad:true});
 // The fists: ZR is a punch -- trigger() is not the arsenal's (false), so the melee takes it.
 a.select(1);assert.equal(a.trigger({pad:true}),false);
 // The mouse keeps its own rule: a click raises and fires.
 const m=scene([[0,10]]),b=createArsenal();b.select(2);b.trigger();
 for(let i=0;i<5;i++)b.frame(1/60,{player:m.player,world:m.w,camera:m.camera});
 assert.equal(b.snapshot().shots,1);
});

test('item 3: ZL locks the person nearest the centre of the view, at the chest; the round finds them',()=>{
 const sc=scene([[3,12],[-.5,15],[8,6]]),a=createArsenal();a.select(2);
 a.aim(true,{pad:true});step(a,sc);
 assert.deepEqual([a.lock?.id,a.lock?.part],[2,'chest']);
 assert.ok(Math.abs(sc.state.aimTarget.y-ARSENAL.chest)<1e-9);
 a.trigger({pad:true});step(a,sc);
 assert.deepEqual(sc.hits,[{id:2,head:false}]);
 // A flick up: the head.
 a.lockFlick('up');step(a,sc,WEAPONS.pistol.refire);
 assert.equal(a.lock.part,'head');a.trigger({pad:true});step(a,sc);
 assert.deepEqual(sc.hits.at(-1),{id:2,head:true},'the head lock did not take a headshot');
 a.lockFlick('down');step(a,sc);assert.equal(a.lock.part,'chest');
 // Let go of ZL: unlocked.
 a.aim(false,{pad:true});step(a,sc);assert.equal(a.lock,null);assert.equal(sc.state.aim,0);
});

test('item 3: a flick right takes the next person to the right, left the next to the left; none past the end',()=>{
 // Looking along +z, the screen's right is world -x.
 const sc=scene([[0,12],[-4,12],[-8,12],[4,12]]),a=createArsenal();a.select(2);
 a.aim(true,{pad:true});step(a,sc);assert.equal(a.lock.id,1);
 const bearing=id=>lockCandidates(sc.state,sc.camera,sc.w).find(c=>c.p.id===id).bearing;
 assert.ok(bearing(2)>0&&bearing(4)<0,'the bearing sign is not the screen\'s right');
 a.lockFlick('right');step(a,sc);assert.equal(a.lock.id,2);
 a.lockFlick('right');step(a,sc);assert.equal(a.lock.id,3);
 a.lockFlick('right');step(a,sc);assert.equal(a.lock.id,3,'past the last one it stays');
 a.lockFlick('left');step(a,sc);a.lockFlick('left');step(a,sc);a.lockFlick('left');step(a,sc);assert.equal(a.lock.id,4);
 assert.equal(a.snapshot().switchedLocks,5);
});

test('item 3: the lock holds as they move, retakes when they drop, and ignores kids and the dead',()=>{
 const sc=scene([[0,10],[2,14]]),a=createArsenal();a.select(2);
 sc.people.push({id:9,x:0,z:4,active:true,controlled:false,archetype:'kid'});
 a.aim(true,{pad:true});step(a,sc);assert.equal(a.lock.id,1,'a kid was locked');
 // They walk off across the view: still them (the camera keeps them in, in the scene).
 sc.people[0].x=-6;step(a,sc);assert.equal(a.lock.id,1);
 sc.people[0].combatDead=true;step(a,sc);assert.equal(a.lock.id,2,'no retake after the target dropped');
 sc.people[1].x=80;step(a,sc);assert.equal(a.lock,null,'held a lock out of range');
});

test('item 3: the gyro turned past the break lets go into free aim until ZL again; the mouse never hard-locks',()=>{
 const sc=scene([[0,10]]),a=createArsenal();a.select(2);
 a.aim(true,{pad:true});step(a,sc);assert.equal(a.lock.id,1);
 a.lockGyro(.02,0);step(a,sc);assert.equal(a.lock.id,1,'a small turn broke the lock');
 a.lockGyro(ARSENAL.gyroBreak,0);step(a,sc);assert.equal(a.lock,null);
 step(a,sc);assert.equal(a.lock,null,'retaken while the gyro is aiming');
 assert.equal(sc.state.aim,1,'free aim put the gun down');
 a.aim(false,{pad:true});a.aim(true,{pad:true});step(a,sc);assert.equal(a.lock.id,1,'ZL again did not lock');
 const m=scene([[0,10]]),b=createArsenal();b.select(2);b.aim(true);
 b.frame(1/60,{player:m.player,world:m.w,camera:m.camera});assert.equal(b.lock,null,'the mouse hard-locked');
});
